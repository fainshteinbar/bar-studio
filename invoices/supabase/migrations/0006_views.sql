-- 0006 · Views: invoice status and balance, quote status, dashboard, backup banner.
-- security_invoker = true on every view, so the caller's RLS applies (a plain view would read as its owner).
-- Status is always derived from issued documents; no stored status field can drift. Safe to paste again.

create or replace view public.v_invoice_balances with (security_invoker = true) as
select i.id,
       i.number,
       i.client_id,
       i.project_id,
       i.currency,
       i.issue_date,
       i.due_date,
       i.amount,
       t.paid,
       t.credited,
       i.amount - t.credited - t.paid as balance,
       case when t.credited >= i.amount then 'cancelled'
            when t.paid >= i.amount - t.credited then 'paid'
            when t.paid > 0 then 'partially_paid'
            else 'open' end as invoice_status,
       (t.credited < i.amount and t.paid < i.amount - t.credited
        and i.due_date is not null and i.due_date < app.today()) as is_overdue
  from public.documents i
  cross join lateral (
    select coalesce(sum(x.amount) filter (where x.kind = 'receipt'), 0)::numeric(14,2) as paid,
           coalesce(sum(x.amount) filter (where x.kind = 'credit_note'), 0)::numeric(14,2) as credited
      from public.documents x
     where x.parent_id = i.id and x.status = 'issued') t
 where i.kind = 'invoice' and i.status = 'issued';

create or replace view public.v_quote_status with (security_invoker = true) as
select q.id,
       q.number,
       q.client_id,
       q.currency,
       q.issue_date,
       q.valid_until,
       q.amount,
       (select min(inv.number) from public.documents inv
         where inv.source_id = q.id and inv.kind = 'invoice' and inv.status = 'issued') as invoice_number,
       case when exists (select 1 from public.documents inv
                          where inv.source_id = q.id and inv.kind = 'invoice' and inv.status = 'issued') then 'accepted'
            when q.valid_until is not null and q.valid_until < app.today() then 'expired'
            else 'open' end as quote_status
  from public.documents q
 where q.kind = 'quote' and q.status = 'issued';

-- Every document with what a list needs: client name, a display amount for drafts, derived status.
create or replace view public.v_documents_recent with (security_invoker = true) as
select d.id,
       d.kind,
       d.status,
       d.number,
       d.client_id,
       c.display_name as client_name,
       d.project_id,
       d.parent_id,
       par.number as parent_number,
       d.currency,
       coalesce(d.amount, (select sum(it.line_total) from public.document_items it where it.document_id = d.id), 0)::numeric(14,2) as display_amount,
       d.issue_date,
       d.due_date,
       d.valid_until,
       d.payment_date,
       d.label_he,
       d.label_en,
       d.issued_at,
       d.created_at,
       d.updated_at,
       case when d.status = 'draft' then 'draft'
            when d.kind = 'invoice' then b.invoice_status
            when d.kind = 'quote' then qs.quote_status
            else 'issued' end as display_status,
       b.balance
  from public.documents d
  join public.clients c on c.id = d.client_id
  left join public.documents par on par.id = d.parent_id
  left join public.v_invoice_balances b on b.id = d.id
  left join public.v_quote_status qs on qs.id = d.id
 order by coalesce(d.issued_at, d.updated_at) desc;

create or replace view public.v_client_open_balance with (security_invoker = true) as
select b.client_id,
       c.display_name as client_name,
       b.currency,
       sum(b.balance)::numeric(14,2) as open_balance,
       count(*) as open_invoices,
       count(*) filter (where b.is_overdue) as overdue_invoices
  from public.v_invoice_balances b
  join public.clients c on c.id = b.client_id
 where b.invoice_status in ('open', 'partially_paid')
 group by b.client_id, c.display_name, b.currency;

-- Money received, by the date it arrived (payment_date), per currency, no conversion.
create or replace view public.v_received_monthly with (security_invoker = true) as
select date_trunc('month', r.payment_date)::date as month,
       r.currency,
       sum(r.amount)::numeric(14,2) as received,
       count(*) as receipts
  from public.documents r
 where r.kind = 'receipt' and r.status = 'issued'
 group by 1, 2;

create or replace view public.v_received_yearly with (security_invoker = true) as
select extract(year from r.payment_date)::int as year,
       r.currency,
       sum(r.amount)::numeric(14,2) as received,
       count(*) as receipts
  from public.documents r
 where r.kind = 'receipt' and r.status = 'issued'
 group by 1, 2;

-- Backup banner: show it when 30 days passed or anything was issued since the last full export.
create or replace view public.v_backup_status with (security_invoker = true) as
select s.last_backup_at,
       case when s.last_backup_at is not null then app.today() - (s.last_backup_at at time zone 'Asia/Bangkok')::date end as days_since,
       (select count(*) from public.documents d
         where d.status = 'issued'
           and (s.last_backup_at is null or d.issued_at > s.last_backup_at)) as issued_since_backup,
       ((select count(*) from public.documents d
          where d.status = 'issued'
            and (s.last_backup_at is null or d.issued_at > s.last_backup_at)) > 0
        or (s.last_backup_at is not null and now() - s.last_backup_at > interval '30 days')) as needs_backup
  from public.settings s
 where s.id;

grant select on public.v_invoice_balances, public.v_quote_status, public.v_documents_recent,
  public.v_client_open_balance, public.v_received_monthly, public.v_received_yearly,
  public.v_backup_status to authenticated;
revoke all on public.v_invoice_balances, public.v_quote_status, public.v_documents_recent,
  public.v_client_open_balance, public.v_received_monthly, public.v_received_yearly,
  public.v_backup_status from anon;

-- Views call app.today(); the signed-in role may run it (it only reads the clock).
grant execute on function app.today() to authenticated;

insert into app.migrations (name) values ('0006_views') on conflict do nothing;
