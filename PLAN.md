# Phase 2 — Unified Design System, Navigation, Mobile Responsiveness

## Goal
Unify the visual system, reorganize app navigation into 3 domain clusters, and enforce full mobile responsiveness across all modules.

## Scope
- Design tokens/primitives in `src/styles/index.css` + `tailwind.config.js`
- Shared UI primitives: page header, filter toolbar, responsive data view, status/payment badges, date preset hook
- App shell: `Sheet.tsx`, `AppNavigation.tsx` - 3 clusters, role badges, manager quick-action bar, mobile nav
- Modal responsiveness: `Modal.tsx`, `FormModal.tsx`
- Module migration to 3-zone layout + mobile card fallback: sales, payments, customers, suppliers, products, inventory, expenses, statements, dashboard, reps, audit
- Data-entry UX: live customer/supplier balance, full remaining settlement button, sticky invoice footer (count/qty/total)
- RTL/LTR + 375px/1440px verification

## Decisions
- Keep existing uncommitted user work untouched; commit only Phase 2 files.
- Keep `مرتجعات المبيعات` in group 1 (المبيعات والعملاء).
- Add lightweight `?dir=ltr` QA override for LTR verification.
- No DB/schema changes.
- Skip authenticated visual QA if no credentials provided; report limitation.

## Checklist
- [x] Tokens/primitives updated
- [x] Shared UI components/hooks added
- [x] Shell/navigation reorganized
- [x] Modal mobile/fullscreen behavior updated
- [x] Tabs migrated to 3-zone + mobile cards (all batches complete)
- [x] Data-entry balance/full-settle/sticky footer added
- [x] typecheck/lint/build pass (lint warnings only; build chunk warnings only)
- [x] Reviewer pass on Phase 2 diff (all five major findings fixed)
- [x] PLAN/LOG updated
- [x] Push, Vercel READY (main b850b75 → tawreed production, deployment dpl_6QJcu91UCMvF8tUfo5qbLHYZa4kP)
- [ ] Authenticated RTL/LTR 375px/1440px visual QA (blocked: no credentials)

---

# Unpaid & Overdue Credit Invoices (15-day payment term)

## Goal
Add an RLS-scoped overdue/unpaid receivables view with a strict 15-day credit
payment term, clickable invoice details, and CSV / WhatsApp PDF export.

## Scope & decisions
- Migration numbers **0031** and **0032** (0022–0030 already exist locally/remotely);
  SQL files `supabase/migrations/0031_unpaid_overdue_invoices.sql` and
  `0032_unpaid_credit_invoices_fix.sql`, both applied to remote Supabase project
  `pswyzpadnicjwdqgwwtd` with explicit user approval. `0032` keeps the RPC's exact
  14-column contract while reporting the invoice rep (matching RLS/other tabs) and
  strengthens the 15-day trigger for direct date changes.
- 15-day rule enforced in three places: UI form (`CreditTab`), DB trigger
  (`credit_invoices_set_due_date`), and the RPC's `COALESCE(due_date, date + 15)`.
  `save_credit_invoice()` is untouched: the trigger covers it additively.
- `unpaid_credit_invoices_list()` is `SECURITY INVOKER`; existing RLS handles
  tenant isolation and rep scoping — no new policies or service-role usage.
- New tab id `overdue_invoices` lives in `REP_TABS`, so managers and sales reps
  both see it; a live red badge shows the overdue count in the sales cluster.
- Paths follow the current `src/app` + `src/features/*` layout (the brief's
  `src/pages` / `src/components/tabs` paths predate the restructure).
- `WORKFLOW.md` does not exist in the repo; `docs/workflows/TRACKS.md` was used
  as the governing workflow (user-confirmed at the plan checkpoint).
- Commit scope: only task files plus the pre-existing untracked `bilingual.ts`
  required by the production build; no `tmp_*` / `Personal/` files.

## Acceptance criteria
- [x] Migration applied; RPC returns the 14 required fields ordered most-overdue first
- [x] 15-day default applies on new/edit credit invoices and to legacy NULL due dates
- [x] Hook + invalidations cover credit invoices, payments and customer rep changes
- [x] Tab: summary strip, status pills, search, manager rep filter, CSV + PDF share
- [x] Desktop `.app-table` + mobile cards; click opens `InvoiceDetailsModal`
- [x] Modal: line items, A4 print, CSV export, WhatsApp PDF
- [x] RTL logical utilities only; bilingual labels via `t()` / `getUiLang()`
- [x] typecheck / lint / build pass; reviewer pass (PASS WITH NOTES, all majors fixed)
- [x] Reviewer follow-ups: filtered KPI/PDF totals, rep-mutation invalidation, bilingual actions, nullable type, zero-day label
- [ ] PLAN/LOG committed, pushed, Vercel READY
- [ ] Authenticated RTL/LTR 375px/1440px visual QA (credentials still needed)

