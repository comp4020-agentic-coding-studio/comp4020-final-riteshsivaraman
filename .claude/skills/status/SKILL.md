---
name: status
description: One-screen status of the build from the GitHub board, git and the inbox: what merged, what is in flight, what is blocked on whom, what Ritesh owes, spend and the next deadline. Use at session start and whenever he asks "where are we".
---
# Status

1. `bash scripts/audit-workflow.sh` (fast), `gh issue list` grouped by `status:` label, `gh pr list`, `git log integration..main` and `main..integration --oneline | head`, `.agents/inbox/` (unacknowledged work orders), `.agents/budget.log` last line, `docs/digests/` newest.
2. Reply in two lists: **What happened** (past tense, facts with issue numbers and hashes) and **What I need from you** (decisions only he can make; open what he must read). Add time left to the freeze (Sun 20:00) and the deadline (Mon 12:00 AEDT). Under 15 lines.
