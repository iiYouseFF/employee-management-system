# AGENT.md — Employee Management System: Accounting & Management Features

> This file is the working brief for the coding agent. Read it fully before writing any code.
> Section 1 contains the original request verbatim. Sections 2+ turn it into an executable plan.

---

## 1. Original Request (verbatim)

Please help me implement 5 major management and accounting features into my existing Employee Management System built with React, TypeScript, Vite, Supabase, Tailwind CSS, and supporting RTL (Arabic/English).

Here are the details of the 5 features to add:

1. **Role-Based Access Control (RBAC):**
   - Two user roles stored/verified via Supabase: Manager (Admin) and Sales Rep.
   - Manager has full, unrestricted access to all data, reports, and team views.
   - Sales Rep has restricted, read-only access to view ONLY their own assigned customers, cash invoices, and credit transactions. They cannot edit records or view other reps' data.

2. **Supplier Cash & Credit Management (Accounts Payable):**
   - Add a complete supplier tracking module mirroring the customer structure.
   - Support tracking supplier purchases made with Cash vs. Credit, recording payments made to suppliers, and maintaining vendor profiles.

3. **Product Price List & Printable Catalog:**
   - Create a centralized product price list containing product names and prices.
   - Provide a clean, print-optimized view so sales reps can easily print or export a physical price sheet for client visits.

4. **Manager Financial KPI Dashboard:**
   - Build an executive dashboard for managers showing key financial metrics:
     - Income vs. Outcome (money collected vs. supplier/operational payouts).
     - Cash vs. Credit breakdown (liquidity vs. outstanding receivables).
     - Financial velocity metrics (how fast credit invoices are collected).

5. **Cumulative Accounting Statements (كشف حساب تراكمي):**
   - Update customer and supplier statement views to use a running balance (cumulative) accounting model.
   - Every transaction (invoice, payment, purchase) must calculate a row-by-row running balance, including opening balances for selected date ranges and clear debit/credit separation.

Please provide the necessary Supabase database schemas/migrations and the corresponding React components/hooks using Tailwind CSS and proper RTL layout support.

---

## 2. Stack & Ground Rules

| Area | Requirement |
|---|---|
| Frontend | React + TypeScript (strict) + Vite |
| Styling | Tailwind CSS only. Use **logical properties** (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`) — never `ml-*`/`mr-*`/`left-*`/`right-*` in new code |
| Backend | Supabase (Postgres, Auth, RLS, RPC/SQL functions) |
| i18n | Arabic (RTL) + English (LTR). All strings go through the existing i18n layer; no hard-coded text |
| Data fetching | Follow the existing pattern in the repo (React Query / custom hooks — match what is already used) |

**Before coding, the agent MUST:**
1. Inspect the repo: folder structure, existing Supabase client, auth/context, i18n setup, existing customer/invoice/payment tables and components.
2. Inspect the current Supabase schema (`supabase/migrations`, generated types). **Reuse existing tables and column names** — the SQL in this file uses assumed names (`customers`, `invoices`, `payments`, `profiles`) and must be adapted to reality.
3. Never drop or rewrite existing data. All migrations must be additive and idempotent where possible.
4. Match existing code style, naming, file layout, and component patterns.
5. Output a short plan (files to create/modify) before making changes.

**Money rules:** use `numeric(14,2)` in Postgres; never floats for money in SQL. Format with `Intl.NumberFormat` using the active locale. Keep a single currency constant/config.

---

## 3. Feature 1 — Role-Based Access Control (RBAC)

### Requirements
- Roles: `manager`, `sales_rep` (enum), stored on `profiles.role`, linked to `auth.users`.
- Manager: full CRUD and access to everything, including all reps' data, reports, dashboard, suppliers.
- Sales Rep: **read-only**, scoped strictly to their own customers, their customers' cash invoices and credit transactions. No insert/update/delete. No access to suppliers, KPI dashboard, or other reps.
- Enforcement must be **at the database level (RLS)**. UI hiding is only a convenience, never the security boundary.

### Database
```sql
create type public.app_role as enum ('manager', 'sales_rep');

alter table public.profiles
  add column if not exists role public.app_role not null default 'sales_rep';

-- Each customer is assigned to a rep (adapt if a column already exists)
alter table public.customers
  add column if not exists assigned_rep_id uuid references public.profiles(id);

create index if not exists idx_customers_rep on public.customers(assigned_rep_id);

-- Helper functions (SECURITY DEFINER avoids recursive RLS on profiles)
create or replace function public.current_role_name()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'manager', false)
$$;
```

### RLS pattern (apply to `customers`, `invoices`, `payments`/credit transactions)
```sql
alter table public.customers enable row level security;