# Phase 3 — Single-product consumption & customer sales analytics

## Goal
Let managers and reps open a near-fullscreen analytics modal from Products or Inventory for one product, filter by date preset, inspect KPIs / top buying customers / trend / detailed invoice lines, export CSV, share a unified PDF to WhatsApp, and drill into a customer statement.

## Scope
- Additive migrations `0030_product_consumption_analytics.sql` (three `SECURITY INVOKER` RPCs) and `0031_product_customer_breakdown_fix.sql` (stable per-customer grouping, deterministic rep from latest line); RPC signatures merged into `src/shared/types/supabase.ts`.
- `src/shared/hooks/useProductAnalytics.ts` (shared by Products + Inventory) using React Query, `enabled: Boolean(productId)`, `friendlyError`.
- `src/shared/lib/bilingual.ts`: lightweight `t(ar,en)` + `ar-EG`/`en-US` formatting keyed off `document.documentElement.dir` (no full i18n layer).
- `src/features/reporting/productAnalyticsReport.ts`: `buildUnifiedReportTemplate` PDF + WhatsApp sharing helper.
- `src/features/products/ProductConsumptionModal.tsx`: identity header, 4 presets, CSV/PDF actions, 4 KPIs, customer table + mobile cards with share bars, Recharts day/week/month trend, collapsible line log.
- Entry points in `src/features/products/ProductsTab.tsx` and `src/features/inventory/InventoryTab.tsx` (clickable name + explicit "تحليل المبيعات" action for both roles).

## Decisions
- Migration numbered `0030` (requested `0021` was already taken by `0021_reservations_and_returns.sql`; local migrations run through `0029`). Confirmed by user ("option a" + all recommendations).
- Hook placed in `src/shared/hooks/` (no `src/hooks/` directory exists), bilingual labels resolved locally from `?dir` override, commit scope limited to feature files + PLAN.md + LOG.md (leave other uncommitted `docs/*` and `tmp_*` work untouched).
- RLS/tenant isolation inherited from existing table policies; no new tables, no service-role usage.
- 0030/0031 applied to Supabase project `pswyzpadnicjwdqgwwtd` via MCP; `REVOKE ... FROM anon/PUBLIC`, `GRANT ... TO authenticated`.
- Reviewer follow-ups fixed in scope: rep-facing Products tab no longer fetches manager-only stock RPC (`useProductStock({ enabled: !isReadOnly })`), nullable customer ids skip statement drill-down, aggregated query errors suppress the skeleton, CSV invoice types localized, Saturday-based week buckets, money formatting keeps two decimals.
- Deferred to a future `migration` track (not fixed here): `customer_statement()` / `v_customer_transactions` is not `security_invoker`. The rep `invoice_lines` gap noted here was subsequently fixed by migration `0033_rep_invoice_lines_assigned_customers.sql` in the invoice-details phase below.

## Checklist
- [x] Migrations 0030 + 0031 created, applied and RPC signatures synced to local types
- [x] Hook + bilingual helpers + PDF/CSV report helper implemented
- [x] Modal + entry points wired in Products and Inventory
- [x] Verification Gate: typecheck PASS, lint PASS (warnings only), build PASS (chunk warnings only)
- [x] Reviewer subagent pass on diff + SQL
- [x] PLAN/LOG updated
- [ ] Push, Vercel READY
- [ ] Authenticated 375px/1440px RTL/LTR visual QA (skipped by user: no credentials supplied)

# Phase 4 — Invoice details: click-to-open, print, WhatsApp and CSV

## Goal
Let managers and sales reps open a complete invoice from cash/credit lists — including legacy header-only invoices — and print/share/export the same data.

