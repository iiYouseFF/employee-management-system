# Known Issues & Architecture Review Notes

> Produced during the architecture review / cleanup. These are **findings and recommendations**,
> not changes applied to already-run migrations or live data. Items are ordered by priority.

## 1. Database defects (fix in a NEW additive migration — `0038_…` or later, never edit applied files)

**Status (2026-11-27):** migrations through `0037_notifications_and_low_stock_10` are applied on the
remote project. `0037` added the notifications table/RLS, live operational-alerts RPC, rep-activity
triggers, the `save_credit_invoice()` override flag, and the effective 10-unit low-stock threshold.
`0031` added the 15-day credit due-date trigger and the
`unpaid_credit_invoices_list()` RPC; `0032` corrected the report's rep attribution and due-date
trigger behavior; `0033` fixed sales-rep visibility of invoice lines for assigned customers;
`0034` added the granular per-rep permission flags, RLS guards and helper RPCs; `0035` hardened
that implementation (statement isolation, ACLs, reference validation and `search_path`);
`0036` closed the legacy stock RPC bypass. The next free number is `0038`.

**Migration filename note:** both applied migrations use the `0031_` prefix locally
(`0031_unpaid_overdue_invoices.sql` and `0031_product_customer_breakdown_fix.sql`); the remote
tracks them under distinct timestamp versions. They are applied files and must not be renamed;
use `0038_` or later for the next migration.

| # | Issue | Evidence | Recommended fix |
|---|---|---|---|
| 1 | `kpi_summary()` references `expenses.expense_date`, but the column is `date` | `0021_reservations_and_returns.sql:877`; schema in `0010_all_features_management.sql:194` | Use `expenses.date` (or add a generated `expense_date` column) and regenerate types |
| 2 | Audit trigger reads `NEW.title` / `OLD.title` on `expenses`, but the column is `description` | `0019_audit_logs.sql:162,212,243` | Use `NEW.description` / `OLD.description` |
| 3 | ~~App calls `product_stock_summary_v3()` but no migration defines it~~ **Resolved by `0035`** — the function is now created explicitly with authenticated-only EXECUTE. |
| 4 | `DROP FUNCTION product_stock_summary()` may be blocked by `stock_valuation()` dependency | `0020_expiry_and_stock_alerts.sql:76`; `0018_inventory.sql:588-605` | Drop/recreate both functions together in a new migration |
| 5 | SECURITY DEFINER functions recreated with `search_path = public` (loses `pg_temp` hardening from `0014`) — **partially resolved**: `0035` covered the statement, invoice/return write, v3 stock and permission functions; `0036` covered the legacy stock functions; supplier-purchase functions from `0026`–`0029` remain open | `0018`, `0020`, `0021`, `0026`–`0029` | Re-apply `SET search_path = public, pg_temp` to the remaining supplier-purchase functions |
| 6 | `get_email_by_phone()` granted to `anon` allows phone→email enumeration | `0016_phone_login_lookup.sql:10-23` | Restrict to authenticated callers or move server-side |
| 7 | ~~`v_customer_transactions` lost `security_invoker = true`~~ **Resolved by `0035`**; `customer_statement()` additionally filters `owner_id` and assigned-customer scope, with anon/PUBLIC EXECUTE revoked. | `0011_rbac_hardening.sql:481` vs `0022_customer_phone_payment_methods_and_statement_invoice_link.sql:90`, `0024_statement_reference_links.sql:19` | No further action; verify rep isolation if the view is recreated again |

**Resolved (2026-11-26): sales reps could not read invoice lines for assigned customers.**
`0018_inventory.sql:41-53` only checked the invoice header `rep_id`, while the header policies
in `0014_rbac_hardening_v2.sql:287-315` also allow invoices whose customer is assigned to the
rep. Applied migration `0033_rep_invoice_lines_assigned_customers.sql` recreates
`rep_read_invoice_lines` with the same assigned-customer branch for both cash and credit lines,
keeping the manager exclusion and tenant boundary. Verified via `pg_policies`.

### Granular permission hardening (0034/0035/0036 review, 2026-11-27)

Applied migrations `0034_rep_granular_permissions.sql` and `0035_permissions_hardening.sql`
close the reviewer findings for the per-rep permission feature:

- `v_customer_transactions` has `security_invoker = true`; `customer_statement()` and
  `unpaid_credit_invoices_list()` are `SECURITY DEFINER` but explicitly filter by
  `owner_id` and the caller's assigned-customer/rep scope.
