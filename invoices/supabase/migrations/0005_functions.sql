-- 0005 · Functions: numbering, issuing and the document actions the app calls (RPC).
-- Every public function runs as the table owner (security definer), checks the owner first,
-- pins search_path and names every object with its schema. Safe to paste again.
-- Errors carry a hint the app can switch on: locked, date_order, balance, validation, forbidden.

-- Internal helpers (not reachable from the API)
create or replace function app.today() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'Asia/Bangkok')::date $$;

create or replace function app.prefix(p_kind public.document_kind) returns text
language sql immutable set search_path = ''
as $$ select case p_kind when 'invoice' then 'INV' when 'receipt' then 'REC' when 'credit_note' then 'CRN' else 'QUO' end $$;

create or replace function app.require_owner() returns void
language plpgsql stable set search_path = ''
as $$
begin
  if not app.is_owner() then
    raise exception 'Not allowed.' using errcode = '42501', hint = 'forbidden';
  end if;
end $$;

-- "50/50" -> 2, "30/30/40" -> 3, "40% / 60%" -> 2; anything else -> null.
create or replace function app.payment_parts(p_terms text) returns int
language sql immutable set search_path = ''
as $$
  select case when p_terms ~ '^\s*[0-9]+([.][0-9]+)?\s*%?(\s*/\s*[0-9]+([.][0-9]+)?\s*%?)+\s*$'
              then array_length(string_to_array(p_terms, '/'), 1) end
$$;

-- The one place a number is born. One statement: the upsert takes a row lock on (kind, year) that is
-- held until the issuing transaction ends, so concurrent issues queue up and a failed issue rolls the
-- counter back with it. No sequences: they are not transactional and would leave gaps.
create or replace function app.next_number(p_kind public.document_kind, p_year int) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_no int;
begin
  insert into app.counters as c (kind, year, last_no) values (p_kind, p_year, 1)
  on conflict (kind, year) do update set last_no = c.last_no + 1
  returning c.last_no into v_no;
  return format('%s-%s-%s', app.prefix(p_kind), p_year, lpad(v_no::text, 4, '0'));
end $$;

-- Issued totals of an invoice
create or replace function app.invoice_totals(p_invoice_id uuid, out paid numeric, out credited numeric)
language sql stable set search_path = ''
as $$
  select coalesce(sum(amount) filter (where kind = 'receipt'), 0),
         coalesce(sum(amount) filter (where kind = 'credit_note'), 0)
    from public.documents
   where parent_id = p_invoice_id and status = 'issued'
$$;

revoke all on all functions in schema app from public, anon, authenticated;
grant execute on function app.is_owner() to authenticated;
grant execute on function app.today() to authenticated;   -- views use it; it only reads the clock

-- issue_document: validates, numbers, freezes and locks a draft, all in one transaction.
create or replace function public.issue_document(p_id uuid) returns public.documents
language plpgsql security definer set search_path = ''
as $$
declare
  d public.documents;
  inv public.documents;
  src public.documents;
  s public.settings;
  c public.clients;
  p public.projects;
  v_date date;
  v_year int;
  v_amount numeric(14,2);
  v_paid numeric;
  v_credited numeric;
  v_last date;
  v_number text;
