-- Migration 0010: RBAC, Suppliers, Products, Statements, KPIs & Expenses

-- 1. Customers Table Adjustments & RLS
alter table public.customers enable row level security;
alter table public.customers add column if not exists opening_balance numeric(14,2) not null default 0;

-- 2. Helper functions for Role check
create or replace function public.is_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1 from public.reps
    where user_id = auth.uid()
       or (email is not null and lower(trim(email)) = lower(trim(coalesce(auth.jwt()->>'email', ''))))
  );
$$;

create or replace function public.get_manager_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select owner_id from public.reps
     where user_id = auth.uid()
        or (email is not null and lower(trim(email)) = lower(trim(coalesce(auth.jwt()->>'email', ''))))
     limit 1),
    auth.uid()
  );
$$;

-- Secure Customers RLS
drop policy if exists "rep select customers" on public.customers;
create policy "rep select customers" on public.customers for select
  using (
    (public.is_manager() and owner_id = auth.uid())
    or representative_id = public.get_current_rep_id()
    or id in (
      select customer_id from public.cash_invoices where rep_id = public.get_current_rep_id()
      union
      select customer_id from public.credit_invoices where rep_id = public.get_current_rep_id()
      union
      select customer_id from public.payments where rep_id = public.get_current_rep_id()
    )
  );

drop policy if exists "manager insert customers" on public.customers;
create policy "manager insert customers" on public.customers for insert
  with check (public.is_manager() and owner_id = auth.uid());

drop policy if exists "manager update customers" on public.customers;
create policy "manager update customers" on public.customers for update
  using (public.is_manager() and owner_id = auth.uid())
  with check (public.is_manager() and owner_id = auth.uid());

drop policy if exists "manager delete customers" on public.customers;
create policy "manager delete customers" on public.customers for delete
  using (public.is_manager() and owner_id = auth.uid());

drop policy if exists "own rows customers" on public.customers;
drop policy if exists "own rows" on public.customers;

-- Restrict write operations on financial tables for non-managers
drop policy if exists "own rows cash" on public.cash_invoices;
drop policy if exists "own rows" on public.cash_invoices;
create policy "manager insert cash" on public.cash_invoices for insert
  with check (public.is_manager() and owner_id = auth.uid());
create policy "manager update cash" on public.cash_invoices for update
  using (public.is_manager() and owner_id = auth.uid())
  with check (public.is_manager() and owner_id = auth.uid());
create policy "manager delete cash" on public.cash_invoices for delete
  using (public.is_manager() and owner_id = auth.uid());
create policy "manager select cash" on public.cash_invoices for select
  using (public.is_manager() and owner_id = auth.uid());

drop policy if exists "own rows credit" on public.credit_invoices;
drop policy if exists "own rows" on public.credit_invoices;
create policy "manager insert credit" on public.credit_invoices for insert
  with check (public.is_manager() and owner_id = auth.uid());
create policy "manager update credit" on public.credit_invoices for update
  using (public.is_manager() and owner_id = auth.uid())
  with check (public.is_manager() and owner_id = auth.uid());
create policy "manager delete credit" on public.credit_invoices for delete
  using (public.is_manager() and owner_id = auth.uid());
create policy "manager select credit" on public.credit_invoices for select
  using (public.is_manager() and owner_id = auth.uid());

drop policy if exists "own rows payments" on public.payments;
drop policy if exists "own rows" on public.payments;
create policy "manager insert payments" on public.payments for insert
  with check (public.is_manager() and owner_id = auth.uid());
create policy "manager update payments" on public.payments for update
  using (public.is_manager() and owner_id = auth.uid())
  with check (public.is_manager() and owner_id = auth.uid());
create policy "manager delete payments" on public.payments for delete
  using (public.is_manager() and owner_id = auth.uid());
create policy "manager select payments" on public.payments for select
  using (public.is_manager() and owner_id = auth.uid());

