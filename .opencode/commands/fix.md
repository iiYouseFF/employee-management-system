---
description: Bug fix via the bugfix track (root cause first, minimal fix)
---

Run the `bugfix` track from docs/workflows/TRACKS.md for:

$ARGUMENTS

Locate and state the root cause before fixing. Make the minimal fix; if the
cause is in the database schema or an applied migration, switch to the
`migration` track instead. Finish with the Verification Gate and a report
(root cause, fix, regression risk).
