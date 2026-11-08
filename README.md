# Employee Management System — نظام إدارة المبيعات والحسابات

An Arabic-first (RTL) sales and accounting system for a food-distribution business. It tracks cash and credit invoices, customer and supplier balances, payments, expenses, product price lists, and manager-facing financial KPIs — with role-based access control enforced at the database level.

Built with **React 19**, **TypeScript**, **Vite 8**, **Supabase** (PostgreSQL + Auth + RLS), **TanStack Query**, **Tailwind CSS**, and **Recharts**.

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
- **Sales reps** work in the field: they need to look up their own customers, see what those customers owe, and print a current price list for client visits — but they must not see other reps' data or change any records.
- **Money is tracked as a ledger**, not just a list of invoices. Every customer and supplier has a running balance built from an opening balance plus every transaction in date order, so the answer to *"how much does this customer owe right now?"* is always consistent across statements, profiles, and reports.

The UI is **Arabic-first and right-to-left**, with full English/LTR support through Tailwind logical properties.

### Money rules

- All monetary amounts are stored as `numeric(14,2)` in Postgres — never floats.
- The frontend formats amounts with the active locale and uses tabular numerals for stable column alignment.
- Monetary aggregation that must be exact (statements, KPIs, balances) runs in SQL — never floated through JavaScript.

---

## How It Works

- The frontend is a single-page React app. After login, a tabbed shell hosts every module.
- Data lives in Supabase Postgres. The browser talks to it with the public anon key; TanStack Query handles caching, invalidation, loading and error states.
- **Security is enforced in Postgres, not the UI.** Row Level Security (RLS) policies and security-definer RPC functions decide what each role can read and write. Hiding a button is a convenience — a sales rep querying another rep's rows receives zero rows, guaranteed by the database.
- Aggregation that would be expensive in the browser runs as SQL functions and views in Postgres.

---

## Features

### 🔐 Role-Based Access Control (RBAC)

Two roles are stored and verified in Supabase:

| Role | Access |
|---|---|
| **Manager** | Full CRUD on all data, all tabs, all reports, supplier module, KPI dashboard |
| **Sales Rep** | Read-only view of their own customers, invoices, payments, and product price list |

- Roles are stored in a `user_roles` table, checked by security-definer helpers (`is_manager()`) called inside RLS policies on every table.
- Reps cannot insert, update, or delete any financial record — enforced at the database level, not just the UI.
- Managers can create rep accounts and link them to Supabase Auth users.

---

### 🔑 Authentication & Password Management

- **Phone-first login:** users sign in with their Egyptian mobile number (+20 prefix). The backend resolves the number to an internal email via the `get_email_by_phone` RPC and delegates to Supabase `signInWithPassword`.
- **Sign-up:** creates a Supabase Auth account using the phone number as the internal email identifier.
- **Forgot password:** a "نسيت كلمة المرور؟" link on the login form sends a reset link to the email registered for that phone number via `supabase.auth.resetPasswordForEmail`.
- **Password recovery:** when a user arrives via a reset link, the app detects the `PASSWORD_RECOVERY` auth event (or the `#type=recovery` URL hash) and enters recovery mode — a form with new-password and confirm-password fields that calls `supabase.auth.updateUser({ password })`.
- **Change password (logged-in):** a "تغيير كلمة المرور" button in the app header opens a modal for logged-in users to set a new password with confirmation, without needing to log out.

---

### 🧾 Cash Invoices (البيع النقدي)

- Record immediate cash sales linked to a customer and sales rep.
- Cash invoices count as collected money immediately in KPI calculations.
- Managers can filter by date range and rep; reps see only their own customers' invoices.
- Inline editable table with per-row delete; bottom totals row.

---

### 📋 Credit Invoices (البيع الآجل)

- Record a receivable with a due date and optional down payment.
- The remaining unpaid balance drives the customer's running balance and feeds the receivables aging report.
- Each credit invoice can have an individual payment allocation.

---

### 💳 Payments (الدفعات)

- Record money received from customers, with date, amount, method, reference, and optional note.
- Optionally link a payment to a specific credit invoice.
- Managers see all payments; reps see only payments from their customers.

---

### 📊 Cumulative Customer Statements (كشف حساب تراكمي)

