-- 0014_rbac_hardening_v2.sql
-- Hardens role provisioning and tenant isolation on top of 0011/0012.
--
-- What it changes:
--   1. Role/owner helpers only answer for users whose email is confirmed
--      (single source of truth: no access until the address is verified).
--   2. Rep provisioning is centralised in public.provision_user_role(uuid),
--      called from auth.users INSERT and from the email-confirmation UPDATE.
--   3. sync_rep_role(): refuses unconfirmed emails, never links a user that is
--      already linked to another rep row, never demotes a manager, and never
--      moves an existing role to a different owner (tenant).
--   4. delete_rep_role(): only removes the role when no rep row still references
--      the user.
--   5. uq_reps_user_id: one auth user can only be linked to one rep row.
--   6. Rep read policies: customers are visible only when assigned to the rep;
--      cash invoices, credit invoices and payments are visible when they belong
--      to the rep OR to a customer assigned to the rep (additive for finances).
--   7. search_path = public, pg_temp on every SECURITY DEFINER function.
--
-- Rollback (manual):
--   drop index if exists public.uq_reps_user_id;
--   drop trigger if exists on_auth_user_confirmed_provision on auth.users;
--   drop function if exists public.handle_user_email_confirmed();
--   drop function if exists public.provision_user_role(uuid);
--   -- restore the previous bodies from 0011_rbac_hardening.sql sections 3/4,
--   -- then recreate the rep read policies exactly as defined there.

-- ---------------------------------------------------------------------------
-- 1. Helpers: only answer for confirmed accounts, harden search_path
-- ---------------------------------------------------------------------------
create or replace function public.current_role_name()
returns public.app_role
language sql stable security definer set search_path = public, pg_temp
as $$
  select ur.role
  from public.user_roles ur
  join auth.users u on u.id = ur.user_id
  where ur.user_id = auth.uid()
    and u.email_confirmed_at is not null
$$;

create or replace function public.current_owner_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select ur.owner_id
  from public.user_roles ur
  join auth.users u on u.id = ur.user_id
  where ur.user_id = auth.uid()
    and u.email_confirmed_at is not null
$$;

create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(public.current_role_name() = 'manager'::public.app_role, false)
$$;

create or replace function public.is_sales_rep()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(public.current_role_name() = 'sales_rep'::public.app_role, false)
$$;

create or replace function public.is_rep_user()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.is_sales_rep()
$$;

create or replace function public.get_current_rep_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select r.id
  from public.reps r
  where r.user_id = auth.uid()
    and r.owner_id = public.current_owner_id()
  limit 1
$$;

create or replace function public.get_current_rep_owner_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.current_owner_id()
$$;

create or replace function public.get_manager_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.current_owner_id()
$$;

