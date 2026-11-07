-- 0015_multi_manager_tenant_fix.sql
-- Goal: a second manager who shares a tenant must operate on the SAME data as
-- the tenant owner (user_roles.owner_id), not on rows keyed to their own auth uid.
--
-- Three fixes:
--   1. kpi_summary(): scope by public.current_owner_id() instead of auth.uid()
--   2. supplier policies: owner_id = public.current_owner_id()
--   3. owner_id column defaults -> public.current_owner_id() (defence in depth)
--
-- Additive and idempotent (no data rewritten, no rows deleted).
--
-- Rollback: exact inverse statements are at the bottom of this file
--   (column defaults back to auth.uid(), 0011 supplier policies, 0011 kpi_summary).

-- ---------------------------------------------------------------------------
-- 1. KPI summary scoped to the tenant owner
--    Body is identical to the deployed 0011 definition; the ONLY change is
--    v_owner_id := auth.uid()  ->  v_owner_id := public.current_owner_id()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kpi_summary(p_from date DEFAULT (CURRENT_DATE - '30 days'::interval), p_to date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_income numeric;
  v_outcome numeric;
  v_cash_sales numeric;
  v_credit_sales numeric;
  v_receivables numeric;
  v_payables numeric;
  v_dso numeric;
  v_avg_collection_days numeric;
  v_collection_rate_30d numeric;
  v_days int;
  v_owner_id uuid;
begin
  if not public.is_manager() then
    raise exception 'forbidden: managers only';
  end if;

  v_owner_id := public.current_owner_id();
  v_days := greatest(1, (p_to - p_from + 1));

  -- Income: Cash invoices + payments received in the period
  select coalesce(sum(amount), 0) into v_cash_sales
  from public.cash_invoices
  where owner_id = v_owner_id and date between p_from and p_to;

  select coalesce(sum(amount), 0) into v_credit_sales
  from public.credit_invoices
  where owner_id = v_owner_id and date between p_from and p_to;

  select (v_cash_sales + coalesce(sum(amount), 0)) into v_income
  from public.payments
  where owner_id = v_owner_id and date between p_from and p_to;

  -- Outcome: Supplier payments + Cash purchases + operational expenses
  select (
    coalesce((select sum(amount) from public.supplier_payments where owner_id = v_owner_id and payment_date between p_from and p_to), 0)
    + coalesce((select sum(total_amount) from public.supplier_purchases where owner_id = v_owner_id and payment_type = 'cash' and purchase_date between p_from and p_to), 0)
    + coalesce((select sum(amount) from public.expenses where owner_id = v_owner_id and date between p_from and p_to), 0)
  ) into v_outcome;

  -- Total Outstanding Receivables (Customer remaining balances across system)
  select coalesce(sum(remaining), 0) into v_receivables
  from (
    select (ci.amount - ci.paid - coalesce(sum(p.amount), 0)) as remaining
    from public.credit_invoices ci
    left join public.payments p on p.credit_invoice_id = ci.id
    where ci.owner_id = v_owner_id
    group by ci.id
  ) r;

  -- Total Outstanding Accounts Payable (Suppliers)
  select coalesce(
    (select sum(opening_balance) from public.suppliers where owner_id = v_owner_id)
    + (select coalesce(sum(total_amount), 0) from public.supplier_purchases where owner_id = v_owner_id and payment_type = 'credit')
    - (select coalesce(sum(amount), 0) from public.supplier_payments where owner_id = v_owner_id),
    0
  ) into v_payables;

  -- DSO = (Receivables / Credit Sales) * Days
  if v_credit_sales > 0 then
    v_dso := round((v_receivables / v_credit_sales) * v_days, 1);
  else
    v_dso := 0;
  end if;

  -- Average collection days
  select coalesce(round(avg(p.date - ci.date), 1), 0) into v_avg_collection_days
  from public.payments p
  join public.credit_invoices ci on ci.id = p.credit_invoice_id
  where p.owner_id = v_owner_id and p.date between p_from and p_to;

  -- Collection rate in 30 days
  select coalesce(
    round((count(case when p.date - ci.date <= 30 then 1 end)::numeric / nullif(count(*), 0)) * 100, 1),
    0
  ) into v_collection_rate_30d
  from public.payments p
  join public.credit_invoices ci on ci.id = p.credit_invoice_id
  where p.owner_id = v_owner_id and p.date between p_from and p_to;

  return jsonb_build_object(
    'income', v_income,
    'outcome', v_outcome,
    'net_profit', (v_income - v_outcome),
    'cash_sales', v_cash_sales,
    'credit_sales', v_credit_sales,
    'receivables', v_receivables,
    'payables', v_payables,
    'dso', v_dso,
    'avg_collection_days', v_avg_collection_days,
    'collection_rate_30d', v_collection_rate_30d
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Supplier tables: policies must follow the tenant, not the auth uid
-- ---------------------------------------------------------------------------
drop policy if exists manager_all_suppliers on public.suppliers;
create policy manager_all_suppliers on public.suppliers
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

drop policy if exists manager_all_purchases on public.supplier_purchases;
create policy manager_all_purchases on public.supplier_purchases
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

drop policy if exists manager_all_supplier_payments on public.supplier_payments;
create policy manager_all_supplier_payments on public.supplier_payments
  for all
  using (public.is_manager() and owner_id = public.current_owner_id())
  with check (public.is_manager() and owner_id = public.current_owner_id());

-- ---------------------------------------------------------------------------
-- 3. Column defaults follow the tenant (any manager in the tenant can insert)
-- ---------------------------------------------------------------------------
alter table public.customers           alter column owner_id set default public.current_owner_id();
alter table public.cash_invoices       alter column owner_id set default public.current_owner_id();
alter table public.credit_invoices     alter column owner_id set default public.current_owner_id();
alter table public.payments            alter column owner_id set default public.current_owner_id();
alter table public.products            alter column owner_id set default public.current_owner_id();
alter table public.reps                alter column owner_id set default public.current_owner_id();
alter table public.expenses            alter column owner_id set default public.current_owner_id();
alter table public.suppliers           alter column owner_id set default public.current_owner_id();
alter table public.supplier_purchases  alter column owner_id set default public.current_owner_id();
alter table public.supplier_payments   alter column owner_id set default public.current_owner_id();
alter table public.app_settings        alter column owner_id set default public.current_owner_id();

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- alter table public.customers           alter column owner_id set default auth.uid();
-- alter table public.cash_invoices       alter column owner_id set default auth.uid();
-- alter table public.credit_invoices     alter column owner_id set default auth.uid();
-- alter table public.payments            alter column owner_id set default auth.uid();
-- alter table public.products            alter column owner_id set default auth.uid();
-- alter table public.reps                alter column owner_id set default auth.uid();
-- alter table public.expenses            alter column owner_id set default auth.uid();
-- alter table public.suppliers           alter column owner_id set default auth.uid();
-- alter table public.supplier_purchases  alter column owner_id set default auth.uid();
-- alter table public.supplier_payments   alter column owner_id set default auth.uid();
-- alter table public.app_settings        alter column owner_id set default auth.uid();  -- original: no default
-- drop policy manager_all_suppliers            on public.suppliers;
-- drop policy manager_all_purchases            on public.supplier_purchases;
-- drop policy manager_all_supplier_payments    on public.supplier_payments;
-- then recreate each as: for all using (public.is_manager() and owner_id = auth.uid())
--   with check (public.is_manager() and owner_id = auth.uid());
-- kpi_summary: re-run the 0011 definition (v_owner_id uuid := auth.uid()).
