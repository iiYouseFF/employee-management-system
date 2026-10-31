# Employee Management System

An Arabic-first (RTL) sales and accounting system for a food-distribution business. It tracks cash and credit invoices, customer and supplier balances, payments, expenses, product price lists, and manager-facing financial KPIs, with role-based access control enforced in the database.

Built with React 19, TypeScript, Vite, Supabase (PostgreSQL + Auth), TanStack Query, and Tailwind CSS.

## Features

### Core accounting
- **Cash and credit invoices** recorded by total amount, linked to customers and reps
- **Payment tracking** with allocation to credit invoices
- **Customer statements** as running-balance ledgers (opening balance, debit, credit, row-by-row balance)
- **Monthly summary** and **account statements** with print and CSV export

### Management modules
- **Customers** with phone, address, opening balance, and assigned rep
- **Sales reps** management, including linking a rep record to a Supabase Auth account by email
- **Suppliers (accounts payable)** with cash/credit purchases, supplier payments, and running-balance statements
- **Expenses** for operational costs
- **Product price list** with a print-optimized A4 catalog
- **Manager KPI dashboard** - income vs. outcome, cash vs. credit split, receivables aging, DSO, average collection time, and collection rate

### Access control
- Two roles: `manager` and `sales_rep`
- **Manager**: full access to every module, all reps' data, suppliers, expenses, and KPIs
- **Sales rep**: read-only access to their own assigned customers, invoices, payments, statements, and the product price list
- Enforced with Supabase Row Level Security; UI restrictions are a convenience only
- Signup, login, and password-recovery flows via Supabase Auth

### UX
- Arabic RTL interface with Tailwind logical properties
- Responsive layout for desktop and tablet
- Toast notifications, inline form errors, loading and empty states
- Error boundary for uncaught render errors
- Print-optimized views and CSV export

