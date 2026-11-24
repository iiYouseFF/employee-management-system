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
