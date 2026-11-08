---
status: working notes
what: Interview answers for filling the PROCESS.md TKs and moments. Gists only, Ritesh writes the prose.
date: 2026-11-08
source: Claude Code interview session, 2026-11-08 (Ritesh's multiple-choice answers)
---

# PROCESS.md interview answers

Gists from Ritesh's answers. Not prose. Each line says whether it is his
answer (recall) or backed by the repo.

## Format (from the course site)

- Moments come from the A1/A2 briefs: three or four, each says what you did
  *instead of* the obvious thing and *how you knew* it was right. The final
  brief says "same bundle as the static assignments, scaled up" and sets no
  count of its own.
- 900 to 1100 words. Must also make the case for the stack *and* the agent
  workflow, and discuss your position on "good".
- Planned moments: 1 blueprint, 3 transcripts to cases (sim D43 as a line),
  5 corrections into the harness, new wave 1 parallelism. Moment 4 (logs)
  cut to a line or two. Moment 2 (character tool) dropped if long.

## Why Seen was dropped (TK 1) - Ritesh's recall, no repo record of the reason

- Bad fit for the brief, both halves: nothing truly shared in an inbox, and
  real-time was invisible.
- Its point ("slowly uncomfortable") wouldn't come across to others, e.g. a
  tutor in a short crit.
- Lost interest; the store was more fun.
- Repo: D1 in SCOPE.md (decision only), `b61f6c7` (store replaces Seen).

## Why the visible queue was dropped (TK 2, D47)

- Played it (Ritesh's recall, not recorded): dead time standing in line, and
  one slow customer blocked everyone.
- Real store research: no queues, staff find you, handheld payment.
  Repo: `references/experience.md` section 1c.
- No dated play note exists. PROCESS.md should say so plainly.

## Wave 1 moment (7 Nov)

- Why parallel worktree agents: isolation (each builder in its own worktree,
  one issue each) and the week 9 lecture ("parallel subagents on reads, one
  thread per writer, own worktree").
- Verdict: mixed. Lots shipped, but PRs piled up past review and budget burned.
- Instead of: adding more agents or going back to serial, asked "what level are
  we parallelising at". Rule into CLAUDE.md and docs/workflow.md, `5bbc6f5`.
- How you knew: faster feedback (Ritesh's recall). Repo shows 7 Nov PRs
  #19 to #29 merged in a batch 19:38 to 21:29; 8 Nov PRs #43 to #48 merged one
  at a time 10:25 to 12:18, and #43/#44 are fixes for things found in play
  (inference: he was playing between merges). Git can't show "playable
  sooner" directly; word it as recall.

## Moment 5

- The subsystem-search rule (`8d20aff`) has not visibly caught a later mistake.
  Say that. Use `512c318` (pnpm check runs its own server) for "how I knew".

## Position on "good"

- Agrees with Robin Sloan's "An app can be a home-cooked meal": good means a
  handful of people in the store at once, it never needs to scale (one small
  Fly machine, on purpose).
- Concrete example: real and CPU staff/customers are the same model (D55), so
  a room of two people still feels like a working store.