begin
  perform app.require_owner();

  select * into d from public.documents where id = p_id for update;
  if not found then
    raise exception 'Document not found.' using errcode = 'P0002', hint = 'validation';
  end if;
  if d.status <> 'draft' then
    raise exception 'Document % is already issued.', d.number using errcode = 'P0001', hint = 'locked';
  end if;
  -- Lock the invoice too: two receipts for the same invoice are issued one after the other.
  if d.parent_id is not null then
    select * into inv from public.documents where id = d.parent_id for update;
  end if;

  v_date := coalesce(d.issue_date, app.today());
  v_year := extract(year from v_date)::int;

  select * into s from public.settings where id;
  if not found then
    raise exception 'Settings are missing. Run seed/settings.sql once.' using errcode = 'P0001', hint = 'validation';
  end if;
  select * into c from public.clients where id = d.client_id;
  if d.project_id is not null then
    select * into p from public.projects where id = d.project_id;
  end if;

  -- Amount
  if d.kind = 'receipt' then
    v_amount := d.amount;
    if v_amount is null or v_amount <= 0 then
      raise exception 'A receipt needs an amount above zero.' using errcode = 'P0001', hint = 'validation';
    end if;
    if d.payment_method is null or d.payment_date is null then
      raise exception 'A receipt needs a payment method and the date the payment arrived.' using errcode = 'P0001', hint = 'validation';
    end if;
  else
    select coalesce(sum(line_total), 0) into v_amount from public.document_items where document_id = d.id;
    if v_amount <= 0 then
      raise exception 'Add at least one line with a price before issuing.' using errcode = 'P0001', hint = 'validation';
    end if;
  end if;

  -- Receipts and credit notes against their invoice
  if d.kind in ('receipt', 'credit_note') then
    if inv.status <> 'issued' then
      raise exception 'Issue invoice first: a % can only refer to an issued invoice.', replace(d.kind::text, '_', ' ')
        using errcode = 'P0001', hint = 'validation';
    end if;
    if inv.currency <> d.currency then
      raise exception 'Currency % does not match invoice % (%).', d.currency, inv.number, inv.currency
        using errcode = 'P0001', hint = 'validation';
    end if;
    if inv.client_id <> d.client_id then
      raise exception 'The client does not match invoice %.', inv.number using errcode = 'P0001', hint = 'validation';
    end if;
    -- The payment itself may predate the invoice (an advance); the document may not.
    if v_date < inv.issue_date then
      raise exception 'Issue date % is before invoice % (%).', to_char(v_date, 'DD.MM.YYYY'), inv.number, to_char(inv.issue_date, 'DD.MM.YYYY')
        using errcode = 'P0001', hint = 'date_order';
    end if;
    select t.paid, t.credited into v_paid, v_credited from app.invoice_totals(inv.id) t;
    if d.kind = 'receipt' and v_amount > inv.amount - v_credited - v_paid then
      raise exception 'Receipt amount % is more than the open balance % on invoice %.', v_amount, inv.amount - v_credited - v_paid, inv.number
        using errcode = 'P0001', hint = 'balance';
    end if;
    if d.kind = 'credit_note' and v_amount > inv.amount - v_credited then
      raise exception 'Credit amount % is more than what is left to credit on invoice % (%).', v_amount, inv.number, inv.amount - v_credited
        using errcode = 'P0001', hint = 'balance';
    end if;
  end if;

  if d.source_id is not null then
    select * into src from public.documents where id = d.source_id and status = 'issued';
  end if;

  -- Number first (this waits for any concurrent issue of the same kind and year), then check the
  -- date order against everything already committed, so numbers and dates always rise together.
  v_number := app.next_number(d.kind, v_year);
  select max(issue_date) into v_last
    from public.documents
   where kind = d.kind and status = 'issued'
     and issue_date >= make_date(v_year, 1, 1) and issue_date < make_date(v_year + 1, 1, 1);
  if v_last is not null and v_date < v_last then
    raise exception 'Issue date % is before the last issued % (%). Use % or later.',
      to_char(v_date, 'DD.MM.YYYY'), app.prefix(d.kind), to_char(v_last, 'DD.MM.YYYY'), to_char(v_last, 'DD.MM.YYYY')
      using errcode = 'P0001', hint = 'date_order';
  end if;

  perform set_config('app.issuing', 'on', true);
  update public.documents set
    status = 'issued',
    number = v_number,
    issued_at = now(),
    issue_date = v_date,
    amount = v_amount,
    due_date = case when kind = 'invoice' then coalesce(due_date, v_date + s.default_due_days) else due_date end,
    valid_until = case when kind = 'quote' then coalesce(valid_until, v_date + s.default_quote_valid_days) else valid_until end,
    snapshot = jsonb_build_object(
      'supplier', jsonb_build_object(
        'name', s.supplier_name, 'trading_as', s.trading_as, 'address', s.supplier_address,
        'email', s.supplier_email, 'phone', s.supplier_phone,
        'identifier', case when s.show_identifier and length(btrim(coalesce(s.identifier_value, ''))) > 0
                           then jsonb_build_object('label', s.identifier_label, 'value', s.identifier_value) end),
      'client', jsonb_build_object(
        'display_name', c.display_name, 'legal_name', c.legal_name, 'identifier', c.identifier,
        'contact', c.contact, 'email', c.email, 'address', c.address),
      'project', case when p.id is not null then jsonb_build_object(
        'description', p.description, 'payment_terms', p.payment_terms, 'total', p.total) end,
      'footer_text', s.footer_text,
      'terms_text', case d.kind when 'invoice' then s.payment_terms_text when 'quote' then s.quote_terms_text end,
      'parent', case when inv.id is not null then jsonb_build_object(
        'number', inv.number, 'issue_date', inv.issue_date, 'amount', inv.amount) end,
      'source', case when src.id is not null then jsonb_build_object('number', src.number, 'kind', src.kind) end,
      -- What a receipt prints as paid so far and still open, frozen at the moment of issue
      'balance', case when d.kind = 'receipt' then jsonb_build_object(
        'invoice_total', inv.amount, 'credited', v_credited, 'paid_before', v_paid,
        'paid_now', v_amount, 'open_after', inv.amount - v_credited - v_paid - v_amount) end)
  where id = d.id
  returning * into d;
  perform set_config('app.issuing', 'off', true);

  return d;
