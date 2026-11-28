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

## 2026-11-26 - Product consumption analytics
- Track: feature (+ migration layer). User confirmed migration `0030`, shared hook path, local bilingual labels, and commit scope.
- Investigation: requested `0021_product_consumption_analytics.sql` conflicted with existing applied `0021_reservations_and_returns.sql`; local migrations run through `0029`. Verified the three RPC names did not exist remotely, then created additive/idempotent `0030_product_consumption_analytics.sql` and applied it via Supabase MCP to `pswyzpadnicjwdqgwwtd`.
- RPCs `product_consumption_summary(uuid,date,date)`, `product_customer_breakdown(uuid,date,date)` and `product_sales_history(uuid,date,date)` are `SECURITY INVOKER`, `STABLE`, `search_path = public, pg_temp`, return numeric(14,4)/numeric(14,2)/bigint, and inherit RLS from invoice_lines + cash/credit invoices + customers + reps. Verified live: `prosecdef=false`, `proconfig` set, grantees = authenticated/postgres/service_role only (no anon/PUBLIC).
- Regenerated remote types via Supabase MCP and merged the three signatures into `src/shared/types/supabase.ts` (retaining the local hand-tuned precision).
- Added `src/shared/hooks/useProductAnalytics.ts` (three React Query calls, `enabled: Boolean(productId)`, null date bounds normalized, `friendlyError`), `src/shared/lib/bilingual.ts` (`t(ar,en)`, `ar-EG`/`en-US` formatting from `?dir`), and `src/features/reporting/productAnalyticsReport.ts` (unified-template PDF + WhatsApp share).
- Added `src/features/products/ProductConsumptionModal.tsx`: near-fullscreen modal with AR/EN identity header, stock badge, four presets, CSV + PDF actions, four KPIs, customer table/mobile cards with share bars and statement drill-down, day/week/month Recharts trend, and collapsible invoice-line log.
- Wired analytics entry points (clickable product name + "تحليل المبيعات" button) into both `ProductsTab.tsx` and `InventoryTab.tsx` for managers and reps.
- Verification Gate: npm run typecheck PASS; npm run lint PASS (pre-existing warnings only, no new findings); npm run build PASS (chunk-size / ineffective-dynamic-import warnings only).
- Reviewer subagent returned PASS WITH NOTES (no blockers). Two majors fixed: (1) rep-facing Products tab no longer calls manager-only `product_stock_summary_v3()` — `useProductStock` now accepts `enabled` and ProductsTab passes `!isReadOnly`; (2) user approved additive `0031_product_customer_breakdown_fix.sql`, applied via MCP — customers now group by a stable key with `rep_name` from the latest line; live smoke test shows share_pct sums to 100.00 and privileges/SECURITY INVOKER unchanged.
- Also addressed reviewer minors: nullable customer ids typed as nullable and excluded from statement drill-down, all three query errors aggregated with skeleton suppressed on error, CSV invoice type localized, week buckets start Saturday, money formatting keeps two decimals. Deferred to a future migration track: `customer_statement()` / `v_customer_transactions` non-`security_invoker`, and the narrower rep `invoice_lines` policy on invoices assigned by customer.
- Re-ran Verification Gate after fixes. Final push / Vercel verification pending this entry's completion.

## 2026-11-26 - Invoice details: click-to-open, print, WhatsApp and CSV
- Track: migration (✋ approved) → feature (✋ approved). User chose additive migration
  `0033_rep_invoice_lines_assigned_customers.sql`, the `src/hooks/useInvoices.ts` barrel
  re-export, and a feature-files-only commit.
- Remote `schema_migrations` confirmed applied versions through `0032`; `docs/KNOWN_ISSUES.md`
  was stale and is now updated to next free `0034`.
- Created and applied `supabase/migrations/0033_rep_invoice_lines_assigned_customers.sql`
  via Supabase MCP to `pswyzpadnicjwdqgwwtd`. It recreates `rep_read_invoice_lines` with the
  assigned-customer branch for cash and credit, keeps manager exclusion and tenant filters,
  and includes exact rollback notes. `pg_policies` verification confirmed the new expression.
- Reviewer SQL pass: no blockers; only a non-blocking note that the inherited gate is
  `NOT is_manager()` rather than `is_sales_rep()`, to be handled in a future migration if a
  third role is ever introduced.
