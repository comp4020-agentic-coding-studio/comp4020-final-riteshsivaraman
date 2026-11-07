---
name: review-pr
description: Fresh-context review of a pull request against the Store sim's invariants. Use after the verifier passes, before integration. Read-only.
---
# Review a PR cold

Run as the `reviewer` agent. Read the issue, then the diff, then only the code around it.
1. Event log: every state change writes an `events` row (run `event-log-reviewer` for the table).
2. Authority: the server decides who may see or do what (ADR 3). One staff member per customer. A CPU never takes a customer a real user can still claim (D47).
3. Concurrency: two users at once, slow connection, restart; no timers (the machine stops when idle).
4. Mutation-check the rules touched (scratch copy, never the PR branch).
5. Fiction integrity for any visible copy (`fiction-integrity-reviewer`); no Apple assets; everything procedural.
6. Agreement: do README claims, CLAUDE.md rules, SCOPE and spec still match this change?
Output: approve, or numbered findings with file:line, why it matters, a failing scenario. Comment on the PR; do not edit code.
