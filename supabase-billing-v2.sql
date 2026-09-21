-- Business Automation Centre — billing tables, revision 2.
-- Run in the Supabase SQL editor AFTER supabase-billing.sql.
--
-- The dashboard now shows only what the office actually keeps per row:
--   delivery challans : dc_number, dc_date, dc_description, dc_amount
--   invoices          : invoice_number, invoice_date, invoice_amount
-- The customer code is not stored on either table — it belongs to the client
-- and is read from public.clients.client_code for the signed-in user, so it
-- can never disagree with the account.
--
-- The DC tab lists unbilled challans only, which stays `invoice_id is null`:
-- linking a challan to an invoice is what takes it off that list.

-- The summary view reads the columns being changed, so it goes first and is
-- recreated at the end.
drop view if exists public.invoice_summary;

-- ---------------------------------------------------------------- challans
alter table public.delivery_challans rename column description to dc_description;
alter table public.delivery_challans rename column amount      to dc_amount;

alter table public.delivery_challans
  drop column if exists service,
  drop column if exists quantity,
  drop column if exists uom;

-- ---------------------------------------------------------------- invoices
-- total was a generated column over amount + tax_amount, so it goes first.
alter table public.invoices drop column if exists total;
alter table public.invoices
  drop column if exists tax_amount,
  drop column if exists due_date,
  drop column if exists status,
  drop column if exists notes;

alter table public.invoices rename column amount to invoice_amount;

create or replace view public.invoice_summary as
select i.id,
       i.client_id,
       i.invoice_number,
       i.invoice_date,
       i.invoice_amount,
       count(d.id)                   as dc_count,
       coalesce(sum(d.dc_amount), 0) as dc_value
from public.invoices i
left join public.delivery_challans d on d.invoice_id = i.id
group by i.id;

-- indexes that mentioned the renamed columns are updated automatically;
-- this one makes the unbilled lookup cheap.
create index if not exists delivery_challans_unbilled_idx
  on public.delivery_challans (client_id, dc_date desc)
  where invoice_id is null;

-- RLS is unchanged: a client reads only their own rows.
-- select * from public.delivery_challans;  -- sanity check as the office
