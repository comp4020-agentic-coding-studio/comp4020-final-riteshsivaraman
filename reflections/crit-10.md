---
status: skeleton
what: Fact list and [TK] gaps for the crit 10 reflection. Ritesh writes the prose (150 to 300 words, as crit-9.md).
date: 2026-10-18
source: Claude's notes from the crit-10 prep session of 2026-10-18; commits cited by hash.
---

# Crit 10 reflection

## What was the breakthrough that moved the work forward?

Facts to draw on (not prose):
- The events table already recorded every state change (CLAUDE.md invariant), but nothing reached stdout, so `flyctl logs` showed only "listening on". Fixed in `a60962b`: one stdout line per events row, same writers, no new dependency.
- Week 10 slide it ties to: "logs help only when a command the agent can run prints them" (tl;dr).
- Checked with two real WebSocket clients (Ada and Bo) on a throwaway database: the log alone says who joined, who was refused the back room, who switched role, who left. A session token never appeared in the log (checked against every token in the database).
- Whether this was a breakthrough or a gap you had not seen: [TK]

## What did this work change about who I want to be as a software developer?

- [TK] Ritesh's own account.
- Prompts that may help: the D18 clamp was believed missing until found under another name (`clampToWalkable`); a mutation (customers clamped as staff) turned `spec/presence.test.ts` red, so the rule is guarded.
- Known gap you will be asked about: role is self-chosen (`DEV_ROLE_SWITCH`), so "staff only" holds against a customer who stays a customer. Written down in ADR 3's addendum. [TK] your decision.

## Evidence kinds
- Repo: `a60962b`, ADR 3 addendum, `spec/eventlog.test.ts`.
- Recall only: anything about what you felt or decided in the session. [TK]