- Added `useInvoiceDetails(invoiceId, invoiceType)` in `src/features/sales/useInvoices.ts`
  and re-exported it from `src/hooks/useInvoices.ts`. Credit totals now come from
  `v_credit_invoices` (`paid`, `linked_payments`, `remaining`) so FIFO-allocated unlinked
  payments match CreditTab instead of being silently omitted.
- Added `src/features/sales/InvoiceDetailsModal.tsx`: responsive near-fullscreen modal with
  header info, line items, direct payments plus pooled allocation, status, A4 print,
  WhatsApp PDF and UTF-8 CSV. `src/features/statements/InvoiceDetailsModal.tsx` is now a
  compatibility re-export, so statement and overdue drill-downs share the new implementation.
- `Modal.tsx` gained optional `panelClassName` and a `ReactNode` title without changing
  existing modal sizing. `CashTab.tsx` / `CreditTab.tsx` now expose clickable rows/cards,
  linked invoice numbers and "عرض / طباعة" for managers and reps; edit/delete are still
  restricted and stop propagation.
- `pdfGenerators.ts` gained `buildInvoicePdfHtml`, `printInvoice` and
  `shareInvoiceWhatsApp`, all built on `buildUnifiedReportTemplate` with normalized
  Egyptian phone numbers handled by `sharePdfBlobViaWhatsApp`.
- Relevant customer/payment/invoice save/delete mutations invalidate `['invoice-details']`
  to avoid stale reopened modals.
- Verification Gate: typecheck PASS; lint PASS (pre-existing warnings only, none in changed
  files); build PASS (pre-existing chunk-size / ineffective-dynamic-import warnings only).
- Reviewer pass on the implementation returned PASS WITH NOTES with two majors and three
  minors; all were fixed in scope (canonical credit totals, cache invalidation, PDF payment
  history, keyboard/nested-interactive cleanup, phrasing-level modal title). The follow-up
  re-review returned PASS WITH NOTES; its two cosmetic notes (duplicate PDF totals and
  row-order mismatch) were also fixed.
- Authenticated RTL/LTR 375px/1440px visual QA was offered but skipped by user (no login
  credentials supplied); recorded as a limitation in PLAN.md.
- Commit scope: only this feature's files plus its PLAN/LOG/known-issues updates. Other
  pre-existing uncommitted work (Phase 2/3 files, `Personal/`, `tmp_*`) was left untouched.
- Feature commit `b04c6ee` was pushed to `main`; Vercel production deployment
  `dpl_DEGVpv5HpoYNGGhhHDNzGeXep1fv` reported READY for that SHA. A docs-only follow-up
  records the deployment status; no application code changed after verification.

## 2026-11-27 - System Alerts: live notifications and نواقص purchase list
- Track: feature ✋ (plan checkpoint approved) with its migration layer. User confirmed
  migration number `0037` (requested `0025` was already applied), defaulted override argument,
  10,000 EGP high-custody default, drawer path, remote application/type sync, push and Vercel
  verification. `WORKFLOW.md` is absent; `docs/workflows/TRACKS.md` was followed.
- Created `supabase/migrations/0037_notifications_and_low_stock_10.sql`: tenant thresholds,
  effective-threshold `product_stock_summary_v3()`, `notifications` table + RLS/index, rep
  activity triggers, `save_credit_invoice(jsonb,jsonb,boolean DEFAULT false)` with override
  notification, SECURITY INVOKER `get_operational_alerts()` and SECURITY DEFINER
  `mark_notifications_read(uuid[])`. Applied via Supabase MCP; live checks confirmed the
  migration version, RLS, policy, index, triggers, signatures, `search_path` and grants.
- Regenerated types via Supabase MCP and merged the new table/RPCs/threshold columns and the
  third `save_credit_invoice` argument into `src/shared/types/supabase.ts` while retaining the
  hand-tuned local typings.
- Added `src/hooks/useNotifications.ts` (React Query 15s polling, unread and critical counts,
  mark-read mutation) and
  `src/features/notifications/NotificationsDrawer.tsx` (severity groups, direct navigation,
  notification log with unread dots and mark-all-read, "طباعة النواقص").
- `Sheet.tsx` header now has a bell with a live rose badge; drawer navigation switches tabs and
  preselects the inventory low-stock filter; the drawer is mounted from the shell.