end $$;

-- issue_preview: what issuing would do right now, without doing it. Read only.
create or replace function public.issue_preview(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  d public.documents;
  inv public.documents;
  v_date date;
  v_year int;
  v_last date;
  v_next int;
  v_amount numeric;
  v_paid numeric;
  v_credited numeric;
begin
  perform app.require_owner();
  select * into d from public.documents where id = p_id;
  if not found then
    raise exception 'Document not found.' using errcode = 'P0002', hint = 'validation';
  end if;
  if d.status <> 'draft' then
    return jsonb_build_object('issued', true, 'number', d.number);
  end if;
  v_date := coalesce(d.issue_date, app.today());
  v_year := extract(year from v_date)::int;
  select coalesce(max(last_no), 0) + 1 into v_next from app.counters where kind = d.kind and year = v_year;
  select max(issue_date) into v_last from public.documents
   where kind = d.kind and status = 'issued'
     and issue_date >= make_date(v_year, 1, 1) and issue_date < make_date(v_year + 1, 1, 1);
  if d.parent_id is not null then
    select * into inv from public.documents where id = d.parent_id;
    select t.paid, t.credited into v_paid, v_credited from app.invoice_totals(inv.id) t;
  end if;
  if d.kind = 'receipt' then
    v_amount := d.amount;
  else
    select coalesce(sum(line_total), 0) into v_amount from public.document_items where document_id = d.id;
  end if;
  return jsonb_build_object(
    'issued', false,
    'issue_date', v_date,
    'next_number', format('%s-%s-%s', app.prefix(d.kind), v_year, lpad(v_next::text, 4, '0')),
    'min_issue_date', nullif(greatest(coalesce(v_last, '-infinity'::date), coalesce(inv.issue_date, '-infinity'::date)), '-infinity'::date),
    'amount', v_amount,
    'open_balance', case when inv.id is not null then inv.amount - v_credited - v_paid end);
end $$;

-- duplicate_document: a new draft from any document, lines included.
create or replace function public.duplicate_document(p_id uuid) returns public.documents
language plpgsql security definer set search_path = ''
as $$
declare
  d public.documents;
  n public.documents;
begin
  perform app.require_owner();
  select * into d from public.documents where id = p_id;
  if not found then
    raise exception 'Document not found.' using errcode = 'P0002', hint = 'validation';
  end if;
  insert into public.documents (kind, client_id, project_id, parent_id, source_id, currency, amount,
                                payment_method, label_he, label_en, notes_he, notes_en)
  values (d.kind, d.client_id, d.project_id, d.parent_id, d.id, d.currency,
          case when d.kind = 'receipt' then d.amount end,
          d.payment_method, d.label_he, d.label_en, d.notes_he, d.notes_en)
  returning * into n;
  insert into public.document_items (document_id, position, description_he, description_en, qty, unit_price)
  select n.id, i.position, i.description_he, i.description_en, i.qty, i.unit_price
    from public.document_items i where i.document_id = d.id order by i.position;
  return n;
end $$;

-- create_receipt_from_invoice: a draft receipt in one click. Labels default to the payment terms,
-- e.g. "מקדמה 1 מתוך 2" / "Advance payment 1 of 2" for a 50/50 project.
create or replace function public.create_receipt_from_invoice(
  p_invoice_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_payment_date date,
  p_label_he text default null,
  p_label_en text default null
) returns public.documents
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.documents;
  n public.documents;
  v_terms text;
  v_parts int;
  v_seq int;
  v_paid numeric;
  v_credited numeric;
  v_balance numeric;
  v_he text := nullif(btrim(p_label_he), '');
  v_en text := nullif(btrim(p_label_en), '');
begin
  perform app.require_owner();
  select * into inv from public.documents where id = p_invoice_id;
  if not found or inv.kind <> 'invoice' then
    raise exception 'Invoice not found.' using errcode = 'P0002', hint = 'validation';
  end if;
  if inv.status <> 'issued' then
    raise exception 'Issue invoice first: a receipt can only refer to an issued invoice.' using errcode = 'P0001', hint = 'validation';
  end if;
  select t.paid, t.credited into v_paid, v_credited from app.invoice_totals(inv.id) t;
  v_balance := inv.amount - v_credited - v_paid;
  if p_amount is null or p_amount <= 0 then
    raise exception 'A receipt needs an amount above zero.' using errcode = 'P0001', hint = 'validation';
  end if;
  if p_amount > v_balance then
    raise exception 'Receipt amount % is more than the open balance % on invoice %.', p_amount, v_balance, inv.number
      using errcode = 'P0001', hint = 'balance';
  end if;

  if v_he is null and v_en is null then
    select pr.payment_terms into v_terms from public.projects pr where pr.id = inv.project_id;
    v_parts := app.payment_parts(v_terms);
    select count(*) + 1 into v_seq from public.documents where parent_id = inv.id and kind = 'receipt';
    if v_parts >= 2 and v_seq < v_parts then
      v_he := format('מקדמה %s מתוך %s', v_seq, v_parts);
      v_en := format('Advance payment %s of %s', v_seq, v_parts);
    elsif v_parts >= 2 then
      v_he := format('תשלום %s מתוך %s', v_seq, v_parts);
      v_en := format('Payment %s of %s', v_seq, v_parts);
    elsif p_amount = v_balance and v_paid = 0 then
      v_he := 'תשלום מלא';
      v_en := 'Full payment';
    elsif p_amount = v_balance then
      v_he := 'תשלום יתרה';
      v_en := 'Balance payment';
    else
      v_he := 'תשלום חלקי';
      v_en := 'Partial payment';
    end if;
  end if;

  insert into public.documents (kind, client_id, project_id, parent_id, currency, amount,
                                payment_method, payment_date, label_he, label_en)
  values ('receipt', inv.client_id, inv.project_id, inv.id, inv.currency, p_amount,
          p_method, p_payment_date, v_he, v_en)
  returning * into n;
  return n;
end $$;

-- convert_quote_to_invoice: an issued quote becomes a draft invoice with the same lines.
create or replace function public.convert_quote_to_invoice(p_quote_id uuid) returns public.documents
language plpgsql security definer set search_path = ''
as $$
declare
  q public.documents;
  n public.documents;
begin
  perform app.require_owner();
  select * into q from public.documents where id = p_quote_id;
  if not found or q.kind <> 'quote' then
    raise exception 'Quote not found.' using errcode = 'P0002', hint = 'validation';
  end if;
  if q.status <> 'issued' then
    raise exception 'Issue the quote before turning it into an invoice.' using errcode = 'P0001', hint = 'validation';
  end if;
  insert into public.documents (kind, client_id, project_id, source_id, currency, notes_he, notes_en)
  values ('invoice', q.client_id, q.project_id, q.id, q.currency, q.notes_he, q.notes_en)
  returning * into n;
  insert into public.document_items (document_id, position, description_he, description_en, qty, unit_price)
  select n.id, i.position, i.description_he, i.description_en, i.qty, i.unit_price
    from public.document_items i where i.document_id = q.id order by i.position;
  return n;
end $$;

-- mark_backup: called by the app right after a full JSON export. Server time, not device time.
create or replace function public.mark_backup() returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  perform app.require_owner();
  update public.settings set last_backup_at = now() where id returning last_backup_at into v_at;
  return v_at;
end $$;

revoke all on function public.issue_document(uuid) from public, anon, authenticated;
revoke all on function public.issue_preview(uuid) from public, anon, authenticated;
revoke all on function public.duplicate_document(uuid) from public, anon, authenticated;
revoke all on function public.create_receipt_from_invoice(uuid, numeric, public.payment_method, date, text, text) from public, anon, authenticated;
revoke all on function public.convert_quote_to_invoice(uuid) from public, anon, authenticated;
revoke all on function public.mark_backup() from public, anon, authenticated;
grant execute on function public.issue_document(uuid) to authenticated;
grant execute on function public.issue_preview(uuid) to authenticated;
grant execute on function public.duplicate_document(uuid) to authenticated;
grant execute on function public.create_receipt_from_invoice(uuid, numeric, public.payment_method, date, text, text) to authenticated;
grant execute on function public.convert_quote_to_invoice(uuid) to authenticated;
grant execute on function public.mark_backup() to authenticated;

insert into app.migrations (name) values ('0005_functions') on conflict do nothing;
