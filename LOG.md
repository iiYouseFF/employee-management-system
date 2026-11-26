# LOG

## 2026-05-16 - Phase 2 start
- Track: feature - unify design system, reorganize navigation, enforce mobile responsiveness.
- Confirmed by user. Investigated current shell, tokens, modal, tabs, auth, and deployment setup.
- Existing uncommitted work present; will not touch it.
- Decisions: keep Returns in group 1; add ?dir=ltr QA override; no DB changes; authenticated visual QA limited without credentials.
- Restored branded dark-blue gradient header/nav; kept supplier sub-tabs in top-level navigation.
- Added reusable 3-zone primitives (PageHeader, FilterToolbar, ResponsiveDataView), date presets, status/payment badges, mobile cards, and design tokens.
- Migrated CashTab, CreditTab, PaymentsTab and CustomersTab to PageHeader + FilterToolbar + ResponsiveDataView with date presets, loading/empty/error states, sticky desktop totals and mobile cards.
- Added live customer balance on invoice/payment selection and one-click "سداد كامل المتبقي" in customer payments.
- Added sticky modal footers with item count, total quantity and 18px bold tabular Grand Total in cash/credit invoice modals and InvoiceLineEditor.
- Hardened ?dir=ltr override in main.tsx and used border-inline-end for nav cluster dividers.
- Remaining module migrations are running in parallel; gate and reviewer pass pending.
- Batch 2 complete: Products, Expenses, Returns, Supplier Directory/Purchases/Payments/Statement, Statements, Reps, Audit, Inventory, Dashboard (Manager + Monthly) migrated to 3-zone layout with date presets where applicable, loading/empty/error states and mobile cards.
- Supplier payments now show live outstanding balance with one-click "سداد كامل المتبقي" (excludes the payment being edited).
- Fixed migration-induced JSX breakage in InventoryTab and TypeScript errors in StatementTab/SupplierPaymentsTab; cleaned new lint findings in PaymentsTab, AuditLogsTab, and quick-action context (context split into a store module to avoid react-refresh warning).
- Verification Gate: npm run typecheck PASS; npm run lint PASS (warnings only, no new blockers); npm run build PASS (chunk-size/ineffective-dynamic-import warnings only).
- Reviewer subagent returned PASS WITH NOTES. Fixed all five major findings: quick-action signals now survive tab switches and are consumed by the target tab; Customers pagination moved to ResponsiveDataView footer; supplier statement debit/credit signs follow the accounting model; role-gated stored tabs are validated before render; KPI dashboard shows error banner, em-dash placeholders and chart empty/error states.
- Root app direction now follows the ?dir override instead of being hard-coded RTL.
- Committed in two steps: supplier-purchase feature dependencies first (1171bf2), then the Phase 2 UI/UX migration (b850b75). docs/* and tmp_* left uncommitted per scope.
- Pushed main to origin. Vercel production deployment dpl_6QJcu91UCMvF8tUfo5qbLHYZa4kP (commit b850b75) reached READY at https://tawreed-zeta.vercel.app.

## 2026-11-24 - Supplier purchase migrations verification
- Track: migration. User confirmed applying supplier-purchase migrations 0026–0029.
- Inspected remote `schema_migrations`: 0026–0029 were already recorded as applied; no re-application was needed (files are additive/idempotent regardless).
- Verified live schema/privileges: `supplier_purchase_lines` exists with RLS + 1 policy; `save_supplier_purchase(jsonb,jsonb)` and `delete_supplier_purchase(uuid)` exist; anon EXECUTE revoked; authenticated EXECUTE granted; both RPC bodies include `supplier_purchase_history` archiving.
- Regenerated types with Supabase MCP and compared: all four objects present; retained the stricter hand-tuned local typings (MCP output alphabetizes and widens enums). No type file change required.
- Verification Gate: npm run typecheck PASS; npm run lint PASS (warnings only); npm run build PASS (chunk-size warnings only).
- Reviewer subagent returned PASS WITH NOTES: RLS, tenant scoping, privileges, idempotency, money types and archive/reversal logic all verified OK; no blockers. Two non-blocking follow-ups logged: restore `search_path = public, pg_temp` on the three RPC definitions, and drop the redundant `OR owner_id = auth.uid()` tenant escape in existence checks. Both belong in a new additive migration (plan checkpoint required), not in this verification.
- Updated docs/KNOWN_ISSUES.md with applied-status and follow-up notes; no new migration created.

## 2026-11-26 - Product consumption analytics
- Track: feature (+ migration layer). User confirmed migration `0030`, shared hook path, local bilingual labels, and commit scope.
- Investigation: requested `0021_product_consumption_analytics.sql` conflicted with existing applied `0021_reservations_and_returns.sql`; local migrations run through `0029`. Verified the three RPC names did not exist remotely, then created additive/idempotent `0030_product_consumption_analytics.sql` and applied it via Supabase MCP to `pswyzpadnicjwdqgwwtd`.
- RPCs `product_consumption_summary(uuid,date,date)`, `product_customer_breakdown(uuid,date,date)` and `product_sales_history(uuid,date,date)` are `SECURITY INVOKER`, `STABLE`, `search_path = public, pg_temp`, return numeric(14,4)/numeric(14,2)/bigint, and inherit RLS from invoice_lines + cash/credit invoices + customers + reps. Verified live: `prosecdef=false`, `proconfig` set, grantees = authenticated/postgres/service_role only (no anon/PUBLIC).
- Regenerated remote types via Supabase MCP and merged the three signatures into `src/shared/types/supabase.ts` (retaining the local hand-tuned precision).
- Added `src/shared/hooks/useProductAnalytics.ts` (three React Query calls, `enabled: Boolean(productId)`, null date bounds normalized, `friendlyError`), `src/shared/lib/bilingual.ts` (`t(ar,en)`, `ar-EG`/`en-US` formatting from `?dir`), and `src/features/reporting/productAnalyticsReport.ts` (unified-template PDF + WhatsApp share).
- Added `src/features/products/ProductConsumptionModal.tsx`: near-fullscreen modal with AR/EN identity header, stock badge, four presets, CSV + PDF actions, four KPIs, customer table/mobile cards with share bars and statement drill-down, day/week/month Recharts trend, and collapsible invoice-line log.
- Wired analytics entry points (clickable product name + "تحليل المبيعات" button) into both `ProductsTab.tsx` and `InventoryTab.tsx` for managers and reps.
- Verification Gate: npm run typecheck PASS; npm run lint PASS (pre-existing warnings only, no new findings); npm run build PASS (chunk-size / ineffective-dynamic-import warnings only).
- Reviewer subagent reviewed SQL + diff; findings above. Final push / Vercel verification pending this entry's completion.
## 2026-11-26 - Unpaid & Overdue Credit Invoices
- Track: migration → feature → docs. User confirmed the Phase 2 plan including migration
  number 0031 (0022–0030 already exist), the trigger-based 15-day rule, extending
  InvoiceDetailsModal, scoped commit, and remote migration application.
- No `WORKFLOW.md` exists in the repo; used docs/workflows/TRACKS.md with the requested
  plan checkpoint (workflow discrepancy confirmed by user).
- Created `supabase/migrations/0031_unpaid_overdue_invoices.sql`: backfill/default
  `due_date`, BEFORE INSERT/UPDATE trigger `credit_invoices_set_due_date`, and
  SECURITY INVOKER RPC `unpaid_credit_invoices_list()` returning 14 columns,
  ordered most-overdue first; anon EXECUTE revoked, authenticated granted.
- Applied migration to Supabase project `pswyzpadnicjwdqgwwtd` via MCP (`apply_migration`);
  regenerated types via MCP and added the RPC return type to `src/shared/types/supabase.ts`
  while retaining existing hand-tuned local typings.
- Added `useUnpaidCreditInvoices()` (`['unpaid-credit-invoices']`) and invalidations on
  credit invoice save/delete, payments add/edit/delete, and customer mutations.
- `CreditTab`: invoice date changes now auto-set `due_date = date + 15` via `addDays`;
  new invoices start with today + 15; due date remains manually editable.
- Added `src/features/sales/OverdueInvoicesTab.tsx` with KPI strip, status pills,
  search (invoice/customer/phone), manager rep filter, CSV export, unified-template
  WhatsApp PDF, desktop `.app-table` + mobile cards, and click-through to
  `InvoiceDetailsModal`; registered `overdue_invoices` for reps and managers in
  `Sheet.tsx` with a live red badge in `AppNavigation`.
- Extended `InvoiceDetailsModal` with A4 print, CSV export and WhatsApp PDF actions.
- Verification Gate: typecheck PASS; lint PASS (pre-existing warnings only, no new
  findings in changed files); build PASS (pre-existing chunk-size warnings).
- Reviewer subagent: PASS WITH NOTES, no blockers. Fixed in code: KPI strip and PDF header
  now derive totals from the same filtered rows as the table/CSV; rep add/update/delete
  invalidates `['unpaid-credit-invoices']`; CSV/print buttons and company fallback are
  bilingual; generated RPC type uses `Record<string, never>` and nullable `customer_id`;
  zero-day invoices read "مستحقة اليوم" / "Due today".
- Reviewer SQL follow-up (user-approved): created and applied
  `supabase/migrations/0032_unpaid_credit_invoices_fix.sql`. It reports the invoice's own
  `rep_id`/`rep_name` (instead of coalescing with the customer's rep, which disagreed with
  RLS and other sales tabs) while keeping the exact 14-column RPC contract, and updates
  `credit_invoices_set_due_date()` so an invoice-date change moves `due_date` to `date + 15`
  unless the statement explicitly changed `due_date`. Regenerated types: RPC signature
  unchanged; live smoke test shows 18 unpaid rows with no null reps.
- Both `0031_*` files remain applied under distinct remote timestamp versions; they were
  not renamed. `docs/KNOWN_ISSUES.md` records the duplicate-prefix note and next free `0033`.
- Verification Gate re-run on the isolated commit (HEAD + task files only): typecheck PASS;
  lint PASS (pre-existing warnings only); build PASS (pre-existing chunk-size warnings).
  The shared working tree has unrelated concurrent edits; those were not touched.