create policy "manager_all_customers" on public.customers
  for all using (public.is_manager()) with check (public.is_manager());

create policy "rep_read_own_customers" on public.customers
  for select using (assigned_rep_id = auth.uid());

-- invoices / payments: rep may SELECT only rows belonging to their customers
create policy "rep_read_own_invoices" on public.invoices
  for select using (
    exists (select 1 from public.customers c
            where c.id = invoices.customer_id and c.assigned_rep_id = auth.uid())
  );
-- Repeat for payments. NO insert/update/delete policies for sales_rep.
```
Also: `profiles` — users can read their own row; managers can read/update all; **users must not be able to change their own `role`** (use a trigger or column-level restriction).

### Frontend
- `src/features/auth/useRole.ts` — returns `{ role, isManager, isSalesRep, loading }` from the profile.
- `src/features/auth/RequireRole.tsx` — route guard + `<Can role="manager">` inline wrapper.
- Hide/disable edit, delete, add buttons for sales reps (read-only mode). Redirect unauthorized routes to a localized "Access denied" page.
- Navigation items filtered by role.

### Acceptance criteria
- [ ] A sales rep querying another rep's customer via the Supabase client gets zero rows.
- [ ] A sales rep's insert/update/delete on any financial table fails at the DB.
- [ ] A sales rep cannot self-promote to manager.
- [ ] Manager sees everything.

---

## 4. Feature 2 — Supplier Cash & Credit Management (Accounts Payable)

### Requirements
Mirror the customer module's structure and UX: list, create/edit, profile page, statement.
- Vendor profile: name, phone, address, tax/ID number, notes, opening balance, active flag.
- Purchases: each purchase is `cash` or `credit`.
  - **Cash** → paid immediately (creates a payment record automatically or is flagged fully paid).
  - **Credit** → increases the amount owed to the supplier.
- Payments to suppliers: date, amount, method, reference, note; may be applied against the supplier's balance.
- Manager-only (RLS + UI).

### Database
```sql
create type public.payment_type as enum ('cash', 'credit');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  tax_number text,
  notes text,
  opening_balance numeric(14,2) not null default 0,  -- amount we owe at start (+)
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_date date not null default current_date,
  invoice_no text,
  payment_type public.payment_type not null,
  total_amount numeric(14,2) not null check (total_amount >= 0),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  method text,                -- cash / bank / cheque ...
  reference text,
  notes text,
  purchase_id uuid references public.supplier_purchases(id), -- optional allocation
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index on public.supplier_purchases(supplier_id, purchase_date);
create index on public.supplier_payments(supplier_id, payment_date);

alter table public.suppliers enable row level security;
alter table public.supplier_purchases enable row level security;
alter table public.supplier_payments enable row level security;

create policy "manager_all" on public.suppliers
  for all using (public.is_manager()) with check (public.is_manager());
-- same manager-only policy on supplier_purchases and supplier_payments
```
Cash purchases: either (a) a trigger inserts a matching `supplier_payments` row, or (b) the statement treats cash purchases as debit and credit netting to zero. **Pick one, document it, and keep Features 4 and 5 consistent with it.**

### Frontend
```
src/features/suppliers/
  hooks/useSuppliers.ts, useSupplierPurchases.ts, useSupplierPayments.ts
  components/SupplierList.tsx, SupplierForm.tsx, SupplierProfile.tsx,
             PurchaseForm.tsx, SupplierPaymentForm.tsx
  pages/SuppliersPage.tsx, SupplierDetailsPage.tsx
