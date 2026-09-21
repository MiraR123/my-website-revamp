-- Invoice documents in Supabase Storage
-- =====================================
-- Run once in the Supabase SQL editor, after supabase-billing-v2.sql.
--
-- The office uploads the real invoice document; the dashboard serves it
-- through a short-lived signed URL. Files live in a PRIVATE bucket, one
-- folder per client, named after the invoice number:
--
--   invoices/<client uuid>/<invoice number>.pdf
--   e.g. invoices/0b0d…c41/INV-2026-1001.pdf
--
-- invoices.invoice_file overrides that convention when a file is stored
-- under a different name; leave it null to use the convention.

-- 1. Where the document lives -------------------------------------------
alter table public.invoices
  add column if not exists invoice_file text;

comment on column public.invoices.invoice_file is
  'Path inside the "invoices" storage bucket. Null means the dashboard looks for <client_id>/<invoice_number>.pdf.';

-- 2. The bucket ----------------------------------------------------------
-- Private: a client reaches a file only through a signed URL the policy
-- below allows them to mint.
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do update set public = false;

-- 3. Each client reads only their own folder -----------------------------
drop policy if exists "Clients read their own invoice files" on storage.objects;

create policy "Clients read their own invoice files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Uploads stay with the office (Supabase dashboard or a service-role
-- script): no insert/update/delete policy is granted to clients.

-- 4. Helper: the exact file name to upload for each invoice ---------------
-- Upload each PDF into the "invoices" bucket at the path this returns.
select i.invoice_number,
       c.client_code,
       i.client_id || '/' || i.invoice_number || '.pdf' as storage_path
from public.invoices i
join public.clients c on c.id = i.client_id
order by i.invoice_date desc;
