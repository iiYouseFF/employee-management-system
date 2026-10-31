-- 0011_rbac_hardening.sql
-- Closes privilege-escalation and cross-tenant read holes in the RBAC model.
--
-- Before: a user was a "manager" whenever they were NOT found in public.reps.
-- Any new signup therefore became a manager of a freshly seeded tenant.
-- Rep identity was resolved by email, and statement views leaked data because
-- they ran with the view owner's rights instead of the caller's.
--
-- After: roles are explicit (public.user_roles). A user with no row there has
-- no access at all. Reps are matched by auth user id only. All statements run
-- with the caller's rights, so RLS still applies.
--
-- Rollback (manual, in this order):
--   drop trigger if exists on_auth_user_created_link_rep on auth.users;
--   drop function if exists public.sync_rep_role();
--   drop table if exists public.user_roles;
--   drop type if exists public.app_role;
--   re-apply the policy/function definitions from 0001/0009/0010 if needed.

-- ---------------------------------------------------------------------------
-- 1. Roles table
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('manager', 'sales_rep');
  end if;
end $$;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_roles_owner on public.user_roles(owner_id);

alter table public.user_roles enable row level security;

-- No policies on purpose: only SECURITY DEFINER helpers may read this table.
revoke all on public.user_roles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Backfill (idempotent)
-- ---------------------------------------------------------------------------

-- 2a. Link rep rows that already belong to an auth user with the same email.
--     A user is linked at most once.
update public.reps r
set user_id = u.id
from auth.users u
where r.user_id is null
  and r.email is not null
  and lower(trim(r.email)) = lower(trim(u.email))
  and not exists (
    select 1 from public.reps r2 where r2.user_id = u.id
  );

-- 2b. Every linked rep row becomes a sales_rep.
insert into public.user_roles (user_id, role, owner_id)
select r.user_id, 'sales_rep'::public.app_role, r.owner_id
from public.reps r
where r.user_id is not null
group by r.user_id, r.owner_id
on conflict (user_id) do nothing;

-- 2c. Tenant owners become managers, unless they are actually reps.
--     The old trigger also created app_settings for reps, so exclude them.
insert into public.user_roles (user_id, role, owner_id)
select s.owner_id, 'manager'::public.app_role, s.owner_id
from public.app_settings s
where not exists (select 1 from public.user_roles ur where ur.user_id = s.owner_id)
  and not exists (
    select 1 from public.reps r
    where r.user_id = s.owner_id
       or (r.email is not null and lower(trim(r.email)) = (
             select lower(trim(u.email)) from auth.users u where u.id = s.owner_id
           ))
  )
on conflict (user_id) do nothing;

-- 2d. Owners of rep rows are managers too (covers tenants with no settings row).
insert into public.user_roles (user_id, role, owner_id)
select distinct r.owner_id, 'manager'::public.app_role, r.owner_id
from public.reps r
where not exists (select 1 from public.user_roles ur where ur.user_id = r.owner_id)
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Role helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_role_name()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid()
$$;

create or replace function public.current_owner_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select owner_id from public.user_roles where user_id = auth.uid()
$$;

create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_role_name() = 'manager'::public.app_role, false)
$$;

create or replace function public.is_sales_rep()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_role_name() = 'sales_rep'::public.app_role, false)
$$;

create or replace function public.is_rep_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_sales_rep()
$$;

create or replace function public.get_current_rep_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select r.id
  from public.reps r
  where r.user_id = auth.uid()
    and r.owner_id = public.current_owner_id()
  limit 1
$$;

create or replace function public.get_current_rep_owner_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select public.current_owner_id()
$$;

create or replace function public.get_manager_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select public.current_owner_id()
$$;

-- ---------------------------------------------------------------------------
-- 4. Signup: explicit roles, no implicit manager, no seeded tenant for guests
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_rep_id uuid;
  v_rep_owner uuid;
  v_has_roles boolean;
