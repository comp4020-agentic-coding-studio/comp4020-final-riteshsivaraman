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

### 2026-11-07 Branch policy: commit harness work on integration, keep main untouched
status: candidate
what happened: Ritesh asked to commit everything logically and push integration. Committing on `integration` (not `main`) kept the deploying branch untouched while making the harness visible to builders, who now merge `origin/integration`. Five commits, no attribution lines, per his rule over the default. Pushed `integration` only, with his explicit yes.
his words: "commit all of it logically, then push integration"
lecture lesson: week 9, "reading: run several at once, writing: one worktree each" plus week 6, compound the harness. The point: the harness must be committed before parallel writers can use it.
evidence: 9676dc0, e97c1ac, 5fbcb95, 1ca42c5, 8facadb on integration

### 2026-11-07 A slow orchestrator needs a fast front door
status: candidate
what happened: After the orchestrator was designed to run on ultracode, Ritesh pointed out that talking to it directly every time would be slow, and that it may work better with prompts refined first. Added an `interface` agent (sonnet) as his default conversation partner, `/brief` and `.agents/inbox/` work orders, and `/status`; the orchestrator now runs in its own session and sends digests to the interface.
his words: "i think we should have an interfacing agent which is the usual agent i would talk to, because if i try to talk with the orchestrator running ultracode everytime, it takes a lot of time for it to respond. Also, sometimes the orchestartor may work better with prompts that have been refined through the interface agent"
lecture lesson: week 9, "two context windows" and matching model to task (Sonnet by default, the top model for the genuinely hard subtasks): the expensive agent should not be the one in the conversational loop (lessons-by-week.md week 9 lesson 1).
evidence: files `.claude/agents/interface.md`, `.claude/skills/brief`, `.claude/skills/status`; uncommitted

### 2026-11-07 Scoping by batched choices with a recommendation moves faster than open interviews
status: candidate
what happened: Scoping ran as batches of 3 to 4 multiple-choice questions, each with a recommended option and its cost, then immediately wrote drafts and filed approved ones as issues. Eleven decisions (D48 to D52) and 8 issues were produced in one sitting. Ritesh took the recommendation on almost every question and used the choice to override only where he cared (none overridden this round).
his words: "sure lets get started on all those"
lecture lesson: week 8, lay out the options and their costs before a choice that is expensive to reverse, and let the person choose; week 6, then compound it into the harness (decisions recorded in SCOPE with dates).
evidence: SCOPE.md D48 to D52; issues #1 to #8; drafts in .agents/drafts/

### 2026-11-07 Ask whether the new workflow knows the old records
status: candidate
what happened: After the workflow was built, Ritesh asked whether it knew to use the project's other files such as ADRs. Checking showed agents only named CLAUDE.md, SCOPE and ADR 3; none pointed to docs/INDEX.md or the other six ADRs, and nothing made a new expensive decision produce an ADR. Added a shared context-pack ground rule to all 13 agents, a READ FIRST line in the brief, a `needs-adr` label and a steward duty.
his words: "does this workflow know to interact ewith other files in this project like adr etc"
lecture lesson: week 8, lay out options and write a decision record before a choice that is expensive to reverse; week 9, a subagent knows only its delegation message, so what it must read has to be in the brief.
evidence: uncommitted edits to .claude/agents/*, docs/workflow.md, CLAUDE.md