## Scope
- Additive migration `0033_rep_invoice_lines_assigned_customers.sql`: rep SELECT policy on `invoice_lines` now covers invoices assigned to the rep by customer as well as by `rep_id`.
- `src/features/sales/useInvoices.ts`: typed `useInvoiceDetails(invoiceId, invoiceType)` with header, customer/rep, itemized lines, direct payment history, and canonical credit totals from `v_credit_invoices`.
- `src/hooks/useInvoices.ts`: barrel re-export for the requested import path.
- `src/features/sales/InvoiceDetailsModal.tsx`: responsive RTL/LTR modal (`w-screen h-dvh md:w-[95vw] md:max-w-[1100px] md:h-[90vh]`), A4 print, WhatsApp PDF, UTF-8 CSV, payment history and status.
- `src/features/statements/InvoiceDetailsModal.tsx`: compatibility re-export so statement/overdue drill-downs share the new modal.
- `src/shared/ui/Modal.tsx`: optional `panelClassName` and `ReactNode` title (existing modals unchanged).
- `src/features/reporting/pdfGenerators.ts`: `buildInvoicePdfHtml`, `printInvoice`, `shareInvoiceWhatsApp` built on `buildUnifiedReportTemplate`.
- `CashTab.tsx` / `CreditTab.tsx`: clickable rows/cards, linked invoice number and "عرض / طباعة" action for both roles; inline edit/delete stop propagation.
- Relevant customer/payment/invoice mutations invalidate `['invoice-details']`.

## Decisions
- Migration number `0033` confirmed against remote `schema_migrations` (through `0032`) and applied via Supabase MCP after explicit user approval.
- Hook lives in the sales feature and is re-exported from `src/hooks/` (user-selected barrel approach).
- No schema/type regeneration needed for 0033 (policy-only change).
- Commit scope: only this feature's files and its PLAN/LOG/known-issues updates; all other pre-existing uncommitted work untouched.

## Acceptance criteria
- [x] Migration 0033 applied; `pg_policies` confirms rep line visibility for assigned customers
- [x] Managers and sales reps can open invoice details from desktop rows and mobile cards
- [x] Edit/delete clicks never open the details modal
- [x] Modal shows header, lines, direct payments, FIFO-pooled allocation and exact remaining balance
- [x] WhatsApp PDF, A4 print and CSV export reuse the unified template / UTF-8 exporter
- [x] Verification Gate: typecheck PASS, lint PASS (pre-existing warnings only), build PASS (pre-existing chunk warnings)
- [x] Reviewer subagent: initial PASS WITH NOTES; canonical credit totals, cache invalidation, PDF payment history and accessibility follow-ups fixed and re-reviewed
- [x] PLAN/LOG committed, pushed, Vercel READY (main b04c6ee → tawreed production, deployment dpl_DEGVpv5HpoYNGGhhHDNzGeXep1fv)
- [ ] Authenticated RTL/LTR 375px/1440px visual QA (skipped by user: no credentials supplied)

---

# System Alerts — live notifications, overdue/low-stock alerts and نواقص PDF

## Goal
Surface live operational alerts in the app shell, persist a notification log with role-safe
RLS, and provide a printable/WhatsApp-shareable Arabic low-stock purchase list at a 10-unit
threshold.

## Scope & decisions
- Additive migration `0037_notifications_and_low_stock_10.sql` (requested `0025` collided with
  an applied file; remote migrations run through `0036`). Applied via Supabase MCP to
  `pswyzpadnicjwdqgwwtd`; next free number is `0038`.
- Threshold: `app_settings.low_stock_threshold` default `10` and
  `high_custody_threshold` default `10000`. Existing product rows are not rewritten;
  `product_stock_summary_v3()` treats `NULL`/`0`/`1` as "use the tenant threshold".
- `public.notifications` has RLS: managers see tenant-wide null-recipient rows, recipients
  see their own; writes happen in `SECURITY DEFINER` triggers/RPCs only.
- `get_operational_alerts()` is `SECURITY INVOKER` and covers low stock/نواقص, out of stock,
  overdue invoices, expired/expiring stock and high rep custody.
- `save_credit_invoice()` gains a defaulted third argument `p_manager_override boolean DEFAULT
  false`; two-argument callers are unchanged, and override saves write a warning notification.
- Paths follow the current layout: `src/hooks/useNotifications.ts`,
  `src/features/notifications/NotificationsDrawer.tsx`, `src/shared/types/supabase.ts`.
- The notification query is not in the Realtime publication; a 15-second React Query poll
  refreshes the badge/log instead of adding a second schema migration.
- `WORKFLOW.md` does not exist; `docs/workflows/TRACKS.md` governed the track. Authenticated
  visual QA was skipped by the user.

