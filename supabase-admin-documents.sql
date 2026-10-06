-- Admin document uploads from the dashboard
-- ==========================================
-- Run once in the Supabase SQL editor, after supabase-roles.sql.
--
-- Lets a signed-in admin add, bill, replace and delete delivery challans and
-- invoices from the website's Documents tab. Every rule is checked by
-- Supabase against public.is_admin(), so clients stay read-only whatever
-- the browser sends.

-- 1. Who added each document --------------------------------------------
alter table public.delivery_challans
  add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;

alter table public.invoices
  add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;

-- 2. Admins write the document rows -------------------------------------
drop policy if exists "Admins add challans" on public.delivery_challans;
create policy "Admins add challans"
  on public.delivery_challans for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins update challans" on public.delivery_challans;
create policy "Admins update challans"
  on public.delivery_challans for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins delete challans" on public.delivery_challans;
create policy "Admins delete challans"
  on public.delivery_challans for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins add invoices" on public.invoices;
create policy "Admins add invoices"
  on public.invoices for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins update invoices" on public.invoices;
create policy "Admins update invoices"
  on public.invoices for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins delete invoices" on public.invoices;
create policy "Admins delete invoices"
  on public.invoices for delete
  to authenticated
  using (public.is_admin());

-- Admins read every row, so the id of a freshly added row can be returned.
drop policy if exists "Admins read challans" on public.delivery_challans;
create policy "Admins read challans"
  on public.delivery_challans for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins read invoices" on public.invoices;
create policy "Admins read invoices"
  on public.invoices for select
  to authenticated
  using (public.is_admin());

-- 3. Admins write the PDF files -----------------------------------------
drop policy if exists "Admins read document files" on storage.objects;
create policy "Admins read document files"
  on storage.objects for select
  to authenticated
  using (bucket_id in ('invoices', 'challans') and public.is_admin());

drop policy if exists "Admins upload document files" on storage.objects;
create policy "Admins upload document files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id in ('invoices', 'challans') and public.is_admin());

drop policy if exists "Admins replace document files" on storage.objects;
create policy "Admins replace document files"
  on storage.objects for update
  to authenticated
  using (bucket_id in ('invoices', 'challans') and public.is_admin())
  with check (bucket_id in ('invoices', 'challans') and public.is_admin());

drop policy if exists "Admins delete document files" on storage.objects;
create policy "Admins delete document files"
  on storage.objects for delete
  to authenticated
  using (bucket_id in ('invoices', 'challans') and public.is_admin());

-- 4. PDFs only, up to 10 MB each ----------------------------------------
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf']
 where id in ('invoices', 'challans');

-- 5. Check: expect 12 admin policies and role = admin for your account --
select (select count(*) from pg_policies where policyname like 'Admins%') as admin_policies,
       (select string_agg(tablename || ':' || cmd, ', ' order by tablename, cmd)
          from pg_policies where policyname like 'Admins%') as policies,
       (select string_agg(client_code || '=' || role, ', ') from public.clients where role = 'admin') as admins,
       (select string_agg(id || ' ' || coalesce(array_to_string(allowed_mime_types, '/'), 'any'), ', ')
          from storage.buckets where id in ('invoices', 'challans')) as buckets;