-- 3. Feature 2: Suppliers, Purchases, Payments (Accounts Payable)
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  phone text,
  address text,
  tax_number text,
  notes text,
  opening_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_purchases (
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

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  method text default 'نقدي' check (method in ('نقدي','تحويل بنكي','شيك','محفظة إلكترونية','آجل')),
  reference text,
  notes text,
  purchase_id uuid references public.supplier_purchases(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_purchases_supp on public.supplier_purchases(supplier_id, purchase_date);
create index if not exists idx_supplier_payments_supp on public.supplier_payments(supplier_id, payment_date);

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

-- 4. Feature 3: Products Price List
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name_ar text not null,
  name_en text,
  sku text,
  category text,
  unit text default 'قطعة',
  price numeric(14,2) not null check (price >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "manager_all_products" on public.products
  for all using (public.is_manager() and owner_id = auth.uid())
  with check (public.is_manager() and owner_id = auth.uid());

create policy "authenticated_read_products" on public.products
  for select using (auth.uid() is not null and is_active and owner_id = public.get_manager_id());

-- 5. Operational Expenses Table (for KPI outcome calculations)
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null default current_date,
  category text not null default 'مصاريف عامة',
  amount numeric(14,2) not null check (amount > 0),
  description text,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

create policy "manager_all_expenses" on public.expenses
  for all using (public.is_manager() and owner_id = auth.uid())
  with check (public.is_manager() and owner_id = auth.uid());

-- 6. Feature 5: Cumulative Statements (كشف حساب تراكمي)
-- Unified transactions view for customer ledger
create or replace view public.v_customer_transactions as
  select
    ci.owner_id,
    ci.customer_id,
    ci.date as tx_date,
    'invoice'::text as kind,
    ci.invoice_no as ref,
    coalesce(ci.item, 'فاتورة آجل') as description,
    ci.amount as amount,
    ci.created_at,
    ci.id
  from public.credit_invoices ci
  where ci.customer_id is not null
  union all
  select
    p.owner_id,
    p.customer_id,
    p.date as tx_date,
    'payment'::text as kind,
    coalesce(ci.invoice_no, 'دفعة') as ref,
    case when p.method is not null then 'سداد - ' || p.method else 'سداد دفعة' end as description,
    p.amount as amount,
    p.created_at,
    p.id
  from public.payments p
  left join public.credit_invoices ci on ci.id = p.credit_invoice_id
  where p.customer_id is not null;

-- Customer cumulative statement RPC
create or replace function public.customer_statement(
  p_customer_id uuid,
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
    select coalesce(c.opening_balance, 0)
         + coalesce(sum(case when t.kind = 'invoice' then t.amount else -t.amount end), 0) as bal
    from public.customers c
    left join public.v_customer_transactions t
      on t.customer_id = c.id and t.tx_date < p_from
    where c.id = p_customer_id
    group by c.id, c.opening_balance
  ),
  period as (
    select 
      t.id,
      t.tx_date,
      t.kind,
      t.ref,
      t.description,
      t.created_at,
      case when t.kind = 'invoice' then t.amount else 0 end as debit,
      case when t.kind <> 'invoice' then t.amount else 0 end as credit
    from public.v_customer_transactions t
    where t.customer_id = p_customer_id and t.tx_date between p_from and p_to
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
    coalesce((select bal from opening), 0) + sum(debit - credit) over (order by tx_date, created_at, id rows between unbounded preceding and current row) as balance
  from period
  order by row_no;
$$;

-- Supplier transactions view & cumulative statement RPC
create or replace view public.v_supplier_transactions as
  select
    sp.owner_id,
    sp.supplier_id,
    sp.purchase_date as tx_date,
    'purchase'::text as kind,
    sp.invoice_no as ref,
    coalesce(sp.notes, case when sp.payment_type = 'cash' then 'مشتريات نقدي' else 'مشتريات آجل' end) as description,
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
    case when pay.notes is not null and pay.notes <> '' then pay.notes else 'سداد للمورد (' || coalesce(pay.method, 'نقدي') || ')' end as description,
    pay.amount as amount,
    'payment'::text as payment_type,
    pay.created_at,
    pay.id
  from public.supplier_payments pay;

create or replace function public.supplier_statement(
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
    coalesce((select bal from opening), 0) + sum(credit - debit) over (order by tx_date, created_at, id rows between unbounded preceding and current row) as balance
  from period
  order by row_no;
$$;

-- 7. Feature 4: Manager Financial KPI Dashboard RPCs
create or replace function public.kpi_summary(p_from date default current_date - interval '30 days', p_to date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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

  v_owner_id := auth.uid();
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
$$;

-- Receivables Aging buckets
create or replace function public.receivables_aging(p_as_of date default current_date)
returns table(bucket text, amount numeric)
language sql
stable
security definer
set search_path = public
as $$
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
    where ci.owner_id = auth.uid()
    group by ci.id
    having (ci.amount - ci.paid - coalesce(sum(p.amount), 0)) > 0
  ) r on r.bucket = b.bucket
  group by b.sort_order, b.bucket
  order by b.sort_order;
$$;

-- Cashflow series for charting
create or replace function public.cashflow_series(
  p_from date default current_date - interval '30 days',
  p_to date default current_date
)
returns table(tx_date date, income numeric, outcome numeric)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select generate_series(p_from::timestamp, p_to::timestamp, '1 day')::date as d
  ),
  incomes as (
    select date as d, sum(amount) as inc
    from (
      select date, amount from public.cash_invoices where owner_id = auth.uid()
      union all
      select date, amount from public.payments where owner_id = auth.uid()
    ) combined_inc
    where date between p_from and p_to
    group by date
  ),
  outcomes as (
    select d, sum(amount) as out_amt
    from (
      select payment_date as d, amount from public.supplier_payments where owner_id = auth.uid()
      union all
      select purchase_date as d, total_amount as amount from public.supplier_purchases where owner_id = auth.uid() and payment_type = 'cash'
      union all
      select date as d, amount from public.expenses where owner_id = auth.uid()
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
$$;