## Acceptance criteria
- [x] Migration applied; live RLS/policy/index/trigger/privilege checks verified
- [x] Generated types merged: notifications table, operational-alerts RPC, read RPC, override arg
- [x] Header bell shows live unread + critical count; drawer groups alerts by severity
- [x] Alert actions navigate to Inventory low-stock filter and Overdue Invoices tab
- [x] Notification log shows unread dots and "تحديد الكل كمقروء"
- [x] Inventory and InvoiceLineEditor use the 10-unit threshold; N key prints نواقص
- [x] Print and WhatsApp share use the exact same unified-template PDF (7 columns, blank order qty)
- [x] Verification Gate: typecheck PASS, lint PASS (pre-existing warnings only), build PASS
- [x] Reviewer pass on migration + diff
- [x] PLAN/LOG/known-issues/docs snapshot updated
- [x] Push and Vercel production READY (`3d6f486`, deployment `dpl_4Gp1U8xP4GdRK88rKA3EnNUsSzRv`)
- [ ] Authenticated RTL/LTR 375px/1440px visual QA (skipped by user)

---

# Physical stock count sheet — printable Arabic/RTL warehouse count with WhatsApp sharing

## Goal
Give managers a blank, sign-off-ready A4 stock count sheet that warehouse staff can fill in by
hand (system stock vs. actual count vs. difference), print or share as a PDF via WhatsApp, with
a scope toggle for all active products vs. the current filtered view.

## Scope & decisions
- No schema change: reuse `product_stock_summary_v3()` rows from `useInventory()` and the
  `sort_order` fields already fetched by `useProducts()`.
- `WORKFLOW.md` does not exist; `docs/workflows/TRACKS.md` governed this `feature` track and its
  Phase 2 plan checkpoint was confirmed by the user before any code was written.
- New helpers appended to `src/features/reporting/pdfGenerators.ts`:
  `buildStockCountReportHtml`, `printStockCountReport`, `shareStockCountWhatsApp`, built on
  `buildUnifiedReportTemplate` (company name from `app_settings.title`), `printHtml` (A4, 12mm)
  and `generatePdfFromHtml` + `sharePdfBlobViaWhatsApp`. `report.ts` needs no change.
- Sorting is category → `sort_order` → `name_ar`, with uncategorized products last; category
  bands repeat as group rows. Blank cells use the exact requested box styles, rows use
  `break-inside: avoid`, `<thead>` repeats, and a two-party sign-off row sits under the table.
- Buttons are gated by `canExportPrint && can('view_inventory')`: managers always pass `can()`;
  reps need both permissions. New UI uses only CSS logical utilities (no `ml-*`/`mr-*`/
  `left-*`/`right-*`), and the generated PDF CSS uses `text-align: start/end`.
- Default count scope is **كل الأصناف النشطة**; **العرض المفلتر** respects the active search and
  category filters. Inactive products are excluded from both.

## Acceptance criteria
- [x] Printable A4 RTL/LTR sheet with bilingual badge, category + active count meta, and company header
- [x] 7 columns with blank write-in boxes (115px actual / 90px difference, 30px tall), tabular system stock aligned end
- [x] Category/sort/name ordering, repeating thead, non-splitting rows, sign-off row
- [x] WhatsApp PDF share with a localized message
- [x] Role/permission gating and filter/all-active scope toggle
- [x] Verification Gate: typecheck PASS, lint PASS (pre-existing warnings only, none new), build PASS
- [x] Reviewer PASS WITH NOTES; all in-scope notes (CSS specificity, bold English name, product-query error state) fixed
- [x] Static A4 PDF/HTML QA in `rtl` and `ltr`: box metrics, repeated headers, no SKU repeated across pages
- [ ] Authenticated in-app RTL/LTR visual QA (no credentials supplied)
- [x] PLAN/LOG committed and pushed; Vercel production READY (feature `deb634a`, supplier-returns
  fix `85af098`, deployment `dpl_J85HwWTP8sCGJxe6cCUCcdawb7Uu`)

### Deployment note
The first Vercel build for `deb634a` failed on a pre-existing broken import: commit `6df2d61`
wired `SupplierReturnsTab` into `Sheet.tsx` without committing that component. With user approval,
`85af098` committed the supplier-return components/hook, regenerated types and the additive
`0039`/`0040` migrations (source only — not applied), after which the production deployment
reported READY.

---

# A5 print/PDF pipeline + printable documents

## Goal
Default every generated PDF and browser printout to compact A5 portrait (RTL-safe), keep A4
available explicitly, and add dedicated payment/salary documents plus print buttons across the
remaining key record views.

