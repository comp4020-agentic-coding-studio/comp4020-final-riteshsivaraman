---
status: working
what: Protocol for the parallel agent build of the store sim: roles, labels, gates, comms, branches, audits, learning capture. Agents read this; Ritesh approves changes to it.
date: 2026-11-07
source: conversation of 2026-11-07; course weeks 5, 6, 9, 10; Claude Code docs on workflows and subagents. Visual version: https://claude.ai/artifact/NmTRCMo31RSpr6SjFynpEu
---

# Parallel build workflow

Deadline Mon 9 Nov 2026 12:00 AEDT. Feature freeze Sun 20:00. After the freeze: bug fixes, consistency sweep, bot stress, docs scaffolds only.

## Ritesh's touchpoints (everything else is automated)
1. Approve the issue batch. 2. Answer the clarification digest (batched). 3. Approve a promote of `integration` to `main` (only he merges to `main`; a push to `main` deploys to Fly). 4. Feel-check in batches. He also writes README.md and PROCESS.md prose himself.

## Roles (`.claude/agents/`)
orchestrator (opus, ultracode; the main session) · scoper (opus) · triage (haiku) · researcher (haiku) · server-builder, client-builder, spec-writer (sonnet, worktree) · verifier (sonnet) · reviewer (opus, fresh) · integrator (sonnet, worktree) · steward (sonnet) · bot-tester (sonnet). Existing: event-log-reviewer, fiction-integrity-reviewer (reviewer sub-passes).

Model by `size:` label: `l` or concurrency-sensitive = opus high builder; `s`/`m` = sonnet; labels, search, log reading = haiku.

## Communication
- Agents message **only the orchestrator** (SendMessage to `main`). No builder to builder.
- Every agent also comments progress on its own issue or PR. The board is the record and the process evidence.
- Builders never self-claim. The orchestrator assigns.
- Questions for Ritesh are batched by `/clarify`; nothing blocks the rest of the wave.

## Branches and isolation
- `main` deploys. `integration` does not (CI deploys on `push` to `main` only; checks also run on PRs). All PRs target `integration`.
- One issue = one branch `agent/<issue>-<slug>` = one worktree. Subagents with `isolation: worktree` branch from the committed HEAD, so commit harness changes before a wave, and builders first merge `origin/integration`.
- Never amend, rebase published history or force-push. Revert with a new commit.
- Hot spots are single lane via `touches:` labels: `migration` (numbered migrations collide), `conversation`, `world-layout`, `service`. Spec files are one per issue.
- Pushing any branch needs Ritesh's yes (CLAUDE.md).

## Labels
type: `bug feature doc harness` · status: `needs-triage needs-user ready in-progress in-review verified merged shipped blocked` (exactly one) · area: `server client shared spec docs` · touches: `migration conversation world-layout service` · wave: `w1..w4` · size: `s m l` · `needs-feel-check`.

## Gates for a PR
Failing-first spec (red for the right reason) → builder green → `/run-checks` → `/feel-check` evidence → `/review-pr` approval → `/integrate` (full check after each merge) → batched human feel-check → `/promote`. Max 2 fix loops, then the orchestrator splits, re-scopes or `/cuts-log`s.

## Delegation brief (section 8 of the visual doc; use verbatim)
```
ROLE        <agent> (<model>, <effort>). You work alone in worktree <path>
ISSUE       #<n> "<title>" (read the full issue first)
GOAL        <one sentence; the spec file that is already red>
MAY EDIT    <globs>          MUST NOT EDIT  <globs, docs, README, PROCESS>
RULES       * Read CLAUDE.md and the SCOPE decision(s) cited. First: git fetch && git merge origin/integration
            * Every state change writes an events row. No timers.
            * Data model change = migration in the same change, run migrate tests.
            * Never amend, rebase, force-push, push to main. Commit small.
            * Never write README/PROCESS prose: [TK] and say what is missing.
            * Do not guess through ambiguity: ask on the issue and stop.
CONTACTS    Message only the orchestrator. Comment on #<n> as you go.
DONE WHEN   pnpm check and check:evidence pass in your worktree; PR against integration
            with "Fixes #<n>", how-it-works paragraph, test evidence.
STOP IF     you need a file outside MAY EDIT, a second migration, or a decision on SCOPE.
```

## Spend
`/budget` at each wave start and every ~10 agents. Pause and ask at 70%, hard stop at 85% (proposed; calibrate on wave 1). ultracode removes the concurrency cap and warning, so every wave caps its own agent count (6 builders).

## Audits (the workflow checks itself)
- `scripts/audit-workflow.sh` + `/audit-workflow`: at session start, before each wave, before each promote, and on `/loop 30m /audit-workflow` started by the orchestrator at session start. Results append to `.agents/audit.log`.
- A repeated finding means the rule is too weak: tighten CLAUDE.md "Workflow" or the skill, do not just fix the instance.
- `/consistency-sweep` after each promote and before the freeze.

## Learning capture
At the end of each exchange with Ritesh the orchestrator runs `/learn capture`, appending candidates to `docs/learnings-inbox.md`. He runs `/learn review` and `/learn promote`; entries land in LEARNINGS.md tied to a lecture lesson, marked for him to reword.

## Known limits (verified 2026-11-07)
- Subagent `isolation: worktree` works (test: worktree created on its own branch, clean tree). Whether a workflow script's `agent()` accepts worktree isolation is not documented: use the named subagents for writers.
- The `ultracode` keyword triggers only from a prompt a human types, not from `claude -p` or scheduled runs. `/overnight` must be started by Ritesh.
- Parallel writers are the weak point (Cognition 2026). Mitigation: disjoint areas, single-lane hot spots, one integrator, reviewer with fresh context.