- `InventoryTab.tsx` gained "طباعة النواقص (N)" and "مشاركة النواقص واتساب", a low-stock KPI
  label and filter renamed to نواقص (≤10); `InvoiceLineEditor.tsx` now warns at ≤10.
- `pdfGenerators.ts` gained `buildLowStockReportHtml`, `printLowStockReport` and
  `shareLowStockWhatsApp` on `buildUnifiedReportTemplate`, with 7 columns and a blank
  `الكمية المطلوبة (Order Qty)` box (`min-width: 90px`); `report.ts` routes low-stock reports
  through the same template. `lowStock.ts` fetches rows for the drawer.
- Verification Gate: typecheck PASS; lint PASS (pre-existing warnings only, none new);
  build PASS (pre-existing chunk-size warning only).
- Reviewer returned PASS WITH NOTES; all actionable in-scope notes were addressed: alert
  navigation now remounts Inventory with the correct filter (stock/expiry → alerts view), the
  global `N` shortcut ignores key repeat and open dialogs, low-stock print/share are gated by
  `export_print`, the notification log has its own loading state, and new products default to
  the 10-unit threshold. Realtime publication was not enabled by a second migration; the
  15-second poll keeps the badge live without another schema change.
- Docs updated: canonical `INVENTORY_AND_STOCK_REPORT.md` + `docs/docs.md` snapshot, README
  structure, `SYSTEM_ARCHITECTURE.md`, and `KNOWN_ISSUES.md` next migration (`0038`).
- Reviewer follow-up returned PASS WITH NOTES (no blockers); the remaining snapshot drift was
  already fixed before this log entry.
- Feature commit `3d6f486` was pushed to `main`; Vercel production deployment
  `dpl_4Gp1U8xP4GdRK88rKA3EnNUsSzRv` reported READY for that SHA. This docs-only follow-up
  records the deployment status; no application code changed after verification.

## 2026-11-28 - Physical stock count sheet (print + WhatsApp)

- `WORKFLOW.md` is absent; `docs/workflows/TRACKS.md` governed the `feature` track. The Phase 2
  plan checkpoint was presented and confirmed before implementation.
- Appended `StockCountRow`/`StockCountReportInput`, `STOCK_COUNT_REPORT_CSS`,
  `buildStockCountReportHtml`, `printStockCountReport` and `shareStockCountWhatsApp` to
  `src/features/reporting/pdfGenerators.ts` using `buildUnifiedReportTemplate`, `printHtml`
  (A4/12mm) and `generatePdfFromHtml` + `sharePdfBlobViaWhatsApp`. `report.ts` was inspected but
  unchanged.
- `InventoryTab.tsx` gained `طباعة جرد` and `مشاركة كشف الجرد واتساب` buttons plus an
  all-active/filtered scope toggle, gated by `canExportPrint && can('view_inventory')`. Rows are
  sorted by category → product `sort_order` → Arabic name, with the products-query error surfaced.
- Verification Gate: typecheck PASS; lint PASS (pre-existing warnings only, none new); build PASS
  (pre-existing chunk-size warning only).
- Reviewer returned PASS WITH NOTES; all notes were fixed (centered index/write-in cells via
  higher-specificity selectors, bold English product name, and `productsError` wired into the
  data view). Re-verified: computed styles show centered cells, 700-weight English name,
  `text-align: end` + tabular numerals for system stock.
- Static A4 QA in both `rtl` and `ltr`: blank boxes measured 126×30px and 94×30px, `thead`
  computed `table-header-group`, rows `break-inside: avoid`, sign-off flex/space-between with
  28px top margin at 14px/700, and no SKU repeated across generated PDF pages. Arabic PDF text
  extraction is unreliable with Persian-form shaping, so header repetition was confirmed on the
  LTR PDF and via computed styles for RTL; authenticated in-app preview remains unverified.
- Commit scope: only `pdfGenerators.ts`, `InventoryTab.tsx`, `PLAN.md` and `LOG.md`. Pre-existing
  uncommitted catalog-grouping work in `pdfGenerators.ts` plus all docs/supplier-return/`tmp_*`
  work was left untouched.
