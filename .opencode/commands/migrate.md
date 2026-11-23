---
description: Additive Supabase migration via the migration track
---

Run the `migration` track from docs/workflows/TRACKS.md for:

$ARGUMENTS

Inspect existing migrations and docs/KNOWN_ISSUES.md first. Present the plan
checkpoint (next migration number, changes, rollback notes) and WAIT for my
approval. Never edit applied migrations; additive + idempotent only; RLS on
every new table. Do not apply to the remote database without my explicit
confirmation. Finish with the Verification Gate and reviewer subagent on the SQL.