begin
  -- Invited rep: a rep row with this email exists and is not linked yet.
  select r.id, r.owner_id
  into v_rep_id, v_rep_owner
  from public.reps r
  where r.user_id is null
    and r.email is not null
    and lower(trim(r.email)) = lower(trim(coalesce(new.email, '')))
  order by r.created_at
  limit 1;

  if v_rep_id is not null then
    update public.reps
    set user_id = new.id
    where id = v_rep_id and user_id is null;

    insert into public.user_roles (user_id, role, owner_id)
    values (new.id, 'sales_rep', v_rep_owner)
    on conflict (user_id) do nothing;

    return new;
  end if;

  -- First ever user bootstraps the manager account. Later unknown users get
  -- no role and therefore no access until a manager creates a rep for them.
  select exists (select 1 from public.user_roles) into v_has_roles;

  if not v_has_roles then
    insert into public.user_roles (user_id, role, owner_id)
    values (new.id, 'manager', new.id)
    on conflict (user_id) do nothing;

    insert into public.app_settings (owner_id)
    values (new.id)
    on conflict (owner_id) do nothing;

    insert into public.reps (owner_id, name) values
      (new.id, 'سارة'),
      (new.id, 'عمرو أحمد'),
      (new.id, 'مندوب التوزيع')
    on conflict do nothing;
  end if;

  return new;
end $$;

-- Keep rep rows and roles in sync when a manager adds or edits a rep, and
-- remove the role when the rep row is deleted.
create or replace function public.sync_rep_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := new.user_id;

  if v_user_id is null and new.email is not null then
    select u.id into v_user_id
    from auth.users u
    where lower(trim(u.email)) = lower(trim(new.email))
    order by u.created_at
    limit 1;

    if v_user_id is not null then
      update public.reps set user_id = v_user_id where id = new.id;
    end if;
  end if;

  if v_user_id is null then
    return new;
  end if;

  -- Never demote a manager through a rep row.
  if exists (
    select 1 from public.user_roles
    where user_id = v_user_id and role = 'manager'::public.app_role
  ) then
    return new;
  end if;

  insert into public.user_roles (user_id, role, owner_id)
  values (v_user_id, 'sales_rep', new.owner_id)
  on conflict (user_id) do update
    set role = 'sales_rep'::public.app_role,
        owner_id = excluded.owner_id
    where public.user_roles.role <> 'manager'::public.app_role;

  return new;
end $$;

create or replace function public.delete_rep_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.user_id is not null then
    delete from public.user_roles
    where user_id = old.user_id
      and role = 'sales_rep'::public.app_role;
  end if;
  return old;
end $$;

-- The legacy linking trigger lives on auth.users, not on public.reps.
drop trigger if exists on_auth_user_created_link_rep on auth.users;
drop function if exists public.handle_rep_user_linking();

drop trigger if exists on_rep_created_sync_role on public.reps;
create trigger on_rep_created_sync_role
  after insert or update of email, user_id on public.reps
  for each row execute function public.sync_rep_role();

drop trigger if exists on_rep_deleted_delete_role on public.reps;
create trigger on_rep_deleted_delete_role
  after delete on public.reps
  for each row execute function public.delete_rep_role();

-- ---------------------------------------------------------------------------
-- 5. Rebuild every RLS policy (old own-row policies still exist from 0001)
-- ---------------------------------------------------------------------------

-- app_settings -----------------------------------------------------------------
drop policy if exists "own rows" on public.app_settings;
drop policy if exists "own rows settings" on public.app_settings;
drop policy if exists "rep select settings" on public.app_settings;
drop policy if exists "manager_all_settings" on public.app_settings;
drop policy if exists "rep_read_settings" on public.app_settings;

create policy "manager_all_settings" on public.app_settings
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

create policy "rep_read_settings" on public.app_settings
  for select
  using (public.is_sales_rep() and owner_id = public.current_owner_id());

-- reps -------------------------------------------------------------------------
drop policy if exists "own rows" on public.reps;
drop policy if exists "own rows reps" on public.reps;
drop policy if exists "rep select reps" on public.reps;
drop policy if exists "manager_all_reps" on public.reps;
drop policy if exists "rep_read_own_rep" on public.reps;

