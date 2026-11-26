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