## Tech Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite 8](https://vite.dev/)
- **Routing**: [React Router](https://reactrouter.com/)
- **Data fetching**: [TanStack Query](https://tanstack.com/query)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Backend**: [Supabase](https://supabase.com/) (PostgreSQL, Auth, RLS, RPC functions)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Dates**: [date-fns](https://date-fns.org/)
- **Linting**: [Oxlint](https://oxc.rs/docs/guide/usage/linter)

## Prerequisites

- Node.js **20.19+** or **22.12+** (required by Vite 8)
- npm
- A Supabase project

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

Copy `.env.example` to `.env.local` and fill in your Supabase project values:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Only the public anon key belongs in the frontend. Never commit a service-role key.

### 4. Apply the database migrations

Run the files in `supabase/migrations/` in filename order, either with the Supabase CLI or by pasting them into the Supabase SQL Editor:

```
0001_init.sql
0002_views.sql
0003_customers_add_phone_and_fix.sql
0007_fix_customer_statement_view.sql
0008_allocate_unlinked_payments.sql
0009_rep_role_and_access.sql
0010_all_features_management.sql
0011_rbac_hardening.sql
0012_rep_management.sql
0013_simplify_suppliers.sql
0014_rbac_hardening_v2.sql
```

The migrations are additive and idempotent where possible; each file documents the objects it creates.

### 5. Create the first manager account

Sign up through the app, then promote the account once in the SQL Editor:

```sql
insert into public.user_roles (user_id, role, owner_id)
values ('<auth-user-id>', 'manager', '<auth-user-id>')
on conflict (user_id) do update set role = excluded.role;
```

`user_roles` is not exposed to the API (`revoke all ... from anon, authenticated`), so role changes are made here in the SQL Editor or through manager-only RPCs.

Rep accounts are linked automatically when a rep record is saved with the same email **before** the user confirms their signup.

### 6. Run the development server

```bash
npm run dev
```

The app is available at http://localhost:5173.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Type-check the project and build production assets |
| `npm run typecheck` | Run `tsc -b` without emitting output |
| `npm run lint` | Run Oxlint |
| `npm run preview` | Serve the production build locally |

## Project Structure

```
src/
  components/
    tabs/                 # Cash, Credit, Payments, Statement, Monthly, Customers,
                          # Suppliers, Expenses, Products, ManagerDashboard, Reps
    Modal.tsx, FormModal.tsx, RepModal.tsx
    EditableTable.tsx, SearchableCustomer.tsx, StatementTable.tsx
    Toast.tsx, ErrorBoundary.tsx
  hooks/
    useAuth.ts, useRole.ts
    useData.ts, useInvoices.ts, useSuppliers.ts, useProducts.ts
    useExpenses.ts, useStatements.ts, useKpi.ts, useToast.ts
  lib/
    supabase.ts   # Supabase client
    query.ts      # React Query configuration
    csv.ts        # CSV export
    format.ts     # Number and date formatting
    report.ts     # Printable report HTML
    recoveryMode.ts
    errors.ts     # Friendly Arabic messages for database errors
  pages/
    Login.tsx     # Login, signup, password recovery
    Sheet.tsx     # Main application shell and tabs
  types/
    supabase.ts   # Generated database types
    reps.ts
  index.css, main.tsx
supabase/migrations/
docs/
  accounting-model.md     # Sign conventions, cash/credit treatment, KPI formulas
  deployment.md           # Vercel + Supabase production checklist
public/
```

## Database Overview

| Table | Purpose |
|---|---|
| `reps` | Sales representatives (optionally linked to an auth user) |
| `customers` | Customer profiles, opening balances, assigned rep |
| `cash_invoices` | Cash sales |
| `credit_invoices` | Credit sales (receivables) |
| `payments` | Customer payments, optionally allocated to invoices |
| `suppliers` | Vendor profiles and opening balances |
| `supplier_purchases` | Purchases from suppliers (cash or credit) |
| `supplier_payments` | Payments made to suppliers |
| `expenses` | Operational expenses |
| `products` | Price list (Arabic/English names, unit, price) |
| `app_settings` | Application title and tab labels |
| `user_roles` | Role per auth user (`manager` / `sales_rep`) plus tenant owner; not API-accessible |

Key SQL objects: `customer_statement()` and `supplier_statement()` (running-balance ledgers), `kpi_summary()`, `receivables_aging()`, `cashflow_series()`, and `rep_directory()`. Accounting sign conventions and KPI formulas are documented in [docs/accounting-model.md](docs/accounting-model.md).

## Roles

| Capability | Manager | Sales rep |
|---|---|---|
| View all customers, invoices, payments | Yes | Own customers only |
| Create / edit / delete records | Yes | No (read-only) |
| Suppliers, expenses | Yes | No |
| Product price list | Yes (edit) | Yes (view and print) |
| Manager KPI dashboard | Yes | No |
| Reps and role management | Yes | No |

Role checks run inside Postgres (RLS policies and `security definer` functions), so a rep querying another rep's data receives zero rows even outside the UI.

## Usage

1. Sign in on the login page.
2. Managers: set up reps and customers, then record invoices, payments, purchases, and expenses.
3. Sales reps: browse their own customers, invoices, and payments, and print the product price list.
4. Use the Statement tab for cumulative customer statements and the supplier details page for payables.
5. Use the KPI tab for period-based financial reporting.
6. Export CSV or print reports from the relevant tabs.

## Deployment

The app is configured for Vercel (`vercel.json` provides SPA rewrites, cache, and security headers). See [docs/deployment.md](docs/deployment.md) for the full checklist, including:

- Setting `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project
- Setting the Supabase Site URL and redirect allowlist for the production domain
- Configuring SMTP so password-reset emails are delivered

## Contributing

1. Create a feature branch.
2. Make your changes and run `npm run typecheck` and `npm run lint`.
3. Commit, push, and open a pull request.

## License

This project is private and proprietary.