- Running-balance ledger for one or more customers over a selectable date range.
- **Opening balance row:** sum of all transactions before the range start, plus the stored opening balance.
- Each transaction row shows: Date · Description · Reference · **Debit (مدين)** · **Credit (دائن)** · **Running Balance (الرصيد)**.
- **Closing row:** totals and final balance.
- Balance is computed with SQL window functions in `customer_statement()` for correctness and speed.
- Printable and exportable as CSV. Works in RTL and LTR.
- Reps can only view their own customers' statements; RLS enforces this even if the URL is shared.

---

### 📅 Monthly Summary & Reports (الملخص الشهري)

- Aggregates cash sales, credit sales, collections, outstanding balances, and invoice counts per month.
- Detailed, Matrix, and Separate views.
- Printable reports with print (A4) and CSV export.
- WhatsApp PDF sharing — sends a rendered PDF copy via WhatsApp Web with one click.

---

### 👥 Customer Management (العملاء)

- Customer profiles: name, phone, opening balance, assigned sales rep, active flag.
- Inline edit and delete.
- Each customer's card shows their current balance.
- Managers see all customers; reps see only their own.

---

### 🏢 Sales Rep Management (إدارة المناديب)

- Manage the full list of reps (name, phone, Supabase Auth email link).
- Add, edit, and delete reps (with guard: at least one rep must remain).
- Link rep records to Supabase Auth accounts so they can log in.
- Manager-only tab.

---

### 🏭 Supplier Cash & Credit Management (الموردين — Accounts Payable)

- Supplier profiles: name, phone, address, tax number, notes, opening balance, active flag.
- **Cash purchases:** recorded with `payment_type = 'cash'` — cost is immediate; a matching payment row is created automatically.
- **Credit purchases:** recorded with `payment_type = 'credit'` — increases the balance owed to the supplier.
- **Supplier payments:** record money paid out to a supplier with date, amount, method, reference, and optional allocation to a specific purchase.
- Supplier balance = opening + credit purchases − payments received.
- **Cumulative supplier statements:** same running-balance ledger structure as customer statements, with supplier sign conventions (payment = debit, credit purchase = credit).
- Manager-only tab; RLS blocks all rep access at the database level.

---

### 💸 Expenses (المصاريف)

- Record operational expenses with date, category, amount, and description.
- Expenses flow into the manager KPI dashboard as part of Outcome.
- Manager-only tab.

---

### 🛍️ Product Price List & Printable Catalog (قائمة الأسعار)

- Central `products` table: Arabic name, English name, SKU, category, unit, price, sort order, active flag.
- **Manager:** full CRUD — add, edit, deactivate, reorder products.
- **Sales rep:** read-only view with search and category filter.
- **Print-optimized A4 catalog:** clean layout with company header and date, table of products and prices, page-break-safe rows, all app chrome hidden in print (`print:hidden` Tailwind variants).
- **WhatsApp PDF sharing:** renders the catalog to a PDF and opens WhatsApp Web with a shareable link.
- **CSV export:** downloads the full price list as a spreadsheet.
- Direction follows the active language (RTL/LTR) in both screen and print views.

---

### 📈 Manager Financial KPI Dashboard (مؤشرات الأداء)

Applies a user-selected date range (this month / last month / custom) to all widgets.

**Income vs. Outcome**
- Income = cash invoices + payments received on credit invoices within the period.
- Outcome = supplier payments (including cash purchases) + operational expenses.
- Net cash flow with period-over-period comparison; daily/weekly bar chart.

**Cash vs. Credit Breakdown**
- Cash sales vs. credit sales (amount and percentage).
- Liquidity (cash collected) vs. outstanding receivables (unpaid credit balance) vs. accounts payable (owed to suppliers).
- Donut chart visualisation.

**Financial Velocity**
- **DSO** (days sales outstanding) = outstanding receivables ÷ credit sales × days in period.
- **Average collection time** (days between credit invoice date and full payment).
- Collection rate: % of credit invoices collected within 30 days.
- Aging breakdown: 0–30, 31–60, 61–90, 90+ days outstanding.

All aggregations run as SQL functions (`kpi_summary`, `receivables_aging`, `cashflow_series`) with `security definer` — a sales rep calling any of them gets a `forbidden` exception at the database, not just a blank chart.

---

### 📄 PDF Generation & WhatsApp Sharing