## Scope & decisions
- `WORKFLOW.md` is still absent; `docs/workflows/TRACKS.md` governed both tracks. Phase 2 plan
  checkpoint confirmed by the user before any A5 edits; printable-documents plan already approved.
- No schema/RLS changes. `refactor` (A5 defaults) followed by `feature` (printable documents).
- `PaperSize = 'a4' | 'a5'`; `generatePdfFromHtml(html, dir = 'rtl', paperSize = 'a5')` uses
  559px/794px container and `html2canvas.windowWidth`, `jsPDF('p','mm',paperSize)`.
- `printHtml(html, title, dir, paperSize)` emits `@page { size: A5 portrait; margin: 8mm; }`
  (A4 → `A4 portrait; 12mm`) and sets the print window direction. A5 print CSS makes `.pdf-root`
  fluid so the fixed 559px canvas does not exceed the printable width; explicit A4 restores the
  original 794px geometry and typography via central overrides in `pdfShare.ts`.
- `UNIFIED_REPORT_CSS` in `pdfGenerators.ts` is the actual constant (the brief called it
  `UNIFIED_STYLES`); it now uses the requested compact A5 values. Low-stock, stock-count,
  statement, invoice, analytics and overdue tables have A5-specific compaction.
- New `src/features/reporting/printableDocuments.ts`: customer/supplier payment receipts,
  expense voucher, monthly payroll register and generic tabular list documents, all built on
  `buildUnifiedReportTemplate` and `printHtml`.
- Print buttons added to Payments, Supplier Payments, Expenses (header list + per-row document)
  and PayrollSection (per-slip + full monthly register), gated by `can('export_print')`.
- All new code uses `@/` imports, Arabic RTL logical utilities, no `any`, no money floats;
  generated templates use logical CSS properties (`border-inline-start`, `text-align: start/end`).

## Acceptance criteria
- [x] A5 default PDFs/prints in both `rtl` and `ltr`; explicit `a4` restores 794px/A4 output
- [x] 559px root / 523px content, compact typography values exactly as requested
- [x] Browser print rule A5 portrait/8mm; print-window `dir` follows report direction
- [x] No horizontal clipping in unified, stock, low-stock, invoice, salary, analytics, overdue,
      receipt, payroll and generic documents (RTL + LTR QA)
- [x] Payment/salary/expense/payroll documents + print buttons implemented and permission-gated
- [x] Verification Gate: typecheck PASS; lint PASS (pre-existing warnings only); build PASS
- [x] Reviewer re-pass on final diff (PASS)
- [x] PLAN/LOG committed, pushed, Vercel READY (commit `153d525`, deployment `dpl_4ZXFg8L9iRAfznbL2ddZbnzeyP2A`)
- [ ] Authenticated in-app print-preview QA (no credentials supplied; static print CSS/PDF QA done)

---

# Bulk selection with actions (invoices/documents)

## Goal
Let managers select multiple invoice/document rows with checkboxes and apply one bulk action
(print or delete) with confirmation.

## Scope & decisions
- Plan checkpoint presented and approved by the user. Added
  `src/shared/hooks/useRowSelection.ts` (id-set, current-page toggle, stale-id safe) and
  `src/shared/ui/BulkActionBar.tsx` (sticky RTL toolbar).
- Wired into six views: Cash, Credit, Overdue invoices; customer Payments, Expenses and
  Supplier Payments. Checkbox column on desktop tables and checkbox on mobile cards; the
  header checkbox selects/clears the current page only.
- No schema/RLS changes; existing delete mutations and `buildGenericDocumentHtml`/`printHtml`
  are reused. One consolidated A5 document per bulk print; sequential deletes with aggregated
  success/failure toast and selection cleared only afterwards.
- Permission gating mirrors existing row actions: bulk print requires `can('export_print')`;
  bulk delete follows each view's existing `isReadOnly` gate. Logical Tailwind utilities only.

## Acceptance criteria
- [x] Plan confirmed by user
- [x] Shared selection UI/hook + bulk print/delete wired into agreed list views
- [x] Verification Gate: typecheck PASS; lint PASS (pre-existing warnings only); build PASS
- [x] A4/A5 browser print re-verified fluid at printable width (703px/499px) after reviewer fix
- [x] Reviewer pass on combined diff (PASS WITH NOTES); all six notes fixed
- [x] Verification Gate re-run after fixes: typecheck PASS; lint PASS; build PASS
- [x] Reviewer re-pass blocker (stale selection restored when revisiting a page) fixed by
      resetting the keyed selection during render
