-- Trenton Control — pegar en SQL Editor del proyecto Supabase "trenton-control"
-- Proyecto: trenton-control  |  Base interna: postgres  |  Schema: public
-- Solo Lilian inicia sesión. RLS exige owner_id = auth.uid().

create extension if not exists pgcrypto;

-- Perfil
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Lilian',
  job_title text not null default 'Secretaria',
  avatar_path text,
  email text not null default '',
  created_at timestamptz not null default now()
);

-- Invoices (id text para conservar los ids locales al migrar)
create table if not exists public.invoices (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  address text not null default '',
  address_norm text not null default '',
  invoice_number text not null default '',
  invoice_number_norm text not null default '',
  issued_date date,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  hours numeric(10, 2) not null default 0 check (hours >= 0),
  stage text not null default 'created'
    check (stage in ('created', 'working', 'waiting', 'paid')),
  description text not null default '',
  invoice_data jsonb,
  source text not null default 'generated'
    check (source in ('generated', 'imported')),
  source_id text,
  pdf_hash text,
  pdf_path text,
  pdf_name text not null default '',
  paid_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invoices_logical_key
  on public.invoices (owner_id, invoice_number_norm, address_norm, issued_date)
  where deleted_at is null and invoice_number_norm <> '' and address_norm <> '' and issued_date is not null;

create unique index if not exists invoices_pdf_hash_key
  on public.invoices (owner_id, pdf_hash)
  where deleted_at is null and pdf_hash is not null and pdf_hash <> '';

create index if not exists invoices_owner_stage_idx
  on public.invoices (owner_id, stage)
  where deleted_at is null;

-- Horas
create table if not exists public.hours_reports (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  job_address text not null default '',
  report_date date not null,
  description text not null default '',
  default_rate numeric(10, 2) not null default 30,
  pdf_hash text,
  pdf_path text,
  pdf_name text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hours_entries (
  id text primary key,
  report_id text not null references public.hours_reports (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  work_date date,
  employee text not null default '',
  time_in text not null default '',
  time_out text not null default '',
  lunch_minutes integer not null default 0 check (lunch_minutes >= 0),
  rate numeric(10, 2) not null default 0,
  hours_override numeric(10, 2),
  hours numeric(10, 2) not null default 0,
  sort_order integer not null default 0
);

create index if not exists hours_entries_report_idx on public.hours_entries (report_id, sort_order);

-- Fotos de cheque
create table if not exists public.check_photos (
  id text primary key,
  invoice_id text not null references public.invoices (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  file_name text not null default '',
  note text not null default '',
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists check_photos_invoice_idx on public.check_photos (invoice_id);

-- updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

drop trigger if exists hours_reports_set_updated_at on public.hours_reports;
create trigger hours_reports_set_updated_at
  before update on public.hours_reports
  for each row execute function public.set_updated_at();

-- Perfil al crear usuario
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'Lilian'),
    coalesce(new.email, '')
  )
  on conflict (id) do update
    set email = coalesce(nullif(excluded.email, ''), public.profiles.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.invoices enable row level security;
alter table public.hours_reports enable row level security;
alter table public.hours_entries enable row level security;
alter table public.check_photos enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "invoices_all_own" on public.invoices;
create policy "invoices_all_own" on public.invoices
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "hours_reports_all_own" on public.hours_reports;
create policy "hours_reports_all_own" on public.hours_reports
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "hours_entries_all_own" on public.hours_entries;
create policy "hours_entries_all_own" on public.hours_entries
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "check_photos_all_own" on public.check_photos;
create policy "check_photos_all_own" on public.check_photos
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.invoices, public.hours_reports, public.hours_entries, public.check_photos to authenticated;

-- Storage
insert into storage.buckets (id, name, public)
values
  ('invoice-pdfs', 'invoice-pdfs', false),
  ('hours-pdfs', 'hours-pdfs', false),
  ('check-photos', 'check-photos', false),
  ('avatars', 'avatars', false)
on conflict (id) do nothing;

drop policy if exists "invoice_pdfs_select" on storage.objects;
drop policy if exists "invoice_pdfs_insert" on storage.objects;
drop policy if exists "invoice_pdfs_update" on storage.objects;
drop policy if exists "invoice_pdfs_delete" on storage.objects;
drop policy if exists "hours_pdfs_select" on storage.objects;
drop policy if exists "hours_pdfs_insert" on storage.objects;
drop policy if exists "hours_pdfs_update" on storage.objects;
drop policy if exists "hours_pdfs_delete" on storage.objects;
drop policy if exists "check_photos_select" on storage.objects;
drop policy if exists "check_photos_insert" on storage.objects;
drop policy if exists "check_photos_update" on storage.objects;
drop policy if exists "check_photos_delete" on storage.objects;

create policy "invoice_pdfs_select" on storage.objects for select to authenticated
  using (bucket_id = 'invoice-pdfs' and split_part(name, '/', 1) = auth.uid()::text);
create policy "invoice_pdfs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoice-pdfs' and split_part(name, '/', 1) = auth.uid()::text);
create policy "invoice_pdfs_update" on storage.objects for update to authenticated
  using (bucket_id = 'invoice-pdfs' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'invoice-pdfs' and split_part(name, '/', 1) = auth.uid()::text);
create policy "invoice_pdfs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'invoice-pdfs' and split_part(name, '/', 1) = auth.uid()::text);

create policy "hours_pdfs_select" on storage.objects for select to authenticated
  using (bucket_id = 'hours-pdfs' and split_part(name, '/', 1) = auth.uid()::text);
create policy "hours_pdfs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'hours-pdfs' and split_part(name, '/', 1) = auth.uid()::text);
create policy "hours_pdfs_update" on storage.objects for update to authenticated
  using (bucket_id = 'hours-pdfs' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'hours-pdfs' and split_part(name, '/', 1) = auth.uid()::text);
create policy "hours_pdfs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'hours-pdfs' and split_part(name, '/', 1) = auth.uid()::text);

create policy "check_photos_select" on storage.objects for select to authenticated
  using (bucket_id = 'check-photos' and split_part(name, '/', 1) = auth.uid()::text);
create policy "check_photos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'check-photos' and split_part(name, '/', 1) = auth.uid()::text);
create policy "check_photos_update" on storage.objects for update to authenticated
  using (bucket_id = 'check-photos' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'check-photos' and split_part(name, '/', 1) = auth.uid()::text);
create policy "check_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'check-photos' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists "avatars_select" on storage.objects;
drop policy if exists "avatars_insert" on storage.objects;
drop policy if exists "avatars_update" on storage.objects;
drop policy if exists "avatars_delete" on storage.objects;

create policy "avatars_select" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
create policy "avatars_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
create policy "avatars_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
create policy "avatars_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