- Renders any printable view (statement, catalog, monthly report) to a high-resolution PDF using **html2canvas** + **jsPDF**.
- Arabic text is rendered correctly via browser-native BiDi — no glyph reversal issues.
- A **WhatsApp share button** appears on every exportable view: it generates the PDF, creates a file object, and opens WhatsApp Web's share flow.
- Available on: Cumulative Customer Statement · Supplier Statement · Product Catalog · Monthly Report.

---

## UI Concepts

- **Arabic-first, RTL by default**, with English/LTR support through Tailwind logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`). No `ml-*` / `mr-*` / `left-*` / `right-*` in source code.
- **Tajawal** typography with system-font fallbacks.
- A restrained palette: deep blue primary (`#1a4971`), accent (`#245e8e`), soft tint (`#f0f6fc`), white surfaces, page background (`#f4f7fb`).
- Excel-style data entry via `.excel-input` and `.amount-input` classes.
- A **single tabbed shell** for the whole app — no page navigations after login.
- **Modals** over page navigation for forms and statements.
- **Feedback everywhere:** toasts, inline errors, loading spinners, empty states, error boundary.
- **Print-first reports** via Tailwind `print:` variants and `@page { size: A4; margin: 12mm }`.

### Design tokens and component classes

| Token/Class | Purpose |
|---|---|
| `--primary`, `--primary-2`, `--primary-soft` | Brand blue shades |
| `--surface`, `--border`, `--page-bg`, `--text-primary` | Surface and text |
| `app-card` | White rounded card surface |
| `app-btn`, `app-btn-primary`, `app-btn-ghost`, `app-btn-header` | Button variants |
| `app-input`, `app-select`, `app-textarea` | Form input variants |
| `app-table` | Styled data table |
| `badge`, `skeleton` | Status badge and shimmer placeholder |
| `shadow-card`, `shadow-modal`, `shadow-glow` | Shadow tokens |
| `animate-fade-in`, `animate-fade-in-up`, `animate-slide-in`, `animate-scale-in` | Entry animations |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript (strict), Vite 8 |
| Routing | React Router v7 |
| Data fetching | TanStack Query v5 |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| PDF generation | html2canvas + jsPDF |
| Backend / DB | Supabase (PostgreSQL, Auth, RLS, RPC) |
| Icons | Lucide React |
| Utilities | date-fns, Oxlint |

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

Copy `.env.example` to `.env.local` and fill in your Supabase project values:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### 4. Apply the database migrations

Run the files in `supabase/migrations/` in filename order against your Supabase project.

### 5. Create the first manager account

After creating a user in Supabase Auth, grant them the manager role:

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
| `npm run typecheck` | Run `tsc -b` only |
| `npm run lint` | Run Oxlint |
| `npm run preview` | Serve the production build locally |

---

## Project Structure

```
src/
  components/
    tabs/                        # One component per tab (CashTab, CreditTab, …)
    ChangePasswordModal.tsx      # In-app password change modal
    CustomerStatementModal.tsx
    CumulativeCustomerStatementModal.tsx
    SupplierStatementModal.tsx
    StatementTable.tsx           # Shared running-balance ledger table
    ReportModal.tsx
    WhatsAppShareButton.tsx      # WhatsApp PDF sharing button
    EditableTable.tsx
    SearchableCustomer.tsx
    RepModal.tsx, FormModal.tsx, Modal.tsx
    Toast.tsx, ErrorBoundary.tsx
  hooks/
    useAuth.ts                   # Session + role resolution
    useData.ts                   # Reps, customers, settings
    useInvoices.ts               # Cash and credit invoice mutations
    useSuppliers.ts              # Supplier CRUD and purchase/payment hooks
    useProducts.ts               # Product price list hooks
    useExpenses.ts               # Expense hooks
    useStatements.ts             # Customer and supplier statement RPC hooks
    useKpi.ts                    # KPI summary, aging, cashflow series hooks
    useToast.ts
  lib/
    supabase.ts                  # Supabase client
    pdfShare.ts                  # html2canvas → jsPDF, WhatsApp share logic
    pdfGenerators.ts             # Per-view PDF HTML template generators
    recoveryMode.ts              # sessionStorage helpers for password recovery
    report.ts                    # CSV/print report logic
    csv.ts, format.ts            # Formatting utilities
    errors.ts, query.ts, tenant.ts
  pages/
    Login.tsx                    # Login, signup, forgot-password, recovery modes
    Sheet.tsx                    # Main app shell with header, tabs, and modals
  types/
    supabase.ts                  # Generated + extended Supabase types
    reps.ts
  index.css                      # Tailwind base + design tokens + component classes
  main.tsx
supabase/
  migrations/                    # Additive SQL migrations (001–005)
docs/
  accounting-model.md            # Sign conventions, KPI formulas, cash/credit treatment
  deployment.md                  # Vercel deployment checklist
public/
```