```
- Cash/Credit toggle on the purchase form; show remaining balance on supplier cards.
- Zod (or existing validation lib) schemas for every form.

### Acceptance criteria
- [ ] Create/edit a supplier; record cash and credit purchases; record payments.
- [ ] Supplier balance = opening + credit purchases − payments (cash purchases net to zero).
- [ ] Sales reps cannot see the module (route + RLS).

---

## 5. Feature 3 — Product Price List & Printable Catalog

### Requirements
- Central `products` table (name Arabic/English, SKU optional, unit, price, active flag, optional category).
- Manager: full CRUD. Sales rep: read-only view + print.
- Print-optimized view: clean A4 layout, company header, date, table of products and prices, page breaks that don't split rows, no app chrome (nav, buttons).
- Export: print dialog (`window.print()`) and optionally CSV/PDF export.

### Database
```sql
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text,
  sku text unique,
  category text,
  unit text default 'piece',
  price numeric(14,2) not null check (price >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
create policy "manager_all_products" on public.products
  for all using (public.is_manager()) with check (public.is_manager());
create policy "authenticated_read_products" on public.products
  for select using (auth.uid() is not null and is_active);
```

### Frontend
```
src/features/products/
  hooks/useProducts.ts
  components/ProductTable.tsx, ProductForm.tsx, PriceListPrintView.tsx
  pages/ProductsPage.tsx, PriceListPrintPage.tsx
```
- Print CSS using Tailwind `print:` variants (`print:hidden`, `print:break-inside-avoid`, `print:text-black`), plus an `@page { size: A4; margin: 12mm }` rule.
- Direction follows the active language (`dir="rtl"` for Arabic); the print view must render correctly in both.
- Search/filter by category; option to choose which language the printed sheet uses.

### Acceptance criteria
- [ ] Printing hides all app chrome and fits A4 cleanly in RTL and LTR.
- [ ] Rep can print but cannot edit prices.

---

## 6. Feature 4 — Manager Financial KPI Dashboard

### Requirements (manager-only)
Date-range filter (this month / last month / custom) applied to all widgets.

1. **Income vs. Outcome**
   - Income = money actually collected (cash invoices + payments received on credit invoices).
   - Outcome = supplier payments (incl. cash purchases) + operational expenses (add an `expenses` table if none exists).
   - Show net cash flow and a period-over-period comparison; chart by day/week.
2. **Cash vs. Credit breakdown**
   - Cash sales vs. credit sales in the period (amount + %).
   - Liquidity (cash collected) vs. outstanding receivables (unpaid credit balance), plus accounts payable owed to suppliers.
3. **Financial velocity**
   - **DSO** (days sales outstanding) = outstanding receivables ÷ credit sales × days in period.
   - **Average collection time** (days between credit invoice date and full payment).
   - Collection rate (% of credit invoices collected within 30 days) and an aging breakdown (0–30, 31–60, 61–90, 90+).

### Database
Implement as SQL functions (`security definer`, manager-checked) so aggregation runs in Postgres, not the browser:
```sql
create or replace function public.kpi_summary(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'forbidden'; end if;
  -- return jsonb: income, outcome, cash_sales, credit_sales,
  -- receivables, payables, dso, avg_collection_days, collection_rate_30d
  -- Adapt to the real invoices/payments schema.
end $$;

create or replace function public.receivables_aging(p_as_of date default current_date)
returns table(bucket text, amount numeric) ...;

create or replace function public.cashflow_series(p_from date, p_to date, p_bucket text)
returns table(period date, income numeric, outcome numeric) ...;
```
Add optional `expenses` table (manager-only RLS) if the system has no operational expenses yet.

### Frontend
```
src/features/dashboard/
  hooks/useKpiSummary.ts, useCashflowSeries.ts, useReceivablesAging.ts
  components/KpiCard.tsx, IncomeOutcomeChart.tsx, CashCreditDonut.tsx,
             AgingBars.tsx, VelocityPanel.tsx, DateRangeFilter.tsx
  pages/ManagerDashboardPage.tsx
```
- Use the charting lib already in the repo; if none, add `recharts`.
- Responsive grid, skeleton loaders, empty states, localized number/date formatting, RTL-aware charts (mirror axis/legend where needed).

### Acceptance criteria
- [ ] Numbers reconcile with the customer/supplier statements for the same period.
- [ ] Sales rep gets `forbidden` from the RPC and cannot open the route.

---

## 7. Feature 5 — Cumulative Accounting Statements (كشف حساب تراكمي)

### Requirements
Rewrite customer and supplier statements as a **running-balance ledger**.
- Selectable date range `[from, to]`.
- First row: **Opening balance** = all transactions before `from` (+ the account's stored opening balance).
- Every transaction is one row with separate **Debit (مدين)** and **Credit (دائن)** columns and a **running Balance (الرصيد)** computed row by row, in chronological order (tie-break by `created_at`, then `id`).
- Final row: closing balance and totals of debit/credit.

**Sign conventions (document in code):**

| Account | Debit increases | Credit decreases |
|---|---|---|
| Customer (receivable) | Invoice (credit sale) | Payment received / returns |
| Supplier (payable) | Payment made to supplier | Credit purchase |

Show the balance with a clear label (مدين / دائن or Dr/Cr) and consistent sign handling for the supplier side.

### Database
Compute in SQL with window functions so the balance is correct and fast:
```sql
create or replace function public.customer_statement(
  p_customer_id uuid, p_from date, p_to date)
returns table(
  row_no bigint, tx_date date, tx_type text, ref text, description text,
  debit numeric, credit numeric, balance numeric)
language sql stable security invoker set search_path = public as $$
  with opening as (
    select coalesce(c.opening_balance,0)
         + coalesce(sum(case when t.kind='invoice' then t.amount else -t.amount end),0) as bal
    from public.customers c
    left join public.v_customer_transactions t
      on t.customer_id = c.id and t.tx_date < p_from
    where c.id = p_customer_id
    group by c.id, c.opening_balance
  ),
  period as (
    select t.*, case when t.kind='invoice' then t.amount else 0 end as debit,
                case when t.kind<>'invoice' then t.amount else 0 end as credit
    from public.v_customer_transactions t
    where t.customer_id = p_customer_id and t.tx_date between p_from and p_to
  )
  select 0, p_from, 'opening', null, 'Opening balance', null, null, (select bal from opening)
  union all
  select row_number() over w, tx_date, kind, ref, description, debit, credit,
         (select bal from opening) + sum(debit - credit) over w
  from period
  window w as (order by tx_date, created_at, id)
  order by 1;
$$;
-- Create v_customer_transactions as a UNION ALL view of invoices (+ payments, returns).
-- Create the equivalent supplier_statement() with the supplier sign convention.
```
`security invoker` keeps RLS in force: a rep sees only their own customers' statement; supplier statements are manager-only.

### Frontend
```
src/features/statements/
  hooks/useCustomerStatement.ts, useSupplierStatement.ts
  components/StatementTable.tsx, StatementFilters.tsx, StatementPrintView.tsx
```
- One shared `StatementTable` used by both customer and supplier views.
- Sticky header, Debit/Credit/Balance columns right-aligned numerically (`tabular-nums`, `text-end`), opening and closing rows visually distinct.
- Print/export (CSV + print view) with the same print rules as Feature 3.
- Arabic headings: التاريخ، البيان، المرجع، مدين، دائن، الرصيد.

### Acceptance criteria
- [ ] Opening balance for a mid-month range equals the closing balance of the day before.
- [ ] Closing balance equals the account balance shown on profile/dashboard.
- [ ] Debit and credit totals reconcile with the running balance.
- [ ] Works in RTL and LTR; reps only see their own customers.

---

## 8. Cross-Cutting Requirements

### RTL / i18n
- Root `dir` and `lang` set from the active language; Tailwind logical utilities only.
- Mirror icons that imply direction (arrows, chevrons) using `rtl:rotate-180` or `rtl:-scale-x-100`.
- Numbers in Arabic UI: decide Western vs Eastern digits once (config) and apply consistently, including in print.
- Add all new keys to **both** `ar` and `en` translation files.

### Quality
- TypeScript strict; regenerate Supabase types after migrations (`supabase gen types typescript`).
- Loading, empty, and error states on every data view.
- No `any`; shared types in `src/types`.
- Unit tests for running-balance logic and KPI formulas; at least one RLS test per role (SQL or integration).
- Accessibility: labels, keyboard navigation, contrast.

### Security
- RLS enabled on **every** new table. No table left public.
- No service-role key in the frontend.
- Role changes are manager-only; audit `created_by` on financial rows.

---

## 9. Suggested Implementation Order

1. Audit existing repo + schema → write the plan.
2. Migration 001: roles, `assigned_rep_id`, helper functions, RLS on existing tables (Feature 1).
3. Frontend auth: `useRole`, route guards, read-only UI mode.
4. Migration 002: suppliers, purchases, payments + RLS → supplier UI (Feature 2).
5. Migration 003: `products` + RLS → price list + print view (Feature 3).
6. Migration 004: statement view/functions → shared `StatementTable` (Feature 5), since Feature 4 depends on the same ledger logic.
7. Migration 005: KPI functions (+ `expenses`) → dashboard (Feature 4).
8. i18n sweep, RTL review, print review, tests, regenerate types.

## 10. Deliverables

- `supabase/migrations/NNN_*.sql` — one file per step above, each with a short header comment and rollback notes.
- React hooks and components in the feature folders listed above.
- Updated routes, navigation, and i18n files.
- `docs/accounting-model.md` — sign conventions, how cash/credit is treated, KPI formulas.
- A final summary: what changed, how to run migrations, how to test each role.

## 11. Definition of Done

- All five features work end to end for both roles in Arabic (RTL) and English (LTR).
- RLS verified: rep isolation and read-only enforcement hold at the database level.
- Statement balances, dashboard figures, and profile balances agree.
- Print views render cleanly on A4.
- `npm run build` and type-check pass with no errors.