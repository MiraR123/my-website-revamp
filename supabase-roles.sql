-- Role based access: admins create client logins and see every record
-- =====================================================================
-- Run once in the Supabase SQL editor, after the earlier scripts.
--
-- The role lives on public.clients. It is never settable from the browser:
-- the update policy below pins role and must_change_password to their
-- current values, so only the service role (the Edge Function) or the
-- SQL editor can grant admin.

-- 1. Columns -------------------------------------------------------------
alter table public.clients
  add column if not exists role text not null default 'client',
  add column if not exists must_change_password boolean not null default false;

alter table public.clients
  drop constraint if exists clients_role_check;

alter table public.clients
  add constraint clients_role_check check (role in ('client', 'admin'));

-- 2. Who is an admin -----------------------------------------------------
-- security definer so the check itself is not filtered by the policies it
-- is used in, which would recurse on public.clients.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 3. Table policies: own rows, or everything for an admin ----------------
drop policy if exists "Clients read own profile" on public.clients;
drop policy if exists "Clients read their own row" on public.clients;
drop policy if exists "Read own client row or all as admin" on public.clients;

create policy "Read own client row or all as admin"
  on public.clients for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "Update own client row" on public.clients;

-- A client may correct their own contact details but cannot promote
-- themselves or clear the first-login flag by hand.
create policy "Update own client row"
  on public.clients for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select c.role from public.clients c where c.id = auth.uid())
    and must_change_password = (select c.must_change_password from public.clients c where c.id = auth.uid())
  );

drop policy if exists "Admins update any client row" on public.clients;

create policy "Admins update any client row"
  on public.clients for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Clients read their own challans" on public.delivery_challans;
drop policy if exists "Read own challans or all as admin" on public.delivery_challans;

create policy "Read own challans or all as admin"
  on public.delivery_challans for select
  to authenticated
  using (client_id = auth.uid() or public.is_admin());

drop policy if exists "Clients read their own invoices" on public.invoices;
drop policy if exists "Read own invoices or all as admin" on public.invoices;

create policy "Read own invoices or all as admin"
  on public.invoices for select
  to authenticated
  using (client_id = auth.uid() or public.is_admin());

-- 4. Storage: a client sees their own folder, an admin sees every file ---
drop policy if exists "Clients read their own invoice files" on storage.objects;

create policy "Clients read their own invoice files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'invoices'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "Clients read their own challan files" on storage.objects;

create policy "Clients read their own challan files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'challans'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- 5. First login: the client clears their own flag after changing the
--    password. Kept as a function so the flag itself stays out of reach
--    of a normal update.
create or replace function public.password_changed()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.clients
     set must_change_password = false
   where id = auth.uid();
$$;

revoke all on function public.password_changed() from public;
grant execute on function public.password_changed() to authenticated;

-- 6. Make yourself the first admin --------------------------------------
-- Replace the email with the account that should administer the site.
update public.clients
   set role = 'admin', must_change_password = false
 where id = (select id from auth.users where email = 'aarthiradhakrishnan7@gmail.com');

select client_code, role, must_change_password from public.clients order by role, client_code;
