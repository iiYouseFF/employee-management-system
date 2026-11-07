# Employee Management System

An Arabic-first (RTL) sales and accounting system for a food-distribution business. It tracks cash and credit invoices, customer and supplier balances, payments, expenses, product price lists, and manager-facing financial KPIs - with role-based access control enforced in the database.

Built with React 19, TypeScript, Vite, Supabase (PostgreSQL + Auth), TanStack Query, Tailwind CSS, and Recharts.

---

## Table of Contents

1. [The Idea](#the-idea)
2. [How It Works](#how-it-works)
3. [Features](#features)
4. [UI Concepts](#ui-concepts)
5. [Tech Stack](#tech-stack)
6. [Getting Started](#getting-started)
7. [Available Scripts](#available-scripts)
8. [Project Structure](#project-structure)
9. [Database Overview](#database-overview)
10. [Roles and Access Control](#roles-and-access-control)
11. [Usage](#usage)
12. [Deployment](#deployment)
13. [Contributing](#contributing)
14. [License](#license)

---

## The Idea

The system replaces the paper-and-spreadsheet workflow of a small distribution business with a single, shared source of truth.

- **Managers** run the business: they manage sales reps and customers, record invoices, payments, supplier purchases and expenses, and read financial reports.
- **Sales reps** work in the field: they need to look up their own customers, see what those customers owe, and print a current price list for client visits - but they must not see other reps' data or change any records.
- **Money is tracked as a ledger**, not just a list of invoices. Every customer and supplier has a running balance built from an opening balance plus every transaction in date order, so the answer to how much a customer owes right now is always consistent across statements, profiles, and reports.

The UI is Arabic-first and right-to-left, with full English/LTR support through Tailwind logical properties.

### Money rules

- All monetary amounts are stored as numeric(14,2) in Postgres.
- The frontend formats amounts with the active locale and uses tabular numerals for stable alignment.
- Monetary aggregation that must be exact (statements, KPIs, balances) runs in SQL using numeric arithmetic - never floats in the database.

---

## How It Works

- The frontend is a single-page React app. After login, a tabbed shell hosts every module.
- Data lives in Supabase Postgres. The browser talks to it with the public anon key; TanStack Query handles caching, invalidation, and loading/error states.
- Security is enforced in Postgres, not the UI. Row Level Security (RLS) policies and security definer RPC functions decide what each role can read and write. Hiding a button is only a convenience - a sales rep querying another rep's rows receives zero rows.
- Aggregation that would be expensive in the browser runs as SQL functions and views in Postgres.

---

## Features

### Cash and Credit Invoices

- Cash invoices record an immediate sale and count as collected money immediately.
- Credit invoices record a receivable with a due date and optional down payment. The remaining balance drives the customer running balance and receivables/aging metrics.

### Payments and Allocation

- Payments record money received from a customer, optionally linked to a specific credit invoice.
- A payment can be allocated to a specific credit invoice or left unallocated.

### Cumulative Customer Statements

- The Statement tab renders a running-balance ledger for one or more customers over a selectable date range.
- The first row is an opening balance. Each transaction is one row with Debit, Credit, and running Balance columns.
- Final row: closing balance plus debit/credit totals. The ledger can be printed or exported as CSV.

### Monthly Summary and Reports

- Aggregates cash sales, credit sales, collections, outstanding balances, and invoice counts per month.
- Includes Detailed, Matrix, and Separate views, plus printable reports with print and CSV export.

### Customer Management

- Customer profiles store name, phone, opening balance, and the assigned sales rep.

### Sales Rep Management

- Manage the list of reps and link rep records to Supabase Auth accounts by email.

### Supplier Cash and Credit Management (Accounts Payable)

- A supplier module mirrors customers: vendor profile, cash/credit purchases, supplier payments.

### Expenses

- Operational expenses are recorded and included in the manager dashboard and cashflow series.

### Product Price List and Printable Catalog

- A central products table holds names, unit, price, category, and active flag.
- Sales reps get a read-only view and a print-optimized A4 catalog, plus CSV export.

### Manager Financial KPI Dashboard

- Income vs. outcome, cash vs. credit breakdown, and financial velocity (DSO, collection time, aging).

### Role-Based Access Control (RBAC)

- Manager has full access; sales rep has read-only access to their own customers and invoices.

### Authentication

- Signup, login, and password recovery via Supabase Auth.

---

## UI Concepts

- Arabic-first, RTL by default, with English/LTR support through Tailwind logical properties.
- Tajawal typography with system-font fallbacks.
- A restrained palette: deep blue primary (#1a4971), accent (#245e8e), soft tint (#f0f6fc), white surfaces, borders (#dde5ef), page background (#f4f7fb).
- Excel-style data entry via .excel-input and .amount-input classes.
- A single tabbed shell for the whole app.
- Modals over page navigation for forms and statements.
- Feedback everywhere: toasts, inline errors, loading/empty states, error boundary.
- Print-first reports via Tailwind print: variants and A4 page rules.

### Design tokens and component classes

- CSS variables/tokens: --primary, --primary-2, --primary-soft, --surface, --border, --page-bg, --text-primary.
- Component classes: app-card, app-btn, app-input, app-select, app-textarea, app-table, badge, skeleton.
- Shadows and radius tokens.
- Animations: fade-in, fade-in-up, slide-in, scale-in, shimmer.
- Header: sticky navy gradient, tab pill bar, user status badge, rep-filter ribbon for managers.

---

## Tech Stack

- React 19, TypeScript, Vite 8
- React Router, TanStack Query
- Tailwind CSS, Recharts
- Supabase (PostgreSQL, Auth, RLS, RPC functions)
- Lucide React, date-fns, Oxlint

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/iiYouseFF/employee-management-system.git
cd "Employee Management System"
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your Supabase project values.

### 4. Apply the database migrations

Run the files in `supabase/migrations/` in filename order.

### 5. Create the first manager account

```sql
insert into public.user_roles (user_id, role, owner_id)
values ('<auth-user-id>', 'manager', '<auth-user-id>')
on conflict (user_id) do update set role = excluded.role;
```

### 6. Run the development server

```bash
npm run dev
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build production assets |
| `npm run typecheck` | Run `tsc -b` |
| `npm run lint` | Run Oxlint |
| `npm run preview` | Serve the production build locally |

---

## Project Structure

```
src/
  components/
    tabs/
    Modal.tsx, FormModal.tsx, RepModal.tsx
    EditableTable.tsx, SearchableCustomer.tsx, StatementTable.tsx
    CustomerStatementModal.tsx, CumulativeCustomerStatementModal.tsx
    SupplierStatementModal.tsx, ReportModal.tsx
    Toast.tsx, ErrorBoundary.tsx
  hooks/
    useAuth.ts, useRole.ts
    useData.ts, useInvoices.ts, useSuppliers.ts, useProducts.ts
    useExpenses.ts, useStatements.ts, useKpi.ts, useToast.ts
  lib/
    supabase.ts, query.ts, tenant.ts, csv.ts, format.ts, report.ts
    recoveryMode.ts, errors.ts
  pages/
    Login.tsx, Sheet.tsx
  types/
    supabase.ts, reps.ts
  index.css, main.tsx
supabase/migrations/
docs/
  accounting-model.md, deployment.md
public/
```

---

## Database Overview

| Table | Purpose |
|---|---|
| `reps` | Sales representatives |
| `customers` | Customer profiles, opening balances, assigned rep |
| `cash_invoices` | Cash sales |
| `credit_invoices` | Credit sales (receivables) |
| `payments` | Customer payments, optionally allocated to invoices |
| `suppliers` | Vendor profiles and opening balances |
| `supplier_purchases` | Purchases from suppliers (cash or credit) |
| `supplier_payments` | Payments made to suppliers |
| `expenses` | Operational expenses |
| `products` | Price list (names, unit, price) |
| `app_settings` | Application title and tab labels |
| `user_roles` | Role per auth user (`manager` / `sales_rep`) plus tenant owner; not API-accessible |

Key SQL objects: `customer_statement()` and `supplier_statement()` (running-balance ledgers), `kpi_summary()`, `receivables_aging()`, `cashflow_series()`, and `rep_directory()`. Accounting sign conventions and KPI formulas are documented in docs/accounting-model.md.

---

## Roles and Access Control

| Capability | Manager | Sales rep |
|---|---|---|
| View all customers, invoices, payments | Yes | Own customers only |
| Create / edit / delete records | Yes | No (read-only) |
| Suppliers, expenses | Yes | No |
| Product price list | Yes (edit) | Yes (view and print) |
| Manager KPI dashboard | Yes | No |
| Reps and role management | Yes | No |

Role checks run inside Postgres (RLS policies and security definer functions).

---

## Usage

1. Sign in on the login page.
2. Managers: set up reps and customers, then record invoices, payments, purchases, and expenses.
3. Sales reps: browse their own customers, invoices, and payments, and print the product price list.
4. Use the Statement tab for cumulative customer statements and the supplier details view for payables.
5. Use the KPI tab for period-based financial reporting.
6. Export CSV or print reports from the relevant tabs.

---

## Deployment

The app is configured for Vercel (`vercel.json` provides SPA rewrites, cache, and security headers). See docs/deployment.md for the full checklist.

---

## Contributing

1. Create a feature branch.
2. Make your changes and run `npm run typecheck` and `npm run lint`.
3. Commit, push, and open a pull request.

---

## License

This project is private and proprietary.