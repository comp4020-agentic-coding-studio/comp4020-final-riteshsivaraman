---
status: working
what: Candidate learnings captured from exchanges with the orchestrator, before Ritesh promotes them into LEARNINGS.md. See the learn skill.
date: 2026-11-07
---

# Learnings inbox

Entries appear as `status: candidate`, then become `status: promoted` (with the LEARNINGS heading) or `status: dropped`. Nothing here is applied to LEARNINGS.md silently.

### 2026-11-07 Workflow rules need a check that they are followed
status: candidate
what happened: While setting up the parallel agent workflow, Ritesh asked for scheduled or self audits so a workflow that is not followed becomes a direct CLAUDE.md rule. This became `scripts/audit-workflow.sh`, the `/audit-workflow` skill and a "Workflow" section in CLAUDE.md. Harness files: `.claude/agents/`, `.claude/skills/`, `docs/workflow.md`. Commit: not yet made.
his words: "we need some kind of scheduled audits (or even self audits) to make sure this workflow is actually being followed and it not, it should be made more direct in the claude md."
lecture lesson: week 6, compound: a correction written into the harness is permanent (lessons-by-week.md, "Compound. A correction typed in chat is gone next session; one written into the harness is permanent. Then prune.") Extension: a rule is only as good as the check that it is followed.
evidence: none yet (uncommitted)

### 2026-11-07 Isolation test before relying on parallel writers
status: candidate
what happened: Before building twelve agents on `isolation: worktree`, a one-minute test with a haiku subagent showed the worktree is created on its own branch from the committed HEAD, which means uncommitted harness edits are invisible to builders. That changed the wave preconditions (commit first) and added an audit check.
his words: "Do the five-minute worktree and ultracode test first? ... yes" (answer "5) yes" to the decision list)
lecture lesson: week 9, worktrees: "two subagents editing one checkout overwrite each other; a git worktree gives each its own checkout" (lessons-by-week.md week 9 lesson 1).
evidence: test agent branch worktree-agent-aac38dc44f3220548 (no commits)

