# Prompt Tracks — Agentic Workflow

Every prompt in this repo follows a **track**. This file is loaded as ambient
instructions (see `opencode.jsonc`), so the routing protocol applies to every
request — typed directly or via a `/command`.

## Routing protocol (applies to EVERY prompt)

1. **Classify** — pick exactly one track from the table below. If the prompt is
   ambiguous or spans tracks, ask one clarifying question before doing anything.
2. **Announce** — start the reply with one line: `Track: <name> — <one-line goal>`.
3. **Plan checkpoint** — for tracks marked ✋, output a short plan (files to
   create/modify, schema impact, risks) and wait for user confirmation before
   editing. Read-only investigation before the checkpoint is allowed.
4. **Execute** — follow the track's steps in order. Do not skip steps; if a step
   is genuinely not applicable, say so explicitly.
5. **Verify gate** — run the Verification Gate (below) before declaring done.
6. **Report** — end with: what changed, gate results, and any follow-ups
   (e.g., entries added to `docs/KNOWN_ISSUES.md`).

| Prompt intent | Track | Plan checkpoint | Command |
|---|---|---|---|
| New capability, screen, module, endpoint | `feature` | ✋ | `/feature` |
| Something broken / wrong behavior | `bugfix` | — | `/fix` |
| Schema change, RLS, SQL function, data fix | `migration` | ✋ | `/migrate` |
| Restructure/rename/cleanup, no behavior change | `refactor` | ✋ | `/refactor` |
| Question, explanation, audit, code review | `review` (read-only) | — | `/review` |
| Documentation-only change | `docs` | — | `/docs` |

Pure greetings/clarifications need no track. A SQL defect found during any
track is handed off to the `migration` track (never patched by editing an
applied migration).

---

## Track: feature ✋

1. **Investigate** — read the relevant `src/features/*` folder, its hooks, and
   any related migrations. Reuse existing tables/columns; match existing
   patterns (React Query hooks, feature-folder layout, `@/` imports).
2. **Plan (checkpoint ✋)** — list files to create/modify, schema impact
   (if any → run `migration` track first), and acceptance criteria. Wait for approval.
3. **Implement** —
   - Code lives in `src/features/<name>/{hooks,components,pages}`; shared code in `src/shared/`.
   - Tailwind **logical utilities only** (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`); UI is Arabic RTL (`dir="rtl"`, `ar-EG` formatting).
   - Money: `numeric(14,2)` in SQL, `Intl.NumberFormat` in UI. No floats for money.
   - Every data view: loading, empty, and error states. No `any` in new code.
   - New tables: RLS enabled + manager/rep policies; audit `created_by`.
4. **Verify gate** — run checks; then launch the `reviewer` subagent on the diff.
5. **Report** — update `README.md` structure / relevant `docs/` file if the
   feature adds a module; list acceptance criteria and how to test each role.

## Track: bugfix

1. **Locate** — reproduce or trace the failure to a file/line. State the root
   cause in one sentence before fixing.
2. **Fix minimally** — smallest change that fixes the cause; no drive-by
   refactors. If the root cause is in the database schema or an applied
   migration, switch to the `migration` track.
3. **Verify gate** — run checks; confirm the original failure path is addressed.
4. **Report** — root cause, fix, and regression risk. If the bug reveals a
   deeper defect you did not fix, log it in `docs/KNOWN_ISSUES.md`.

## Track: migration ✋

1. **Inspect** — read `supabase/migrations/` (latest applied number) and
   `docs/KNOWN_ISSUES.md`. Confirm which remote versions are applied before
   assuming a number is free.
2. **Plan (checkpoint ✋)** — next sequential file `supabase/migrations/NNNN_*.sql`
   (currently `0022` is next), what it changes, rollback notes. Wait for approval.
3. **Rules (non-negotiable)** —
   - **Additive and idempotent** (`if not exists`, `create or replace`). Never
     edit or drop an applied migration; never rewrite existing data.
   - RLS enabled on every new table; no table left public; no service-role key
     in frontend code.
   - Money `numeric(14,2)`; `security definer` helpers set `search_path = public`.
   - Header comment + rollback notes in every file.
4. **Apply & sync** — apply via Supabase MCP/CLI only with user confirmation;
   regenerate types afterwards; update `docs/KNOWN_ISSUES.md` (resolve fixed items).
5. **Verify gate** — typecheck/build after type regeneration; reviewer subagent
   on the SQL for RLS holes and destructive statements.

## Track: refactor ✋

1. **Baseline** — run `npm run typecheck`, `npm run lint`, `npm run build` and
   record the result (pre-existing warnings are acceptable, errors are not).
2. **Plan (checkpoint ✋)** — moves/renames/deletions, import rewrites, risk.
   Wait for approval. Treat unfamiliar files as potential user work — investigate
   before deleting.
3. **Execute in small steps** — keep behavior identical; use `@/` alias imports;
   preserve the feature-folder architecture.
4. **Verify gate** — checks must match or improve the baseline; reviewer
   subagent confirms no behavior change slipped in.

## Track: review (read-only)

1. **No edits.** Investigate with read/grep/glob (or the `explore`/`reviewer`
   subagents for large scopes).
2. Answer with file/line references, findings in severity order, and concrete
   recommendations. Route any actionable defect to the right track instead of
   fixing it inline.

## Track: docs

1. Edit only `docs/`, `README.md`, or `AGENTS.md`. Verify facts against the
   code before writing them (no stale claims).
2. Keep the `docs/docs.md` snapshot consistent if structure changes.
3. Verify gate is skipped (no code touched); report what changed.

---

## Verification Gate

Run, in order, and report pass/fail for each:

```bash
npm run typecheck   # tsc -b
npm run lint        # oxlint (pre-existing warnings OK, no new ones)
npm run build       # tsc -b && vite build
```

Then, for `feature`, `migration`, and `refactor` tracks: launch the `reviewer`
subagent on the changed files. For anything touching the running app, the
`verifier` subagent can re-run the checks independently.

A track is **done** only when the gate passes (or failures are explicitly
reported and accepted by the user) and the final report is delivered.

## Repo facts (keep current)

- Stack: React 19 + TypeScript 7 + Vite 8 + Supabase + Tailwind 3 + React Query + Recharts.
- Layout: `src/app/`, `src/features/*`, `src/shared/{ui,hooks,lib,types}`, `src/styles/`; `@/` → `src/`.
- UI language: Arabic, RTL, `ar-EG` number/date formatting (no i18n layer yet).
- Migrations: `supabase/migrations/` 0001–0021 applied; **never edit applied files**.
- Open defects live in `docs/KNOWN_ISSUES.md`; accounting sign conventions in `docs/accounting-model.md`.
- TS `strict` is currently OFF — do not turn it on inside another track; that is its own `refactor` task.