- Feature commit `deb634a` was pushed to `main`, but its Vercel build (and the earlier `6df2d61`
  build) failed: committed `Sheet.tsx` imports `SupplierReturnsTab`, which existed only as
  untracked local work. With user approval, `85af098` committed the supplier-return components,
  hook, regenerated types and migrations `0039`/`0040` as source only (not applied). Vercel
  production deployment `dpl_J85HwWTP8sCGJxe6cCUCcdawb7Uu` then reported READY for `85af098`,
  which includes the stock count sheet.

## 2026-11-28 - A5 print/PDF default + printable documents

- Tracks: `refactor` (A5 defaults, approved Phase 2 checkpoint) then `feature` (printable
  documents, approved plan). `docs/workflows/TRACKS.md` governed both; `WORKFLOW.md` is absent.
- No schema/RLS changes; no applied migration edited. All work is additive frontend code.
- `pdfShare.ts`: added `PaperSize = 'a4' | 'a5'`; default `a5` with 559px html2canvas width,
  `jsPDF('p','mm','a5')`; A4 still 794px/`a4`. `printHtml` now emits A5
  `size: A5 portrait; margin: 8mm` (A4 → `A4 portrait; 12mm`), sets the print window `dir`,
  makes `.pdf-root` fluid for print, and injects central A4 geometry overrides so explicit
  A4 exports keep their original 794px layout and typography.
- `pdfGenerators.ts` / `productAnalyticsReport.ts`: compact A5 `UNIFIED_REPORT_CSS` (the brief's
  `UNIFIED_STYLES`), low-stock/stock-count CSS, statement/catalog/invoice widths and the
  8-column analytics table rebuilt with fixed percentage widths; direction propagated through
  print and WhatsApp helpers.
- `OverdueInvoicesTab.tsx`: 10-column overdue table given an A5 fixed layout with wrapped
  numeric cells; direction derived from UI language. Labels still advertising A4 were
  corrected in `ProductsTab.tsx` and `InvoiceDetailsModal.tsx`.
- New `src/features/reporting/printableDocuments.ts`: customer/supplier payment receipts,
  expense voucher, monthly payroll register and generic tabular list builders + `printHtml`
  wrappers on the unified A5 template.
- Print buttons wired into `PaymentsTab`, `SupplierPaymentsTab`, `ExpensesTab` (header list +
  per-row receipt) and `PayrollSection` (per-slip + full monthly register), all gated by
  `can('export_print')`.
- First reviewer pass FAILED on three blockers: explicit A4 did not restore A4 geometry,
  fixed 559px root conflicted with 8mm print margins, and wide tables could clip. Fixed centrally
  in `pdfShare.ts` (`A4_OVERRIDE_CSS`, `A5_PRINT_CSS`) plus the compact overdue table; stale A4
  labels/comments corrected. Re-verification: A5 MediaBox 419.53×595.28 in RTL and LTR for
  unified/stock/low-stock/invoice/salary/analytics/overdue/receipt/payroll/generic, root 559px
  with 523px tables and no scroll overflow; A4 override renders 794px at 15px and MediaBox
  595.28×841.89. Authenticated in-app print preview remains unverified (no credentials).
- Verification Gate: typecheck PASS; lint PASS (pre-existing warnings only); build PASS
  (pre-existing chunk-size warning only). Final reviewer re-pass pending.
- Final reviewer returned FAIL on one major and two minor findings; all were fixed: A4 browser
  print now uses `A4_PRINT_CSS` (A4 typography with a fluid root) so a 794px canvas cannot exceed
  the 12mm page margins; salary-slip print/WhatsApp actions are gated by `export_print`; and
  `catch (err: unknown)` replaces `any` in `pdfShare.ts`. Re-verified in an iframe sized to the
  printable area: A4 renders 703px/15px with `size: A4 portrait; margin: 12mm;`, A5 renders
  499px/13px with `size: A5 portrait; margin: 8mm;`.
- Commit, push, Vercel READY and bulk-selection feature still pending at this point.

## 2026-11-28 - Bulk checkbox selection with print/delete

- Track: `feature`; plan checkpoint presented and approved by the user before edits.
- Added `src/shared/hooks/useRowSelection.ts`: id-set selection, `toggle`, `toggleCurrentPage`,
  `isSelected`, `clear`; `selectedRows` is derived only from currently visible rows, so a filter
  or page change cannot cause stale records to be printed or deleted.
- Added `src/shared/ui/BulkActionBar.tsx`: sticky RTL toolbar with selected count, print/delete
  (rendered only when the corresponding action is permitted) and clear-selection button.
