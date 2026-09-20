-- Business Automation Centre — Supabase schema for the client area.
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- It creates:
--   public.clients  one row per registered client, with an auto client ID
--   public.jobs     optional job list rendered on the dashboard
--   RLS policies    each signed-in user can only ever see their own rows
--   a trigger       that fills public.clients the moment a user signs up

create sequence if not exists public.client_code_seq start 1001;

create table if not exists public.clients (
  id          uuid primary key references auth.users on delete cascade,
  client_code text unique not null default 'BAC-' || lpad(nextval('public.client_code_seq')::text, 4, '0'),
  full_name   text,
  company     text,
  phone       text,
  email       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.jobs (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete cascade,
  reference  text,
  title      text,
  service    text,
  status     text not null default 'received',
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;
alter table public.jobs    enable row level security;

drop policy if exists "clients read own"   on public.clients;
drop policy if exists "clients insert own" on public.clients;
drop policy if exists "clients update own" on public.clients;
create policy "clients read own"   on public.clients for select using (auth.uid() = id);
create policy "clients insert own" on public.clients for insert with check (auth.uid() = id);
create policy "clients update own" on public.clients for update using (auth.uid() = id);

drop policy if exists "jobs read own" on public.jobs;
create policy "jobs read own" on public.jobs for select using (auth.uid() = client_id);

-- security definer: the trigger writes the row before the user has a session.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.clients (id, full_name, company, phone, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company',
    new.raw_user_meta_data ->> 'phone',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Back-fill anyone who registered before this script was run.
insert into public.clients (id, full_name, company, phone, email)
select u.id,
       u.raw_user_meta_data ->> 'full_name',
       u.raw_user_meta_data ->> 'company',
       u.raw_user_meta_data ->> 'phone',
       u.email
from auth.users u
on conflict (id) do nothing;