create policy "manager_all_reps" on public.reps
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

create policy "rep_read_own_rep" on public.reps
  for select
  using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and user_id = auth.uid()
  );

-- customers --------------------------------------------------------------------
drop policy if exists "own rows" on public.customers;
drop policy if exists "own rows customers" on public.customers;
drop policy if exists "rep select customers" on public.customers;
drop policy if exists "manager insert customers" on public.customers;
drop policy if exists "manager update customers" on public.customers;
drop policy if exists "manager delete customers" on public.customers;
drop policy if exists "manager_all_customers" on public.customers;
drop policy if exists "rep_read_customers" on public.customers;

create policy "manager_all_customers" on public.customers
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

create policy "rep_read_customers" on public.customers
  for select
  using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and (
      representative_id = public.get_current_rep_id()
      or id in (
        select customer_id from public.cash_invoices where rep_id = public.get_current_rep_id()
        union
        select customer_id from public.credit_invoices where rep_id = public.get_current_rep_id()
        union
        select customer_id from public.payments where rep_id = public.get_current_rep_id()
      )
    )
  );

-- cash_invoices ----------------------------------------------------------------
drop policy if exists "own rows" on public.cash_invoices;
drop policy if exists "own rows cash" on public.cash_invoices;
drop policy if exists "rep select cash" on public.cash_invoices;
drop policy if exists "manager insert cash" on public.cash_invoices;
drop policy if exists "manager update cash" on public.cash_invoices;
drop policy if exists "manager delete cash" on public.cash_invoices;
drop policy if exists "manager select cash" on public.cash_invoices;
drop policy if exists "manager_all_cash" on public.cash_invoices;
drop policy if exists "rep_read_cash" on public.cash_invoices;

create policy "manager_all_cash" on public.cash_invoices
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

create policy "rep_read_cash" on public.cash_invoices
  for select
  using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and rep_id = public.get_current_rep_id()
  );

-- credit_invoices --------------------------------------------------------------
drop policy if exists "own rows" on public.credit_invoices;
drop policy if exists "own rows credit" on public.credit_invoices;
drop policy if exists "rep select credit" on public.credit_invoices;
drop policy if exists "manager insert credit" on public.credit_invoices;
drop policy if exists "manager update credit" on public.credit_invoices;
drop policy if exists "manager delete credit" on public.credit_invoices;
drop policy if exists "manager select credit" on public.credit_invoices;
drop policy if exists "manager_all_credit" on public.credit_invoices;
drop policy if exists "rep_read_credit" on public.credit_invoices;

create policy "manager_all_credit" on public.credit_invoices
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

create policy "rep_read_credit" on public.credit_invoices
  for select
  using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and rep_id = public.get_current_rep_id()
  );

-- payments ---------------------------------------------------------------------
drop policy if exists "own rows" on public.payments;
drop policy if exists "own rows payments" on public.payments;
drop policy if exists "rep select payments" on public.payments;
drop policy if exists "manager insert payments" on public.payments;
drop policy if exists "manager update payments" on public.payments;
drop policy if exists "manager delete payments" on public.payments;
drop policy if exists "manager select payments" on public.payments;
drop policy if exists "manager_all_payments" on public.payments;
drop policy if exists "rep_read_payments" on public.payments;

create policy "manager_all_payments" on public.payments
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

create policy "rep_read_payments" on public.payments
  for select
  using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and (
      rep_id = public.get_current_rep_id()
      or credit_invoice_id in (
        select id from public.credit_invoices where rep_id = public.get_current_rep_id()
      )
    )
  );

-- suppliers / purchases / supplier payments / expenses: manager only -----------
drop policy if exists "manager_all_suppliers" on public.suppliers;
create policy "manager_all_suppliers" on public.suppliers
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

drop policy if exists "manager_all_purchases" on public.supplier_purchases;
create policy "manager_all_purchases" on public.supplier_purchases
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

drop policy if exists "manager_all_supplier_payments" on public.supplier_payments;
create policy "manager_all_supplier_payments" on public.supplier_payments
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

