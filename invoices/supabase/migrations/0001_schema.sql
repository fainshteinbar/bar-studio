-- 0001 · Schema: enums, tables, constraints, indexes.
-- Idempotent: safe to paste again. Never removes anything.
-- Business data lives only in Supabase; nothing here names a client.

create schema if not exists app;

create table if not exists app.migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

do $$ begin create type public.currency as enum ('ILS', 'USD', 'EUR', 'THB');
exception when duplicate_object then null; end $$;
do $$ begin create type public.document_kind as enum ('invoice', 'receipt', 'credit_note', 'quote');
exception when duplicate_object then null; end $$;
do $$ begin create type public.document_status as enum ('draft', 'issued');
exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_method as enum ('bank_transfer', 'cash', 'other');
exception when duplicate_object then null; end $$;

-- Singleton. Every legal text on the documents is edited here, from the app.
-- The supplier address is deliberately absent from every default: it is typed once in the app.
create table if not exists public.settings (
  id boolean primary key default true check (id),
  supplier_name text not null default 'Bar Fainshtein',
  trading_as text default 'bfain.studio',
  supplier_address text,
  supplier_email text default 'fainshteinbar@gmail.com',
  supplier_phone text default '053-622-4344',
  identifier_label text,
  identifier_value text,
  show_identifier boolean not null default false,
  footer_text text default 'Issued by a service provider resident outside Israel. Services performed outside Israel. No Israeli VAT charged.',
  payment_terms_text text,
  quote_terms_text text,
  notes_default_he text,
  notes_default_en text,
  default_currency public.currency not null default 'ILS',
  default_due_days int not null default 14 check (default_due_days between 0 and 365),
  default_quote_valid_days int not null default 30 check (default_quote_valid_days between 0 and 365),
  last_backup_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) > 0),
  legal_name text,
  identifier text,
  contact text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  description text not null check (length(btrim(description)) > 0),
  total numeric(14,2) check (total >= 0),
  currency public.currency not null default 'ILS',
  payment_terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_client_idx on public.projects (client_id);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  kind public.document_kind not null,
  status public.document_status not null default 'draft',
  number text unique check (number ~ '^(INV|REC|CRN|QUO)-[0-9]{4}-[0-9]{4,}$'),
  client_id uuid not null references public.clients (id) on delete restrict,
  project_id uuid references public.projects (id) on delete restrict,
  parent_id uuid,
  parent_kind public.document_kind check (parent_kind = 'invoice'),
  source_id uuid references public.documents (id) on delete set null,
  currency public.currency not null default 'ILS',
  amount numeric(14,2) check (amount >= 0),
  issue_date date,
  due_date date,
  valid_until date,
  issued_at timestamptz,
  payment_method public.payment_method,
  payment_date date,
  label_he text,
  label_en text,
  notes_he text,
  notes_en text,
  snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_id_kind_key unique (id, kind),
  constraint documents_parent_fk foreign key (parent_id, parent_kind)
    references public.documents (id, kind) on delete restrict,
  -- Receipts and credit notes always belong to an invoice; invoices and quotes never have a parent.
  constraint documents_parent_rule check ((kind in ('receipt', 'credit_note')) = (parent_id is not null)),
  constraint documents_parent_kind_rule check ((parent_id is null) = (parent_kind is null)),
  constraint documents_draft_rule check (status = 'issued' or (number is null and issued_at is null)),
  constraint documents_issued_rule check (status = 'draft' or (
    number is not null and issue_date is not null and issued_at is not null
    and amount is not null and snapshot is not null)),
  constraint documents_receipt_rule check (kind <> 'receipt' or status = 'draft' or (
    payment_method is not null and payment_date is not null and amount > 0)),
  constraint documents_prefix_rule check (number is null or left(number, 3) =
    case kind when 'invoice' then 'INV' when 'receipt' then 'REC' when 'credit_note' then 'CRN' else 'QUO' end)
);
create index if not exists documents_kind_status_date_idx on public.documents (kind, status, issue_date desc);
create index if not exists documents_parent_idx on public.documents (parent_id) where parent_id is not null;
create index if not exists documents_source_idx on public.documents (source_id) where source_id is not null;
create index if not exists documents_client_idx on public.documents (client_id);
create index if not exists documents_project_idx on public.documents (project_id) where project_id is not null;

create table if not exists public.document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  position int not null default 0,
  description_he text,
  description_en text,
  qty numeric(12,3) not null default 1 check (qty > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (round(qty * unit_price, 2)) stored,
  constraint document_items_description_rule check (
    length(btrim(coalesce(description_he, ''))) > 0 or length(btrim(coalesce(description_en, ''))) > 0)
);
create index if not exists document_items_document_idx on public.document_items (document_id, position);

-- Append-only. Written by triggers only; update, delete and truncate are refused even for postgres.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_email text,
  actor_role text,
  table_name text not null,
  row_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb
);
create index if not exists audit_log_row_idx on public.audit_log (table_name, row_id);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- The only source of document numbers. Touched by app.next_number() only.
create table if not exists app.counters (
  kind public.document_kind not null,
  year int not null check (year between 2000 and 2999),
  last_no int not null check (last_no > 0),
  primary key (kind, year)
);

insert into app.migrations (name) values ('0001_schema') on conflict do nothing;