- Wired checkboxes into CashTab, CreditTab, OverdueInvoicesTab, PaymentsTab, ExpensesTab and
  SupplierPaymentsTab for both desktop tables and mobile cards. Clicking a checkbox stops row
  propagation so details modals do not open; overdue mobile cards changed from `<button>` to a
  keyboard-accessible `div` (no nested interactive ARIA role) to avoid nested interactive elements.
- Bulk print calls `printGenericDocument` once for the checked rows (one A5 document, not one
  print dialog per row). Bulk delete uses each view's existing mutation sequentially with a
  native confirmation, aggregates failures into one toast and clears selection at the end.
- Print is gated by `can('export_print')`; delete keeps each view's existing `isReadOnly` rule.
- Verification Gate: typecheck PASS; lint PASS (pre-existing warnings only, no new warnings from
  new files); build PASS (pre-existing chunk-size warning only).
- Combined-diff reviewer returned PASS WITH NOTES. All six notes fixed: CashTab footer colSpan
  corrected (`canSelect ? 8 : 7`); overdue mobile card keyboard handler scoped to the card itself
  and its invalid `role="button"` removed; new `any` removed from Payments/Expenses selection code
  via `Record<string, unknown>`; `useRowSelection` now keys selection to the visible row-id set so
  page/filter changes cannot restore stale selections (without a lint-new setState-in-effect);
  supplier-payment dates formatted consistently with `ar-EG`; selection is cleared only when bulk
  print succeeds. Final re-review pending.
- Verification Gate re-run after fixes: typecheck PASS; lint PASS (pre-existing warnings only);
  build PASS (pre-existing chunk-size warning only).
- Reviewer re-pass returned FAIL on one remaining blocker: revisiting a previously seen page/filter
  key restored ids stored for that key. Fixed by resetting the keyed selection during render when
  `viewKey` changes (React's supported derived-state adjustment), so leaving a page discards the
  selection immediately. Lint remains clean of new warnings.

## 2026-11-28 - Bulk invoice print: full details, one invoice per A5 page

- Track: `feature`; Phase 2 plan checkpoint presented and approved by the user before edits.
- User reported that bulk print emitted only a summary table. Cash, Credit and Overdue invoice
  views now call the new `printInvoicesBatch()` instead of `printGenericDocument()`.
- `src/features/sales/useInvoices.ts`: extracted the query body into exported
  `fetchInvoiceDetails(id, type)`; `useInvoiceDetails()` keeps the same query key/cache and reuses
  it. RLS scope and totals logic are unchanged.
- New `src/features/sales/invoicePdfInput.ts`: one `buildInvoicePdfInput()` mapper shared by
  `InvoiceDetailsModal`, `PostSaveInvoicePrintPrompt` and the batch printer, so bulk pages exactly
  match the existing single-invoice print.
- New `src/features/reporting/bulkInvoicePrint.ts`: loads all selected invoices in parallel with
  per-invoice error isolation, builds each `buildInvoicePdfHtml()` document inside a
  `.pdf-print-page` section, appends print-only `break-after: page` CSS (last page resets to auto),
  and calls `printHtml(..., 'a5')` once. Returns printed/loaded/failed counts; partial failures
  show one toast, all failures or a blocked popup show the appropriate message, and selection is
  cleared only after a successful print.
- `BulkActionBar` gained an optional `busy` prop; the three invoice views disable print/delete/
  clear while details are being fetched.
- Verification Gate: typecheck PASS; lint PASS (pre-existing warnings only); build PASS
  (pre-existing chunk-size warning only).
- Static print QA of a two-invoice combined document: `@page size: A5 portrait; margin: 8mm;`,
  2 sections/2 `.pdf-root` elements at fluid 499px with 0 overflow, and both page-break rules
  present.
- Reviewer returned PASS WITH NOTES on failure-state handling; fixed in all three handlers:
  selection is cleared only when printing succeeds with zero failed loads, the popup-blocked toast
  is always shown on failure, partial failures keep the selection for retry, and all-failure cases
  no longer claim anything was printed (Overdue messages are bilingual). Gate re-run after the fix:
  typecheck PASS; lint PASS (pre-existing warnings only); build PASS (pre-existing chunk warning).
  Final reviewer verdict: PASS.