- [x] Push and Vercel READY (included in commit `153d525`)

---

# Bulk invoice print — full details, one invoice per A5 page

## Goal
Replace the tabular bulk print on invoice lists with the exact single-invoice document for each
checked invoice, one invoice per A5 page in a single print job.

## Scope & decisions
- Approved feature plan (checkpoint confirmed by the user). Scope is the three invoice views
  (Cash, Credit, Overdue); payments/expenses/supplier payments keep their tabular bulk print.
- `fetchInvoiceDetails()` extracted from `useInvoiceDetails()` so batch and single print use the
  same RLS-scoped queries. `buildInvoicePdfInput()` shared by the details modal, post-save prompt
  and batch printer so documents stay identical.
- `printInvoicesBatch()` fetches details in parallel, skips/counts unreadable invoices, builds
  each `buildInvoicePdfHtml()` document inside a `.pdf-print-page` section with `break-after: page`,
  and calls `printHtml()` once (A5). `BulkActionBar` gains a `busy` guard to disable actions while
  details are loading.
- No schema/RLS/permission changes; print remains gated by `export_print`. No new `any`, logical
  Tailwind utilities only.

## Acceptance criteria
- [x] Plan approved; full invoice detail documents printed one per A5 page in one print job
- [x] Verification Gate: typecheck PASS; lint PASS (pre-existing warnings only); build PASS
- [x] Static print QA: A5 `@page`, two sections/two roots at fluid 499px, 0 overflow, page-break rules
- [x] Reviewer PASS WITH NOTES; failure-state handling fixed in all three handlers and gate re-run
- [x] Final reviewer confirmation: PASS
- [x] Commit, push and Vercel READY (commit `153d525`, deployment `dpl_4ZXFg8L9iRAfznbL2ddZbnzeyP2A`)

---

# Global paper size + compact print layout + supplier-purchase printing

## Goal
Let the user choose A4 or A5 once in the app header for every print/PDF export, fit more
rows per page with a smaller header, and add list/full/bulk printing for supplier purchases.

## Scope & decisions
- Plan checkpoint approved. User chose a **global header control** and **all printable
  documents** for the compact layout. A5 remains the default; A4 stays explicitly available.
- `getPreferredPaperSize()` / `setPreferredPaperSize()` persist to localStorage
  (`ems.print-paper-size`) with a safe fallback. `printHtml()` and `generatePdfFromHtml()`
  resolve `explicit ?? preference`, so every existing print/PDF path honours the choice.
- `A4_OVERRIDE_CSS` now only widens geometry; it no longer inflates fonts/padding. The shared
  unified template is compact for both sizes (smaller header, meta grid, banner, section title,
  table rows and footer). Wide analytics/low-stock/stock-count/payroll tables were tightened too.
- New shared `PaperSizeSelect` renders in the Sheet header when `export_print` is permitted;
  storage events keep multiple tabs in sync. Hard-coded A5 button labels were removed.
- Supplier purchases: new `supplierPurchasePrint.ts` builds a full purchase document from the
  existing RLS-scoped line query and prints list, single or bulk (one document per sheet in a
  single job). `SupplierPurchasesTab` adds a header list-print button, per-row print, checkboxes
  and `BulkActionBar`, all gated by `export_print`; mobile cards get a print button too.
- `PRINT_PAGE_BREAK_CSS` moved to `pdfShare.ts` and reused by both invoice and purchase batches.
- No schema/migration/RLS changes, no service-role key, no `any`, money via `Intl`/numeric SQL,
  Arabic RTL logical utilities only.

## Acceptance criteria
- [x] Plan approved; A4/A5 preference works globally and persists locally
- [x] Compact header/rows applied to all printable documents; A4 no longer restores large text
- [x] Supplier purchases: consolidated list, full single document, and bulk full documents
- [x] Verification Gate: typecheck PASS; lint PASS (pre-existing warnings only); build PASS
- [x] Static QA (RTL + LTR, A4 + A5): preference resolution, `@page` rules, no inflation CSS,
      supplier document 8 rows/0 overflow, both PDF sizes generated successfully
- [x] Reviewer verdict on final diff: PASS WITH NOTES (no blockers/majors/minors); LTR date
      locale nit fixed, and currency-less list totals kept intentionally to match the other
      tabular list prints
- [x] Verification Gate re-run after reviewer fix: typecheck PASS; lint PASS; build PASS
- [ ] Commit, push and Vercel READY
- [ ] Authenticated in-app print-preview QA (still blocked: no credentials supplied)
