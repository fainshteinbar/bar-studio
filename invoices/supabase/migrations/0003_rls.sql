-- 0003 · Row Level Security.
-- Every table has RLS on. Issued documents and their lines are read-only here (layer 1 of the lock);
-- the triggers in 0004 refuse the same changes for every role (layer 2).
-- Policies are created only when missing, so this file is safe to paste again.
-- To change an existing policy later, use alter policy in a new migration.

create or replace function app.ensure_policy(p_table regclass, p_name text, p_definition text)
returns void language plpgsql set search_path = ''
as $$
declare
  v_schema text;
  v_table text;
begin
  select n.nspname, c.relname into v_schema, v_table
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where c.oid = p_table;
  if not exists (select 1 from pg_catalog.pg_policies
                  where schemaname = v_schema and tablename = v_table and policyname = p_name) then
    execute format('create policy %I on %s %s', p_name, p_table, p_definition);
  end if;
end $$;
revoke all on function app.ensure_policy(regclass, text, text) from public, anon, authenticated;

alter table public.settings enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.documents enable row level security;
alter table public.document_items enable row level security;
alter table public.audit_log enable row level security;
alter table app.counters enable row level security;   -- no policies: only app.next_number() reaches it
alter table app.migrations enable row level security;

-- settings: read and edit the single row. It is created by the seed, never from the app.
select app.ensure_policy('public.settings', 'settings_select',
  'for select to authenticated using ((select app.is_owner()))');
select app.ensure_policy('public.settings', 'settings_update',
  'for update to authenticated using ((select app.is_owner())) with check ((select app.is_owner()))');

-- clients and projects: full access for the owner.
select app.ensure_policy('public.clients', 'clients_owner',
  'for all to authenticated using ((select app.is_owner())) with check ((select app.is_owner()))');
select app.ensure_policy('public.projects', 'projects_owner',
  'for all to authenticated using ((select app.is_owner())) with check ((select app.is_owner()))');

-- documents: read everything; create, edit and remove drafts only.
-- A row can never be written as issued or with a number from the app; only issue_document() does that.
select app.ensure_policy('public.documents', 'documents_select',
  'for select to authenticated using ((select app.is_owner()))');
select app.ensure_policy('public.documents', 'documents_insert_draft',
  'for insert to authenticated with check ((select app.is_owner()) and status = ''draft'' and number is null)');
select app.ensure_policy('public.documents', 'documents_update_draft',
  'for update to authenticated using ((select app.is_owner()) and status = ''draft'') '
  'with check ((select app.is_owner()) and status = ''draft'' and number is null)');
select app.ensure_policy('public.documents', 'documents_delete_draft',
  'for delete to authenticated using ((select app.is_owner()) and status = ''draft'')');

-- document_items: read everything; write only while the parent document is a draft.
select app.ensure_policy('public.document_items', 'items_select',
  'for select to authenticated using ((select app.is_owner()))');
select app.ensure_policy('public.document_items', 'items_write_draft',
  'for all to authenticated '
  'using ((select app.is_owner()) and exists (select 1 from public.documents d where d.id = document_id and d.status = ''draft'')) '
  'with check ((select app.is_owner()) and exists (select 1 from public.documents d where d.id = document_id and d.status = ''draft''))');

-- audit_log: read only. Rows are written by a trigger function that runs as the table owner.
select app.ensure_policy('public.audit_log', 'audit_select',
  'for select to authenticated using ((select app.is_owner()))');

insert into app.migrations (name) values ('0003_rls') on conflict do nothing;