- `customer_statement()`, the stock/statement RPCs, all write RPCs and every permission
  helper now revoke anon/PUBLIC EXECUTE and grant `authenticated` (plus `service_role`).
- Payment/invoice-line visibility no longer depends on `view_customers`/`view_credit`:
  `rep_can_reference_customer`, `rep_can_reference_credit_invoice` and `rep_can_read_invoice`
  are `SECURITY DEFINER` helpers that carry tenant scope only; the `view_*`/`record_*`
  flag is checked separately in each policy.
- `save_cash_invoice`, `save_credit_invoice`, `process_sales_return` and `save_sales_return`
  validate that all referenced products belong to the manager's tenant and that a rep may
  reference the referenced invoice; `rep_can_write_for()` no longer returns true for a
  non-rep caller with arbitrary IDs.
- `export_print` is enforced in the UI only (no server-side print endpoint exists).
- Applied `0036_legacy_stock_rpc_guard.sql` adds the `view_inventory` guard to the still-callable
  legacy `product_stock_summary()` / `product_stock_summary_v2()` RPCs, restores
  `search_path = public, pg_temp`, and revokes anon/PUBLIC EXECUTE. Their live return shapes are
  older than the local `0020`/`0021` text, so `0036` preserves the live signatures;
  `CREATE OR REPLACE` cannot change an OUT row type.

**Deferred (not fixed in 0035/0036):** product/invoice reference checks rely on validated
`rep_id`/`customer_id` payloads; a rep with a write grant can still submit an invoice
whose lines reference products outside their assigned customer's own history. Tighten
this in a later migration if reps receive broad write grants. Supplier-purchase
`search_path` hardening and the other supplier follow-ups below remain unchanged.

### Supplier purchase follow-ups (from the 0026–0029 review)

**Status (2026-11-24):** migrations `0026`–`0029` are applied on the remote project
(`pswyzpadnicjwdqgwwtd`). Verified: `supplier_purchase_lines` exists with RLS enabled and one
policy; both `save_supplier_purchase(jsonb,jsonb)` and `delete_supplier_purchase(uuid)` exist;
`anon` has no EXECUTE and `authenticated` does; both RPC bodies contain the
`supplier_purchase_history` archive step. Types regenerated via Supabase MCP and compared —
all four objects are present in `src/shared/types/supabase.ts` (the stricter hand-tuned local
typings were retained). No new migration is needed for these items.

- **Edit guard uses gross reversal qty, not net effect.** `save_supplier_purchase()` requires
  `on_hand >= original_movement_qty` before reversing, so an edit that would still leave positive stock
  (e.g. bought 10, sold 5, edit to 6) is rejected. Rework to validate the net result after applying new
  lines if this becomes a real workflow; the current behavior is conservative and never corrupts stock.
- **Reversal rows use the original `unit_cost` as `avg_cost_snapshot`.** As with the existing invoice
  reversal pattern, `product_avg_cost()` ignores negative-qty rows, so deleting an older cheaper purchase
  can leave the remaining valuation on a stale average. Low practical impact.
- **Deleting a purchase does not handle linked payments.** `supplier_payments.purchase_id` is
  `ON DELETE SET NULL`, so a linked payment would survive as an unlinked debit. No current UI sets this
  column; block or reassign it in a future migration if supplier-purchase-linked payments are added.
- **Edit/delete concurrency race.** The edit RPC locks the purchase header early, but the delete RPC does
  not take a row lock before archiving/reversing movements. A concurrent edit and delete could both
  reverse the same `in` rows. Rare in this manager-only workflow; add `FOR UPDATE` on the header in the
  delete RPC if concurrent edits become realistic.
- **Follow-up migration: `search_path` hardening (minor).** `save_supplier_purchase()` and
  `delete_supplier_purchase()` are recreated in 0026/0027/0029 with `SET search_path = public` rather than
  the project pattern `public, pg_temp`. All references are schema-qualified, so no escalation was found;
  recreate the three function definitions in a new additive migration to restore the temp-schema hardening.
- **Follow-up migration: redundant tenant escape (nit).** The supplier/product existence checks accept
  `(owner_id = v_owner_id OR owner_id = auth.uid())` while all writes use `get_manager_id()`. Harmless while
  `user_roles.user_id` is a primary key, but drop the `OR auth.uid()` branch in the same follow-up migration
  to keep the tenant boundary strict.

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
