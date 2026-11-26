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

# Phase 3 — Single-product consumption & customer sales analytics

## Goal
Let managers and reps open a near-fullscreen analytics modal from Products or Inventory for one product, filter by date preset, inspect KPIs / top buying customers / trend / detailed invoice lines, export CSV, share a unified PDF to WhatsApp, and drill into a customer statement.

## Scope
- Additive migration `supabase/migrations/0030_product_consumption_analytics.sql`: three `SECURITY INVOKER` RPCs over `invoice_lines` joined to `cash_invoices` / `credit_invoices`; RPC signatures merged into `src/shared/types/supabase.ts`.
- `src/shared/hooks/useProductAnalytics.ts` (shared by Products + Inventory) using React Query, `enabled: Boolean(productId)`, `friendlyError`.
- `src/shared/lib/bilingual.ts`: lightweight `t(ar,en)` + `ar-EG`/`en-US` formatting keyed off `document.documentElement.dir` (no full i18n layer).
- `src/features/reporting/productAnalyticsReport.ts`: `buildUnifiedReportTemplate` PDF + WhatsApp sharing helper.
- `src/features/products/ProductConsumptionModal.tsx`: identity header, 4 presets, CSV/PDF actions, 4 KPIs, customer table + mobile cards with share bars, Recharts day/week/month trend, collapsible line log.
- Entry points in `src/features/products/ProductsTab.tsx` and `src/features/inventory/InventoryTab.tsx` (clickable name + explicit "تحليل المبيعات" action for both roles).

## Decisions
- Migration numbered `0030` (requested `0021` was already taken by `0021_reservations_and_returns.sql`; local migrations run through `0029`). Confirmed by user ("option a" + all recommendations).
- Hook placed in `src/shared/hooks/` (no `src/hooks/` directory exists), bilingual labels resolved locally from `?dir` override, commit scope limited to feature files + PLAN.md + LOG.md (leave other uncommitted `docs/*` and `tmp_*` work untouched).
- RLS/tenant isolation inherited from existing table policies; no new tables, no service-role usage.
- 0030 applied to Supabase project `pswyzpadnicjwdqgwwtd` via MCP; `REVOKE ... FROM anon/PUBLIC`, `GRANT ... TO authenticated`.

## Checklist
- [x] Migration created, applied and RPC signatures synced to local types
- [x] Hook + bilingual helpers + PDF/CSV report helper implemented
- [x] Modal + entry points wired in Products and Inventory
- [x] Verification Gate: typecheck PASS, lint PASS (warnings only), build PASS (chunk warnings only)
- [x] Reviewer subagent pass on diff + SQL
- [x] PLAN/LOG updated
- [ ] Push, Vercel READY
- [ ] Authenticated 375px/1440px RTL/LTR visual QA (blocked: no credentials)
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
- Commit scope: only task files; `src/shared/lib/bilingual.ts` was already added by the
  Phase 3 analytics commit and is reused here. No `tmp_*` / `Personal/` files.

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
- [ ] PLAN/LOG committed, pushed, Vercel READY
- [ ] Authenticated RTL/LTR 375px/1440px visual QA (skipped by user: no credentials supplied)
