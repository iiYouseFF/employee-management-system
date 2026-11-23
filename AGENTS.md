# AGENTS.md — Employee Management System

Project guide for coding agents. The original 5-feature implementation brief is
archived at `docs/archive/AGENTS-feature-brief.md` (all five features are built).

## Agentic workflow — every prompt follows a track

This repo uses a guided track system. **`docs/workflows/TRACKS.md` is loaded as
ambient instructions via `opencode.jsonc` and is mandatory for every prompt:**
classify → announce `Track: <name>` → plan checkpoint (where required) →
execute → Verification Gate → report.

- Tracks: `feature`, `bugfix`, `migration`, `refactor`, `review` (read-only), `docs`.
- Slash commands: `/track`, `/feature`, `/fix`, `/migrate`, `/refactor`, `/review`, `/docs`
  (defined in `.opencode/commands/`).
- Gate subagents: `reviewer` (read-only review) and `verifier` (runs checks only),
  defined in `.opencode/agents/`.

## Stack

React 19 + TypeScript 7 (strict OFF) + Vite 8 + Supabase (Postgres/Auth/RLS/RPC)
+ Tailwind CSS 3 + React Query + Recharts. Arabic RTL UI, `ar-EG` formatting
(no i18n layer yet).

## Layout

```
src/app/          entry (main.tsx, App.tsx), routing, providers
src/features/*    auth, sales, customers, payments, suppliers, products,
                  inventory, expenses, statements, reporting, dashboard,
                  reps, settings, audit — each with hooks/components/pages
src/shared/       ui, hooks, lib (supabase client, formatting), types
src/styles/       global CSS
supabase/migrations/  0001–0021 applied; next is 0022
docs/             architecture, accounting model, known issues, workflows
```

Imports use the `@/` alias (`@/*` → `src/*`).

## Hard rules

1. **Never edit applied migrations.** All SQL changes go in a new additive,
   idempotent migration (`migration` track, plan checkpoint required).
2. RLS on every table; manager = full access, sales rep = read-only own data.
   No service-role key in frontend code.
3. Money: `numeric(14,2)` in Postgres, `Intl.NumberFormat` in UI. Never floats.
4. Tailwind logical utilities only (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`);
   never `ml-*`/`mr-*`/`left-*`/`right-*` in new code. RTL-aware icons.
5. Match existing patterns: React Query hooks per feature, loading/empty/error
   states on every data view, no `any` in new code.
6. Accounting sign conventions: `docs/accounting-model.md`. Open SQL defects:
   `docs/KNOWN_ISSUES.md` — fix via the `migration` track, update the list.

## Verification Gate

```bash
npm run typecheck   # tsc -b
npm run lint        # oxlint — pre-existing warnings OK, no new ones
npm run build       # tsc -b && vite build
```

Required before declaring any code-changing track done (see TRACKS.md).

## Environment

- Supabase project: `pswyzpadnicjwdqgwwtd`; env vars `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` (see `.env.example`; never commit `.env.local`).
- Node >= 20.19. Deploy target: Vercel (`vercel.json`).