drop policy if exists "manager_all_expenses" on public.expenses;
create policy "manager_all_expenses" on public.expenses
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

-- products ---------------------------------------------------------------------
drop policy if exists "manager_all_products" on public.products;
drop policy if exists "authenticated_read_products" on public.products;
drop policy if exists "role_read_products" on public.products;

create policy "manager_all_products" on public.products
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

create policy "role_read_products" on public.products
  for select
  using (
    (public.is_manager() or public.is_sales_rep())
    and owner_id = public.current_owner_id()
    and (public.is_manager() or is_active)
  );

-- ---------------------------------------------------------------------------
-- 6. Views must honour the caller's RLS (they were leaking via owner rights)
-- ---------------------------------------------------------------------------

alter view public.v_customer_transactions set (security_invoker = true);
alter view public.v_supplier_transactions set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 7. Manager-only aggregates: explicit guards + tenant scoping
-- ---------------------------------------------------------------------------

create or replace function public.receivables_aging(p_as_of date default current_date)
returns table(bucket text, amount numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'forbidden: managers only';
  end if;

  return query
  select b.bucket, coalesce(sum(r.remaining), 0)::numeric as amount
  from (
    values
      (1, '0-30 يوم'),
      (2, '31-60 يوم'),
      (3, '61-90 يوم'),
      (4, '90+ يوم')
  ) as b(sort_order, bucket)
  left join (
    select
      ci.id,
      ci.date,
      (ci.amount - ci.paid - coalesce(sum(p.amount), 0)) as remaining,
      case
        when (p_as_of - ci.date) <= 30 then '0-30 يوم'
        when (p_as_of - ci.date) <= 60 then '31-60 يوم'
        when (p_as_of - ci.date) <= 90 then '61-90 يوم'
        else '90+ يوم'
      end as bucket
    from public.credit_invoices ci
    left join public.payments p on p.credit_invoice_id = ci.id
    where ci.owner_id = public.current_owner_id()
    group by ci.id
    having (ci.amount - ci.paid - coalesce(sum(p.amount), 0)) > 0
  ) r on r.bucket = b.bucket
  group by b.sort_order, b.bucket
  order by b.sort_order;
end $$;

create or replace function public.cashflow_series(
  p_from date default (current_date - '30 days'::interval)::date,
  p_to date default current_date
)
returns table(tx_date date, income numeric, outcome numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'forbidden: managers only';
  end if;

  return query
  with days as (
    select generate_series(p_from::timestamp, p_to::timestamp, '1 day')::date as d
  ),
  incomes as (
    select date as d, sum(amount) as inc
    from (
      select date, amount from public.cash_invoices where owner_id = public.current_owner_id()
      union all
      select date, amount from public.payments where owner_id = public.current_owner_id()
    ) combined_inc
    where date between p_from and p_to
    group by date
  ),
  outcomes as (
    select d, sum(amount) as out_amt
    from (
      select payment_date as d, amount from public.supplier_payments where owner_id = public.current_owner_id()
      union all
      select purchase_date as d, total_amount as amount from public.supplier_purchases where owner_id = public.current_owner_id() and payment_type = 'cash'
      union all
      select date as d, amount from public.expenses where owner_id = public.current_owner_id()
    ) combined_out
    where d between p_from and p_to
    group by d
  )
  select
    days.d as tx_date,
    coalesce(incomes.inc, 0)::numeric as income,
    coalesce(outcomes.out_amt, 0)::numeric as outcome
  from days
  left join incomes on incomes.d = days.d
  left join outcomes on outcomes.d = days.d
  order by days.d;
end $$;

-- Supporting indexes for rep-scoped reads.
create index if not exists idx_customers_owner_rep on public.customers(owner_id, representative_id);
create index if not exists idx_cash_owner_rep on public.cash_invoices(owner_id, rep_id);
create index if not exists idx_credit_owner_rep on public.credit_invoices(owner_id, rep_id);
create index if not exists idx_payments_owner_rep on public.payments(owner_id, rep_id);
