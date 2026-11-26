# Known Issues & Architecture Review Notes

> Produced during the architecture review / cleanup. These are **findings and recommendations**,
> not changes applied to already-run migrations or live data. Items are ordered by priority.

## 1. Database defects (fix in a NEW additive migration — `0034_…` or later, never edit applied files)

**Status (2026-11-26):** migrations through `0033_rep_invoice_lines_assigned_customers` are
applied on the remote project. `0031` added the 15-day credit due-date trigger and the
`unpaid_credit_invoices_list()` RPC; `0032` corrected the report's rep attribution and due-date
trigger behavior; `0033` fixed sales-rep visibility of invoice lines for assigned customers.
The next free number is `0034`.

**Migration filename note:** both applied migrations use the `0031_` prefix locally
(`0031_unpaid_overdue_invoices.sql` and `0031_product_customer_breakdown_fix.sql`); the remote
tracks them under distinct timestamp versions. They are applied files and must not be renamed;
use `0034_` or later for the next migration.

**Resolved (2026-11-26): sales reps could not read invoice lines for assigned customers.**
`0018_inventory.sql:41-53` only checked the invoice header `rep_id`, while the header policies
in `0014_rbac_hardening_v2.sql:287-315` also allow invoices whose customer is assigned to the
rep. Applied migration `0033_rep_invoice_lines_assigned_customers.sql` recreates
`rep_read_invoice_lines` with the same assigned-customer branch for both cash and credit lines,
keeping the manager exclusion and tenant boundary. Verified via `pg_policies`.

| # | Issue | Evidence | Recommended fix |
|---|---|---|---|
| 1 | `kpi_summary()` references `expenses.expense_date`, but the column is `date` | `0021_reservations_and_returns.sql:877`; schema in `0010_all_features_management.sql:194` | Use `expenses.date` (or add a generated `expense_date` column) and regenerate types |
| 2 | Audit trigger reads `NEW.title` / `OLD.title` on `expenses`, but the column is `description` | `0019_audit_logs.sql:162,212,243` | Use `NEW.description` / `OLD.description` |
| 3 | App calls `product_stock_summary_v3()` but no migration defines it (only `_v2` exists) | `src/features/inventory/useInventory.ts`; `0021_reservations_and_returns.sql:50` | Create `product_stock_summary_v3()` matching `src/shared/types/supabase.ts`, or switch the app to `_v2` |
| 4 | `DROP FUNCTION product_stock_summary()` may be blocked by `stock_valuation()` dependency | `0020_expiry_and_stock_alerts.sql:76`; `0018_inventory.sql:588-605` | Drop/recreate both functions together in a new migration |
| 5 | SECURITY DEFINER functions recreated with `search_path = public` (loses `pg_temp` hardening from `0014`) | `0018`, `0020`, `0021` | Re-apply `SET search_path = public, pg_temp` |
| 6 | `get_email_by_phone()` granted to `anon` allows phone→email enumeration | `0016_phone_login_lookup.sql:10-23` | Restrict to authenticated callers or move server-side |
| 7 | `v_customer_transactions` lost `security_invoker = true` when recreated in 0022/0024; a rep may be able to read another tenant's transactions through the view (0025's own lookup is `SECURITY INVOKER` and RLS-bounded) | `0011_rbac_hardening.sql:481` vs `0022_customer_phone_payment_methods_and_statement_invoice_link.sql:90`, `0024_statement_reference_links.sql:19` | Recreate the view with `WITH (security_invoker = true)` in a new migration and verify rep isolation |

**Migration numbering:** versions `0004`–`0006` were skipped historically (present since the first
commit). The accidental duplicate `006_reservations_and_returns.sql` was removed; `0021_…` is canonical.
Before applying, confirm `supabase_migrations.schema_migrations` on the remote DB does not already
record version `006`; if it does, use `supabase migration repair` instead of re-running the body.

**Types drift:** `src/shared/types/supabase.ts` has hand edits (`allow_negative_stock?` optional in `Row`)
and RPCs ahead of the SQL. Regenerate with `supabase gen types typescript` after the `0022` fixes.

## 2. Configuration / quality

- **TypeScript `strict` is OFF** (`tsconfig.app.json`, `tsconfig.node.json`). Enabling it is recommended
  but will surface many `strictNullChecks` / implicit-any errors (~159 explicit `any` usages exist).
  Do this as a dedicated, staged effort.
- **No test runner / `test` script.** Add Vitest + running-balance/KPI unit tests and at least one RLS
  test per role (required by `AGENTS.md`).
- **No `supabase/config.toml`.** Add it if local Supabase CLI development is intended; otherwise keep the
  README's manual "apply in filename order" instructions.
- **Hardcoded RTL/Arabic root** in `index.html` (`lang="ar" dir="rtl"`); nothing updates it at runtime.

## 3. Frontend architecture

- **No i18n layer.** ~1,278 Arabic-text lines across 39 files; `dir="rtl"` hardcoded in ~25 places;
  locale fixed to `ar-EG`; currency label `ج.م` and company-name fallbacks repeated. Introduce a language
  provider + translation files before adding English.
- **Loading / error states:** 8/15 tabs lack a top-level loading state; 14/15 lack an explicit query
  error state. Standardize on a shared query-state wrapper.
- **Oversized files:** `InventoryTab.tsx` (~1,278 lines) embeds 3 sub-modals; split into feature components.
  `CreditTab`, `ProductsTab`, `CashTab`, `Login`, `Sheet` are also large.
- **Duplicated logic to consolidate:** customer vs supplier statement modals (~90% overlap); Cash vs Credit
  invoice scaffolding; CSV export (`csv.ts` vs `report.ts`); local `formatDate` helpers (centralize in
  `shared/lib/format.ts`); pagination boilerplate (extract `usePagination`).
- **Two `useCustomerStatement` hooks** with different semantics: view-based in `features/sales/useInvoices.ts`
  vs RPC/cumulative in `features/statements/useStatements.ts`. Rename the summary one to avoid confusion.
- **Native `confirm`/`alert` dialogs** (~10 call sites) are untranslated/unstyled; replace with a shared modal.
- **Remaining oxlint warnings** are pre-existing React purity / effect / memoization issues (see `npm run lint`).

## 4. Done in this cleanup

- Removed byte-identical doc duplicates; consolidated documentation under `docs/` (one canonical copy each).
- Removed duplicate migration `006_reservations_and_returns.sql`.
- Deleted dead code: `CustomerStatementModal.tsx`, `useRole.ts`, `hooks/index.ts`, dead invoice mutations,
  `useSalesReturnLines`, `useUpdateSettings`.
- Restructured `src/` into `app/` + `features/*` + `shared/*` with the `@/` alias; split `useData` into
  `reps`/`settings`; split entry into `App.tsx` + `main.tsx`.
- Declared `html2canvas` explicitly; removed unused deps (`clsx`, `tailwind-merge`, `date-fns`,
  `lucide-react`, `jspdf-autotable`).
- Fixed build-breaking bugs in the bulk-matrix modal; corrected stale facts in README/docs.
