-- 0012_rep_management.sql
-- Extends the reps module with lifecycle, targeting and a manager-only
-- directory RPC that aggregates each rep's workload in Postgres.
--
-- Adds:
--   public.reps.is_active      boolean not null default true
--   public.reps.notes          text
--   public.reps.monthly_target numeric(14,2) not null default 0
--   index  idx_reps_owner on public.reps(owner_id)
--   public.rep_directory()     manager-only, security definer
--
-- Rollback (manual, in this order):
--   drop function if exists public.rep_directory();
--   drop index if exists public.idx_reps_owner;
--   alter table public.reps drop column if exists monthly_target;
--   alter table public.reps drop column if exists notes;
--   alter table public.reps drop column if exists is_active;

-- ---------------------------------------------------------------------------
-- 1. Rep lifecycle columns
-- ---------------------------------------------------------------------------
alter table public.reps
  add column if not exists is_active boolean not null default true,
  add column if not exists notes text,
  add column if not exists monthly_target numeric(14,2) not null default 0;

create index if not exists idx_reps_owner on public.reps(owner_id);

-- ---------------------------------------------------------------------------
-- 2. Manager directory: one row per rep with workload + collection metrics
-- ---------------------------------------------------------------------------
create or replace function public.rep_directory()
returns table (
  rep_id uuid,
  name text,
  email text,
  phone text,
  is_active boolean,
  notes text,
  monthly_target numeric,
  is_linked boolean,
  created_at timestamptz,
  customers_count bigint,
  cash_count bigint,
  cash_total numeric,
  credit_count bigint,
  credit_total numeric,
  collected_total numeric,
  outstanding_total numeric,
  overdue_count bigint,
  month_sales numeric,
  month_collected numeric,
  last_activity date
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_owner uuid := public.current_owner_id();
  v_month_start date := date_trunc('month', current_date)::date;
begin
  if not public.is_manager() then
    raise exception 'forbidden: managers only';
  end if;

  return query
  with cust as (
    select c.representative_id as rid, count(*) as cnt
    from public.customers c
    where c.owner_id = v_owner and c.representative_id is not null
    group by c.representative_id
  ),
  cash as (
    select i.rep_id as rid,
           count(*) as cnt,
           sum(i.amount) as total,
           max(i.date) as last_date,
           coalesce(sum(i.amount) filter (where i.date >= v_month_start), 0) as month_total
    from public.cash_invoices i
    where i.owner_id = v_owner and i.rep_id is not null
    group by i.rep_id
  ),
  cred as (
    select i.rep_id as rid,
           count(*) as cnt,
           sum(i.amount) as total,
           max(i.date) as last_date,
           coalesce(sum(i.amount) filter (where i.date >= v_month_start), 0) as month_total,
           coalesce(sum(greatest(i.remaining, 0)) filter (where i.remaining > 0), 0) as outstanding,
           count(*) filter (
             where i.remaining > 0 and i.due_date is not null and i.due_date < current_date
           ) as overdue
    from public.v_credit_invoices i
    where i.owner_id = v_owner and i.rep_id is not null
    group by i.rep_id
  ),
  pay as (
    select p.rep_id as rid,
           coalesce(sum(p.amount), 0) as total,
           max(p.date) as last_date,
           coalesce(sum(p.amount) filter (where p.date >= v_month_start), 0) as month_total
    from public.payments p
    where p.owner_id = v_owner and p.rep_id is not null
    group by p.rep_id
  )
  select
    r.id,
    r.name,
    r.email,
    r.phone,
    r.is_active,
    r.notes,
    r.monthly_target,
    (r.user_id is not null),
    r.created_at,
    coalesce(cust.cnt, 0),
    coalesce(cash.cnt, 0),
    coalesce(cash.total, 0),
    coalesce(cred.cnt, 0),
    coalesce(cred.total, 0),
    coalesce(pay.total, 0),
    coalesce(cred.outstanding, 0),
    coalesce(cred.overdue, 0),
    coalesce(cash.month_total, 0) + coalesce(cred.month_total, 0),
    coalesce(pay.month_total, 0),
    nullif(
      greatest(
        coalesce(cash.last_date, '-infinity'::date),
        coalesce(cred.last_date, '-infinity'::date),
        coalesce(pay.last_date, '-infinity'::date)
      ),
      '-infinity'::date
    )
  from public.reps r
  left join cust on cust.rid = r.id
  left join cash on cash.rid = r.id
  left join cred on cred.rid = r.id
  left join pay on pay.rid = r.id
  where r.owner_id = v_owner
  order by r.is_active desc, r.created_at asc;
end;
$$;

comment on function public.rep_directory() is
  'Manager-only directory of reps with customer, invoice, collection and target metrics.';
