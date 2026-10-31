-- 0013_simplify_suppliers.sql
-- Purpose: rebuild the suppliers module as a simpler, customers-style module.
--
-- Adds:
--   * suppliers (name, phone, notes, opening_balance, is_active) - mirrors customers
--   * supplier_purchases (cash/credit, total_amount, invoice_no, notes)
--   * supplier_payments (amount, method, reference, notes) - no purchase allocation
--   * indexes, RLS (manager-only, owner scoped)
--   * v_supplier_transactions view (credit purchases + payments)
--   * supplier_statement() cumulative ledger RPC
--
-- DESTRUCTIVE: drops and recreates the three supplier tables, so all existing
-- supplier data is intentionally discarded (approved by the project owner).
-- `kpi_summary` / `cashflow_series` bodies are not dependency-tracked, so they
-- keep working against the recreated tables.
--
-- Rollback (manual, in this order):
--   drop function if exists public.supplier_statement(uuid, date, date);
--   drop view if exists public.v_supplier_transactions;
--   drop table if exists public.supplier_payments;
--   drop table if exists public.supplier_purchases;
--   drop table if exists public.suppliers;
--   -- then re-apply supabase/migrations/0010_all_features_management.sql
--   -- section "3. Feature 2" and the supplier view/RPC block.

drop function if exists public.supplier_statement(uuid, date, date);
drop view if exists public.v_supplier_transactions;
drop table if exists public.supplier_payments;
drop table if exists public.supplier_purchases;
drop table if exists public.suppliers;

-- 1. Suppliers (vendor profile)
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  phone text,
  notes text,
  opening_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_suppliers_owner on public.suppliers(owner_id, name);

-- 2. Purchases (cash purchases settle immediately, credit purchases raise the payable)
create table public.supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_date date not null default current_date,
  invoice_no text,
  payment_type text not null default 'credit' check (payment_type in ('cash', 'credit')),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_purchases_supp
  on public.supplier_purchases(supplier_id, purchase_date);

-- 3. Payments made to suppliers
create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  method text default 'نقدي',
  reference text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_payments_supp
  on public.supplier_payments(supplier_id, payment_date);

-- 4. RLS: manager-only, owner scoped (sales reps have no access)
alter table public.suppliers enable row level security;
alter table public.supplier_purchases enable row level security;
alter table public.supplier_payments enable row level security;

create policy "manager_all_suppliers" on public.suppliers
  for all using (public.is_manager() and owner_id = auth.uid())
  with check (public.is_manager() and owner_id = auth.uid());

create policy "manager_all_purchases" on public.supplier_purchases
  for all using (public.is_manager() and owner_id = auth.uid())
  with check (public.is_manager() and owner_id = auth.uid());

create policy "manager_all_supplier_payments" on public.supplier_payments
  for all using (public.is_manager() and owner_id = auth.uid())
  with check (public.is_manager() and owner_id = auth.uid());

-- 5. Ledger source view: credit purchases (payable up) + payments (payable down)
create view public.v_supplier_transactions as
  select
    sp.owner_id,
    sp.supplier_id,
    sp.purchase_date as tx_date,
    'purchase'::text as kind,
    sp.invoice_no as ref,
    coalesce(sp.notes, 'مشتريات آجل') as description,
    sp.total_amount as amount,
    sp.payment_type,
    sp.created_at,
    sp.id
  from public.supplier_purchases sp
  where sp.payment_type = 'credit'
  union all
  select
    pay.owner_id,
    pay.supplier_id,
    pay.payment_date as tx_date,
    'payment'::text as kind,
    pay.reference as ref,
    case
      when pay.notes is not null and pay.notes <> '' then pay.notes
      else 'سداد للمورد (' || coalesce(pay.method, 'نقدي') || ')'
    end as description,
    pay.amount as amount,
    'payment'::text as payment_type,
    pay.created_at,
    pay.id
  from public.supplier_payments pay;

-- 6. Cumulative supplier statement (running balance, payable convention)
create function public.supplier_statement(
  p_supplier_id uuid,
  p_from date default '2000-01-01',
  p_to date default '2099-12-31'
)
returns table(
  row_no bigint,
  tx_date date,
  tx_type text,
  ref text,
  description text,
  debit numeric,
  credit numeric,
  balance numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with opening as (
    select coalesce(s.opening_balance, 0)
         + coalesce(sum(case when t.kind = 'purchase' then t.amount else -t.amount end), 0) as bal
    from public.suppliers s
    left join public.v_supplier_transactions t
      on t.supplier_id = s.id and t.tx_date < p_from
    where s.id = p_supplier_id
    group by s.id, s.opening_balance
  ),
  period as (
    select
      t.id,
      t.tx_date,
      t.kind,
      t.ref,
      t.description,
      t.created_at,
      case when t.kind = 'payment' then t.amount else 0 end as debit,
      case when t.kind = 'purchase' then t.amount else 0 end as credit
    from public.v_supplier_transactions t
    where t.supplier_id = p_supplier_id and t.tx_date between p_from and p_to
  )
  select
    0::bigint as row_no,
    p_from as tx_date,
    'opening'::text as tx_type,
    null::text as ref,
    'رصيد أول المدة'::text as description,
    null::numeric as debit,
    null::numeric as credit,
    coalesce((select bal from opening), 0) as balance
  union all
  select
    row_number() over (order by tx_date, created_at, id) as row_no,
    tx_date,
    kind as tx_type,
    ref,
    description,
    debit,
    credit,
    coalesce((select bal from opening), 0)
      + sum(credit - debit) over (order by tx_date, created_at, id rows between unbounded preceding and current row) as balance
  from period
  order by row_no;
$$;