---

## Database Overview

| Table | Purpose |
|---|---|
| `user_roles` | Role per auth user (`manager` / `sales_rep`) plus tenant owner — not API-accessible via RLS |
| `reps` | Sales representative profiles |
| `customers` | Customer profiles, opening balances, assigned rep |
| `cash_invoices` | Immediate cash sales |
| `credit_invoices` | Credit sales (receivables) |
| `payments` | Customer payments, optionally allocated to a credit invoice |
| `suppliers` | Vendor profiles and opening balances |
| `supplier_purchases` | Purchases from suppliers (`cash` or `credit`) |
| `supplier_payments` | Payments made to suppliers |
| `expenses` | Operational expenses |
| `products` | Price list (Arabic/English names, SKU, unit, price, category) |
| `app_settings` | Application title and custom tab labels |

### Key SQL objects

| Object | Type | Purpose |
|---|---|---|
| `is_manager()` | Function | Security-definer helper used in RLS policies |
| `get_email_by_phone(p_phone)` | RPC | Resolves a phone number to an internal email for phone-first login |
| `customer_statement(id, from, to)` | Function | Running-balance ledger for a customer over a date range |
| `supplier_statement(id, from, to)` | Function | Running-balance ledger for a supplier over a date range |
| `kpi_summary(from, to)` | Function | Income, outcome, cash/credit breakdown, DSO, collection rate |
| `receivables_aging(as_of)` | Function | Aging buckets: 0–30, 31–60, 61–90, 90+ days |
| `cashflow_series(from, to, bucket)` | Function | Daily/weekly income vs. outcome series for charts |
| `rep_directory()` | Function | Reps with linked auth email (manager-only) |

Accounting sign conventions and KPI formulas are documented in [`docs/accounting-model.md`](docs/accounting-model.md).

---

## Roles and Access Control

| Capability | Manager | Sales Rep |
|---|---|---|
| View all customers, invoices, payments | ✅ All | ✅ Own only |
| Create / edit / delete records | ✅ | ❌ Read-only |
| Supplier module (purchases, payments, statements) | ✅ | ❌ |
| Expenses tab | ✅ | ❌ |
| Product price list — view & print | ✅ | ✅ |
| Product price list — create / edit / delete | ✅ | ❌ |
| Monthly summary and reports | ✅ All reps | ✅ Own only |
| Manager KPI dashboard | ✅ | ❌ |
| Reps management tab | ✅ | ❌ |
| Change own password | ✅ | ✅ |
| Reset forgotten password via email link | ✅ | ✅ |
| WhatsApp PDF sharing | ✅ | ✅ |

> Role checks run inside Postgres (RLS policies and security-definer functions). A sales rep cannot bypass these checks by calling the Supabase API directly — they will receive zero rows or a `forbidden` exception.

---

## Usage

1. **Sign in** on the login page with your Egyptian mobile number and password.
2. **Forgot your password?** Click "نسيت كلمة المرور؟", enter your phone number, and check the email linked to your account for a reset link.
3. **Managers:** set up reps and customers, then record invoices, payments, purchases, and expenses using the tab bar.
4. **Sales reps:** browse your own customers, invoices, and payments, and print or share the product price list.
5. Use the **Statement** tab for cumulative customer ledgers and the **Supplier** details view for payables.
6. Use the **KPI** tab for period-based financial reporting and aging analysis.
7. Export CSV, print reports, or share a PDF via WhatsApp from any exportable view.
8. **Change your password** at any time via "تغيير كلمة المرور" in the app header.

---

## Deployment

The app is configured for **Vercel** (`vercel.json` provides SPA rewrites, CDN cache headers, and security headers). See [`docs/deployment.md`](docs/deployment.md) for the full checklist.

---

## Contributing

1. Create a feature branch off `main`.
2. Make your changes and run `npm run typecheck` and `npm run lint`.
3. Commit, push, and open a pull request.
4. Ensure RLS is enabled on any new table and that migrations are additive/idempotent.

---

## License

This project is private and proprietary.
