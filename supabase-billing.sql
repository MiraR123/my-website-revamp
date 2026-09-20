-- Business Automation Centre — delivery challans and invoices.
-- Run AFTER supabase-setup.sql, once, in the Supabase SQL editor.
--
-- It creates:
--   public.invoices           one row per invoice raised for a client
--   public.delivery_challans  one row per DC; invoice_id links it to its invoice
--   RLS policies              a signed-in client only ever sees their own rows
--
-- A DC is "billed" when it carries an invoice_id and "unbilled" when it does
-- not, so the status is derived rather than stored and can never disagree with
-- the invoice it belongs to.

create sequence if not exists public.invoice_no_seq start 1001;

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients (id) on delete cascade,
  invoice_number text unique not null default 'INV-' || to_char(now(), 'YYYY') || '-' ||
                                              lpad(nextval('public.invoice_no_seq')::text, 4, '0'),
  invoice_date   date not null default current_date,
  due_date       date,
  amount         numeric(12, 2) not null default 0,   -- taxable value
  tax_amount     numeric(12, 2) not null default 0,   -- GST
  total          numeric(12, 2) generated always as (amount + tax_amount) stored,
  status         text not null default 'unpaid' check (status in ('unpaid', 'part paid', 'paid', 'cancelled')),
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists public.delivery_challans (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  dc_number   text not null,
  dc_date     date not null default current_date,
  description text,
  service     text,
  quantity    numeric(12, 2),
  uom         text,
  amount      numeric(12, 2) not null default 0,
  -- null = unbilled; set it to bill the DC on that invoice
  invoice_id  uuid references public.invoices (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (client_id, dc_number)
);

create index if not exists delivery_challans_client_idx  on public.delivery_challans (client_id, dc_date desc);
create index if not exists delivery_challans_invoice_idx on public.delivery_challans (invoice_id);
create index if not exists invoices_client_idx           on public.invoices (client_id, invoice_date desc);

alter table public.invoices          enable row level security;
alter table public.delivery_challans enable row level security;

drop policy if exists "invoices read own" on public.invoices;
create policy "invoices read own" on public.invoices for select using (auth.uid() = client_id);

drop policy if exists "challans read own" on public.delivery_challans;
create policy "challans read own" on public.delivery_challans for select using (auth.uid() = client_id);

-- Convenience view for the office: invoice totals against the DCs on them.
create or replace view public.invoice_summary as
select i.id,
       i.client_id,
       i.invoice_number,
       i.invoice_date,
       i.status,
       i.total,
       count(d.id)                as dc_count,
       coalesce(sum(d.amount), 0) as dc_value
from public.invoices i
left join public.delivery_challans d on d.invoice_id = i.id
group by i.id;
