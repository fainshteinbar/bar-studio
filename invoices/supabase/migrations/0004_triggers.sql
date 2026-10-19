-- 0004 · Triggers: the second lock layer, the audit log, counter protection.
-- Triggers fire for every role, including postgres in the SQL Editor and security definer functions,
-- which RLS does not cover. Safe to paste again (create or replace).

-- updated_at on plain tables
create or replace function app.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace trigger settings_touch before update on public.settings
  for each row execute function app.touch_updated_at();
create or replace trigger clients_touch before update on public.clients
  for each row execute function app.touch_updated_at();
create or replace trigger projects_touch before update on public.projects
  for each row execute function app.touch_updated_at();

-- documents: issued rows never change and never go away. Only issue_document() may issue.
create or replace function app.guard_document() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_issuing boolean := coalesce(current_setting('app.issuing', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.status = 'issued' then
      raise exception 'Document % is issued and cannot be deleted. Use a credit note.', old.number
        using errcode = 'P0001', hint = 'locked';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.number is not null or new.issued_at is not null then
      raise exception 'New documents start as drafts without a number.' using errcode = 'P0001', hint = 'locked';
    end if;
  else
    if old.status = 'issued' then
      raise exception 'Document % is issued and cannot be changed. Use a credit note.', old.number
        using errcode = 'P0001', hint = 'locked';
    end if;
    if new.kind <> old.kind then
      raise exception 'The kind of a document cannot change.' using errcode = 'P0001';
    end if;
    if new.status = 'issued' and not v_issuing then
      raise exception 'Documents are issued only through issue_document().' using errcode = 'P0001', hint = 'locked';
    end if;
    new.updated_at := now();
  end if;

  if not v_issuing then
    new.snapshot := null;   -- a snapshot exists only from the moment of issue
  end if;
  new.parent_kind := case when new.parent_id is null then null else 'invoice'::public.document_kind end;
  return new;
end $$;

create or replace trigger documents_guard before insert or update or delete on public.documents
  for each row execute function app.guard_document();

-- document_items: frozen once the document is issued; receipts carry no lines.
-- security definer so the check always sees the real parent row.
create or replace function app.guard_document_item() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.document_status;
  v_kind public.document_kind;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select status into v_status from public.documents where id = old.document_id;
    if v_status = 'issued' then
      raise exception 'The lines of an issued document cannot change.' using errcode = 'P0001', hint = 'locked';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select status, kind into v_status, v_kind from public.documents where id = new.document_id;
    if v_status = 'issued' then
      raise exception 'The lines of an issued document cannot change.' using errcode = 'P0001', hint = 'locked';
    end if;
    if v_kind = 'receipt' then
      raise exception 'A receipt has no line items; its amount is the payment.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  return old;
end $$;

create or replace trigger document_items_guard before insert or update or delete on public.document_items
  for each row execute function app.guard_document_item();

-- audit_log: one row per change, written as the table owner.
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  insert into public.audit_log (actor_email, actor_role, table_name, row_id, action, old_row, new_row)
  values (auth.jwt() ->> 'email', coalesce(auth.jwt() ->> 'role', session_user::text), tg_table_name,
          coalesce(v_new ->> 'id', v_old ->> 'id'), tg_op, v_old, v_new);
  return null;
end $$;

create or replace trigger settings_audit after insert or update or delete on public.settings
  for each row execute function app.audit();
create or replace trigger clients_audit after insert or update or delete on public.clients
  for each row execute function app.audit();
create or replace trigger projects_audit after insert or update or delete on public.projects
  for each row execute function app.audit();
create or replace trigger documents_audit after insert or update or delete on public.documents
  for each row execute function app.audit();
create or replace trigger document_items_audit after insert or update or delete on public.document_items
  for each row execute function app.audit();

-- audit_log and counters: no edits, no removals, for anyone.
create or replace function app.deny() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% on %.% is not allowed.', tg_op, tg_table_schema, tg_table_name
    using errcode = 'P0001', hint = 'locked';
end $$;

create or replace trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function app.deny();
create or replace trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function app.deny();

-- A counter only ever moves forward by exactly one.
create or replace function app.guard_counter() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.last_no <> 1 then
      raise exception 'A new counter starts at 1.' using errcode = 'P0001', hint = 'locked';
    end if;
    return new;
  end if;
  if new.kind <> old.kind or new.year <> old.year or new.last_no <> old.last_no + 1 then
    raise exception 'Document counters only move forward by one.' using errcode = 'P0001', hint = 'locked';
  end if;
  return new;
end $$;

create or replace trigger counters_forward before insert or update on app.counters
  for each row execute function app.guard_counter();
create or replace trigger counters_no_delete before delete on app.counters
  for each row execute function app.deny();
create or replace trigger counters_no_truncate before truncate on app.counters
  for each statement execute function app.deny();

revoke all on all functions in schema app from public, anon, authenticated;
grant execute on function app.is_owner() to authenticated;

insert into app.migrations (name) values ('0004_triggers') on conflict do nothing;
