-- Pegar en SQL Editor de Supabase (proyecto trenton-control).
-- Alinea hours_reports / hours_entries / invoices con la app.
-- No borra filas. Se puede correr más de una vez.

-- Horas: columnas que la app envía al guardar
alter table public.hours_reports add column if not exists owner_id uuid references auth.users (id) on delete cascade;
alter table public.hours_reports add column if not exists job_address text not null default '';
alter table public.hours_reports add column if not exists report_date date;
alter table public.hours_reports add column if not exists description text not null default '';
alter table public.hours_reports add column if not exists default_rate numeric(10, 2) not null default 30;
alter table public.hours_reports add column if not exists pdf_hash text;
alter table public.hours_reports add column if not exists pdf_path text;
alter table public.hours_reports add column if not exists pdf_name text not null default '';
alter table public.hours_reports add column if not exists deleted_at timestamptz;
alter table public.hours_reports add column if not exists created_at timestamptz not null default now();
alter table public.hours_reports add column if not exists updated_at timestamptz not null default now();

alter table public.hours_entries add column if not exists report_id text;
alter table public.hours_entries add column if not exists owner_id uuid references auth.users (id) on delete cascade;
alter table public.hours_entries add column if not exists work_date date;
alter table public.hours_entries add column if not exists employee text not null default '';
alter table public.hours_entries add column if not exists time_in text not null default '';
alter table public.hours_entries add column if not exists time_out text not null default '';
alter table public.hours_entries add column if not exists lunch_minutes integer not null default 0;
alter table public.hours_entries add column if not exists rate numeric(10, 2) not null default 0;
alter table public.hours_entries add column if not exists hours_override numeric(10, 2);
alter table public.hours_entries add column if not exists hours numeric(10, 2) not null default 0;
alter table public.hours_entries add column if not exists sort_order integer not null default 0;

-- Invoices: por si faltan columnas de PDF
alter table public.invoices add column if not exists pdf_hash text;
alter table public.invoices add column if not exists pdf_path text;
alter table public.invoices add column if not exists pdf_name text not null default '';
alter table public.invoices add column if not exists deleted_at timestamptz;
alter table public.invoices add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hours_reports_set_updated_at on public.hours_reports;
create trigger hours_reports_set_updated_at
  before update on public.hours_reports
  for each row execute function public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.hours_reports enable row level security;
alter table public.hours_entries enable row level security;
alter table public.invoices enable row level security;

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

drop policy if exists "invoices_all_own" on public.invoices;
create policy "invoices_all_own" on public.invoices
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.hours_reports, public.hours_entries, public.invoices
  to authenticated;

insert into storage.buckets (id, name, public)
values ('hours-pdfs', 'hours-pdfs', false), ('invoice-pdfs', 'invoice-pdfs', false)
on conflict (id) do nothing;

drop policy if exists "hours_pdfs_select" on storage.objects;
drop policy if exists "hours_pdfs_insert" on storage.objects;
drop policy if exists "hours_pdfs_update" on storage.objects;
drop policy if exists "hours_pdfs_delete" on storage.objects;

create policy "hours_pdfs_select" on storage.objects for select to authenticated
  using (bucket_id = 'hours-pdfs' and split_part(name, '/', 1) = auth.uid()::text);
create policy "hours_pdfs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'hours-pdfs' and split_part(name, '/', 1) = auth.uid()::text);
create policy "hours_pdfs_update" on storage.objects for update to authenticated
  using (bucket_id = 'hours-pdfs' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'hours-pdfs' and split_part(name, '/', 1) = auth.uid()::text);
create policy "hours_pdfs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'hours-pdfs' and split_part(name, '/', 1) = auth.uid()::text);

notify pgrst, 'reload schema';
