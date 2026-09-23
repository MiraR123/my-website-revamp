-- Delivery challan documents in Supabase Storage
-- ==============================================
-- Run once in the Supabase SQL editor, after supabase-invoice-files.sql.
-- Mirrors the invoice setup: private bucket, one folder per client, file
-- named after the challan number:
--
--   challans/<client uuid>/<dc number>.pdf
--   e.g. challans/0b0d…c41/DC-4006.pdf

-- 1. Where the document lives -------------------------------------------
alter table public.delivery_challans
  add column if not exists dc_file text;

comment on column public.delivery_challans.dc_file is
  'Path inside the "challans" storage bucket. Null means the dashboard looks for <client_id>/<dc_number>.pdf.';

-- 2. The bucket ----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('challans', 'challans', false)
on conflict (id) do update set public = false;

-- 3. Each client reads only their own folder -----------------------------
drop policy if exists "Clients read their own challan files" on storage.objects;

create policy "Clients read their own challan files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'challans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Helper: the exact file name to upload for each challan --------------
select d.dc_number,
       c.client_code,
       d.client_id || '/' || d.dc_number || '.pdf' as storage_path
from public.delivery_challans d
join public.clients c on c.id = d.client_id
where d.invoice_id is null
order by d.dc_date desc;
