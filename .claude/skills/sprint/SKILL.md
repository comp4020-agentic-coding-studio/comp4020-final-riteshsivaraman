---
name: sprint
description: Orchestrator procedure for one build wave. Reads ready issues, builds a conflict-free wave, briefs spec-writers then builders in parallel, runs the gates, and reports a batched digest. Use when Ritesh says "run a wave", "sprint", "go", or after issues are approved.
---
# Run a wave (orchestrator only)

0. `/audit-workflow` then `/budget`. If the main checkout has uncommitted changes, stop: worktrees branch from the committed HEAD and will miss them. Make sure `origin/integration` exists.
1. **Pick the wave.** From `status:ready` issues, at most 6 builders. No two issues sharing an `area:` hot spot or any `touches:` label. One `touches:migration` issue at a time. Respect "Depends on".
2. **Size to model** (override with the Agent tool `model` parameter): `size:l` or concurrency-sensitive means builder on opus high; `s`/`m` means sonnet. Specs and docs sonnet. Labels and search haiku.
3. **Spec first.** In one message, spawn all spec-writers for the wave in parallel. Wait. Each spec must be red for the right reason, with the failing output on the issue.
4. **Build.** In one message, spawn all builders in parallel with `isolation: worktree`, using the brief template in docs/workflow.md section 8 filled completely (role, issue, goal, may/must-not edit, rules, contacts, done-when, stop-if). Tell each to first `git fetch` and merge `origin/integration` into its branch. Label issues `status:in-progress`.
5. **Gate.** As PRs arrive: verifier (`/run-checks`, `/feel-check`), then reviewer (`/review-pr`). Fail goes back to the builder, max 2 loops, then you decide: split, re-scope or `/cuts-log`. All green: `status:verified`.
6. **Integrate.** `/integrate`. Anything labelled `needs-feel-check` waits for Ritesh's batch.
7. **Report once.** What merged (with hashes), what failed and why, what needs his feel-check, the digest of questions, spend so far. Then `/worklog` and `/learn capture`.

Never start the next wave while the previous one has unreviewed PRs.