-- ---------------------------------------------------------------------------
-- 2. One auth user <-> one rep row
-- ---------------------------------------------------------------------------
create unique index if not exists uq_reps_user_id
  on public.reps (user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Centralised provisioning (confirmation-gated)
-- ---------------------------------------------------------------------------
create or replace function public.provision_user_role(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_confirmed timestamptz;
  v_rep_id uuid;
  v_rep_owner uuid;
begin
  select u.email, u.email_confirmed_at
  into v_email, v_confirmed
  from auth.users u
  where u.id = p_user_id;

  -- Never grant access before the email address is verified.
  if v_confirmed is null then
    return;
  end if;

  select r.id, r.owner_id
  into v_rep_id, v_rep_owner
  from public.reps r
  where r.user_id is null
    and r.email is not null
    and lower(trim(r.email)) = lower(trim(coalesce(v_email, '')))
  order by r.created_at
  limit 1;

  if v_rep_id is not null then
    update public.reps
    set user_id = p_user_id
    where id = v_rep_id and user_id is null;

    insert into public.user_roles (user_id, role, owner_id)
    values (p_user_id, 'sales_rep', v_rep_owner)
    on conflict (user_id) do nothing;

    return;
  end if;

  -- Bootstrap the very first account as the manager.
  if exists (select 1 from public.user_roles) then
    return;
  end if;

  insert into public.user_roles (user_id, role, owner_id)
  values (p_user_id, 'manager', p_user_id)
  on conflict (user_id) do nothing;

  insert into public.app_settings (owner_id)
  values (p_user_id)
  on conflict (owner_id) do nothing;

  insert into public.reps (owner_id, name) values
    (p_user_id, 'سارة'),
    (p_user_id, 'عمرو أحمد'),
    (p_user_id, 'مندوب التوزيع')
  on conflict do nothing;
end $$;

revoke all on function public.provision_user_role(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.provision_user_role(new.id);
  return new;
end $$;

create or replace function public.handle_user_email_confirmed()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    perform public.provision_user_role(new.id);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_confirmed_provision on auth.users;
create trigger on_auth_user_confirmed_provision
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_email_confirmed();

-- ---------------------------------------------------------------------------
-- 4. Rep row -> role sync (tenant-safe)
-- ---------------------------------------------------------------------------
create or replace function public.sync_rep_role()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  v_user_id := new.user_id;

  if v_user_id is null and new.email is not null then
    select u.id into v_user_id
    from auth.users u
    where lower(trim(u.email)) = lower(trim(new.email))
      and u.email_confirmed_at is not null
    order by u.created_at
    limit 1;

    if v_user_id is not null and not exists (
      select 1 from public.reps r
      where r.user_id = v_user_id and r.id <> new.id
    ) then
      update public.reps set user_id = v_user_id where id = new.id;
    else
      -- Unknown, unconfirmed, or already linked elsewhere: do not link.
      v_user_id := null;
    end if;
  end if;

  if v_user_id is null then
    return new;
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = v_user_id and u.email_confirmed_at is not null
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.user_roles
    where user_id = v_user_id and role = 'manager'::public.app_role
  ) then
    return new;
  end if;

  insert into public.user_roles as ur (user_id, role, owner_id)
  values (v_user_id, 'sales_rep', new.owner_id)
  on conflict (user_id) do update
    set role = 'sales_rep'::public.app_role,
        owner_id = excluded.owner_id
    where ur.role <> 'manager'::public.app_role
      and ur.owner_id = excluded.owner_id;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Rep deletion only removes a role nobody else references
-- ---------------------------------------------------------------------------
create or replace function public.delete_rep_role()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if old.user_id is not null then
    delete from public.user_roles ur
    where ur.user_id = old.user_id
      and ur.role = 'sales_rep'::public.app_role
      and not exists (
        select 1 from public.reps r where r.user_id = old.user_id
      );
  end if;
  return old;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Rep read policies: assigned customers + their financial rows
-- ---------------------------------------------------------------------------
drop policy if exists rep_read_customers on public.customers;
create policy rep_read_customers on public.customers
  for select using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and representative_id = public.get_current_rep_id()
  );

drop policy if exists rep_read_cash on public.cash_invoices;
create policy rep_read_cash on public.cash_invoices
  for select using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and (
      rep_id = public.get_current_rep_id()
      or exists (
        select 1 from public.customers c
        where c.id = cash_invoices.customer_id
          and c.representative_id = public.get_current_rep_id()
      )
    )
  );

drop policy if exists rep_read_credit on public.credit_invoices;
create policy rep_read_credit on public.credit_invoices
  for select using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and (
      rep_id = public.get_current_rep_id()
      or exists (
        select 1 from public.customers c
        where c.id = credit_invoices.customer_id
          and c.representative_id = public.get_current_rep_id()
      )
    )
  );

drop policy if exists rep_read_payments on public.payments;
create policy rep_read_payments on public.payments
  for select using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and (
      rep_id = public.get_current_rep_id()
      or credit_invoice_id in (
        select ci.id from public.credit_invoices ci
        where ci.rep_id = public.get_current_rep_id()
      )
      or customer_id in (
        select c.id from public.customers c
        where c.representative_id = public.get_current_rep_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Remaining SECURITY DEFINER functions: search_path = public, pg_temp
--    (ALTER only: bodies are untouched, so statement/KPI logic is unchanged.)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;