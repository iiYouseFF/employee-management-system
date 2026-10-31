-- Migration 0009: Add email and phone to reps, and setup rep user association and RLS
alter table public.reps
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_reps_email on public.reps (lower(trim(email)));
create index if not exists idx_reps_user_id on public.reps (user_id);

-- Function to check if the current auth.uid() belongs to a representative
create or replace function public.is_rep_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.reps
    where user_id = auth.uid()
       or (email is not null and lower(trim(email)) = lower(trim(coalesce(auth.jwt()->>'email', ''))))
  );
$$;

-- Function to retrieve the current rep's ID if user is a rep
create or replace function public.get_current_rep_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.reps
  where user_id = auth.uid()
     or (email is not null and lower(trim(email)) = lower(trim(coalesce(auth.jwt()->>'email', ''))))
  limit 1;
$$;

-- Function to retrieve the manager/owner_id for the current rep
create or replace function public.get_current_rep_owner_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select owner_id from public.reps
  where user_id = auth.uid()
     or (email is not null and lower(trim(email)) = lower(trim(coalesce(auth.jwt()->>'email', ''))))
  limit 1;
$$;

-- Automatic trigger to link new signups in auth.users with reps by email
create or replace function public.handle_rep_user_linking()
returns trigger
security definer
set search_path = public
language plpgsql as $$
begin
  if new.email is not null then
    update public.reps
    set user_id = new.id
    where lower(trim(email)) = lower(trim(new.email))
      and user_id is null;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created_link_rep on auth.users;
create trigger on_auth_user_created_link_rep
  after insert on auth.users
  for each row execute function public.handle_rep_user_linking();

-- Update trigger handle_new_user so it only generates default reps & settings for managers (not for rep users)
create or replace function public.handle_new_user()
returns trigger 
security definer
set search_path = public
language plpgsql as $$
declare
  is_rep boolean;
begin
  -- check if this new user is an invited representative
  select exists (
    select 1 from public.reps
    where lower(trim(email)) = lower(trim(new.email))
  ) into is_rep;

  -- only seed initial manager settings/reps if the user is a manager
  if not is_rep then
    insert into public.app_settings (owner_id) values (new.id) on conflict do nothing;
    insert into public.reps (owner_id, name) values 
      (new.id, 'سارة'),
      (new.id, 'عمرو أحمد'),
      (new.id, 'مندوب التوزيع')
    on conflict do nothing;
  end if;

  return new;
end $$;

-- Update RLS policies to grant Reps SELECT-ONLY permissions for their assigned customers, invoices, and payments

-- app_settings (Rep can read the company settings of their manager)
drop policy if exists "rep select settings" on app_settings;
create policy "rep select settings" on app_settings for select
  using (owner_id = public.get_current_rep_owner_id());

-- reps (Rep can read their own rep row or company reps)
drop policy if exists "rep select reps" on reps;
create policy "rep select reps" on reps for select
  using (id = public.get_current_rep_id() or owner_id = public.get_current_rep_owner_id());

-- customers (Rep can only read customers assigned to them)
drop policy if exists "rep select customers" on customers;
create policy "rep select customers" on customers for select
  using (
    representative_id = public.get_current_rep_id()
    or id in (
      select customer_id from cash_invoices where rep_id = public.get_current_rep_id()
      union
      select customer_id from credit_invoices where rep_id = public.get_current_rep_id()
      union
      select customer_id from payments where rep_id = public.get_current_rep_id()
    )
  );

-- cash_invoices (Rep can only read cash invoices with their rep_id)
drop policy if exists "rep select cash" on cash_invoices;
create policy "rep select cash" on cash_invoices for select
  using (rep_id = public.get_current_rep_id());

-- credit_invoices (Rep can only read credit invoices with their rep_id)
drop policy if exists "rep select credit" on credit_invoices;
create policy "rep select credit" on credit_invoices for select
  using (rep_id = public.get_current_rep_id());

-- payments (Rep can only read payments with their rep_id or related to their credit invoices)
drop policy if exists "rep select payments" on payments;
create policy "rep select payments" on payments for select
  using (
    rep_id = public.get_current_rep_id()
    or credit_invoice_id in (select id from credit_invoices where rep_id = public.get_current_rep_id())
  );
