---
status: working
what: Candidate learnings captured from exchanges with the orchestrator, before Ritesh promotes them into LEARNINGS.md. See the learn skill.
date: 2026-11-07
---

# Learnings inbox

Entries appear as `status: candidate`, then become `status: promoted` (with the LEARNINGS heading) or `status: dropped`. Nothing here is applied to LEARNINGS.md silently.

### 2026-11-07 Workflow rules need a check that they are followed
status: promoted (LEARNINGS: A workflow rule is only as good as the check that it is being followed)
what happened: While setting up the parallel agent workflow, Ritesh asked for scheduled or self audits so a workflow that is not followed becomes a direct CLAUDE.md rule. This became `scripts/audit-workflow.sh`, the `/audit-workflow` skill and a "Workflow" section in CLAUDE.md. Harness files: `.claude/agents/`, `.claude/skills/`, `docs/workflow.md`. Commit: not yet made.
his words: "we need some kind of scheduled audits (or even self audits) to make sure this workflow is actually being followed and it not, it should be made more direct in the claude md."
lecture lesson: week 6, compound: a correction written into the harness is permanent (lessons-by-week.md, "Compound. A correction typed in chat is gone next session; one written into the harness is permanent. Then prune.") Extension: a rule is only as good as the check that it is followed.
evidence: none yet (uncommitted)

### 2026-11-07 Isolation test before relying on parallel writers
status: promoted, merged with Branch policy (LEARNINGS: Worktrees branch from the committed HEAD)
what happened: Before building twelve agents on `isolation: worktree`, a one-minute test with a haiku subagent showed the worktree is created on its own branch from the committed HEAD, which means uncommitted harness edits are invisible to builders. That changed the wave preconditions (commit first) and added an audit check.
his words: "Do the five-minute worktree and ultracode test first? ... yes" (answer "5) yes" to the decision list)
lecture lesson: week 9, worktrees: "two subagents editing one checkout overwrite each other; a git worktree gives each its own checkout" (lessons-by-week.md week 9 lesson 1).
evidence: test agent branch worktree-agent-aac38dc44f3220548 (no commits)

### 2026-11-07 Branch policy: commit harness work on integration, keep main untouched
status: promoted, merged into the isolation entry
what happened: Ritesh asked to commit everything logically and push integration. Committing on `integration` (not `main`) kept the deploying branch untouched while making the harness visible to builders, who now merge `origin/integration`. Five commits, no attribution lines, per his rule over the default. Pushed `integration` only, with his explicit yes.
his words: "commit all of it logically, then push integration"
lecture lesson: week 9, "reading: run several at once, writing: one worktree each" plus week 6, compound the harness. The point: the harness must be committed before parallel writers can use it.
evidence: 9676dc0, e97c1ac, 5fbcb95, 1ca42c5, 8facadb on integration

### 2026-11-07 A slow orchestrator needs a fast front door
status: promoted (LEARNINGS: A slow orchestrator needs a fast front door)
what happened: After the orchestrator was designed to run on ultracode, Ritesh pointed out that talking to it directly every time would be slow, and that it may work better with prompts refined first. Added an `interface` agent (sonnet) as his default conversation partner, `/brief` and `.agents/inbox/` work orders, and `/status`; the orchestrator now runs in its own session and sends digests to the interface.
his words: "i think we should have an interfacing agent which is the usual agent i would talk to, because if i try to talk with the orchestrator running ultracode everytime, it takes a lot of time for it to respond. Also, sometimes the orchestartor may work better with prompts that have been refined through the interface agent"
lecture lesson: week 9, "two context windows" and matching model to task (Sonnet by default, the top model for the genuinely hard subtasks): the expensive agent should not be the one in the conversational loop (lessons-by-week.md week 9 lesson 1).
evidence: files `.claude/agents/interface.md`, `.claude/skills/brief`, `.claude/skills/status`; uncommitted

### 2026-11-07 Scoping by batched choices with a recommendation moves faster than open interviews
status: dropped (the quote did not support the claim; Ritesh agreed on review)
what happened: Scoping ran as batches of 3 to 4 multiple-choice questions, each with a recommended option and its cost, then immediately wrote drafts and filed approved ones as issues. Eleven decisions (D48 to D52) and 8 issues were produced in one sitting. Ritesh took the recommendation on almost every question and used the choice to override only where he cared (none overridden this round).
his words: "sure lets get started on all those"
lecture lesson: week 8, lay out the options and their costs before a choice that is expensive to reverse, and let the person choose; week 6, then compound it into the harness (decisions recorded in SCOPE with dates).
evidence: SCOPE.md D48 to D52; issues #1 to #8; drafts in .agents/drafts/

### 2026-11-07 Ask whether the new workflow knows the old records
status: promoted (LEARNINGS: The new workflow did not know about the project's old records)
what happened: After the workflow was built, Ritesh asked whether it knew to use the project's other files such as ADRs. Checking showed agents only named CLAUDE.md, SCOPE and ADR 3; none pointed to docs/INDEX.md or the other six ADRs, and nothing made a new expensive decision produce an ADR. Added a shared context-pack ground rule to all 13 agents, a READ FIRST line in the brief, a `needs-adr` label and a steward duty.
his words: "does this workflow know to interact ewith other files in this project like adr etc"
lecture lesson: week 8, lay out options and write a decision record before a choice that is expensive to reverse; week 9, a subagent knows only its delegation message, so what it must read has to be in the brief.
evidence: uncommitted edits to .claude/agents/*, docs/workflow.md, CLAUDE.md

### 2026-11-07 The write side was parallelised correctly; the read/decide side was accidentally kept serial
status: candidate
what happened: Wave 1 ran 4 to 7 builder/spec-writer agents concurrently across issues #1, #3, #11, #12, #13, #25, each in its own worktree — the right call for *writes*, no collisions. But every resulting PR funnelled through one thread (the orchestrator) for the entire gate: verify it's real, re-merge a moving `integration`, typecheck, test, check:evidence, build, spawn a fresh reviewer, read its findings, merge or send back. 8+ PRs landed before Ritesh had a build he could open and react to. Asked to name the actual failure mode, not just "it was slow," the answer isn't "too much parallelism" or "too little" — it's that parallelism was applied at only one of several levels where it was available: (1) issues/builders — done, correctly; (2) the gate itself — typecheck/test/build/check:evidence for several independent PRs are mutually read-only and do not need to run one-after-another, only the final merge (the one truly order-dependent, state-mutating step) does; (3) within a single investigation — the #25 root-cause chase ran three research agents sequentially when the real question decomposed into independent sub-checks (does the client poll correctly? does the specialist's served position stay stable? does the existing test exercise realistic drift?) that could have been asked at once; (4) visibility to Ritesh — nothing required waiting for the whole wave before shipping him something to look at; "wave complete" was treated as the delivery unit when "one thing is mergeable" should have been.
his words: "this seems to be going on for a long time... is this justified by the features being delivered?"; later, asked to name the real problem: "maybe the issue is in 'what level are we parallelising at?'"
lecture lesson: week 9 tl;dr, verbatim: "parallel subagents work best on reads; keep writes in one thread, and give each writer its own worktree." This session read that as "parallelise the builders, serialise everything else" rather than noticing that most of "everything else" (the gate's mechanical checks, an investigation's independent sub-questions) is itself reads, and reads are exactly what the lecture says is safe to parallelise. The mistake wasn't choosing serial over parallel in general — it was not asking, at each new kind of work, "is this a write that needs one thread, or a read I'm defaulting to serial out of habit?"
evidence: PRs #19, #21, #23, #24, #27, #28, #29, all gated one at a time in this session; agent reports a36e2e76/ab1f261b/a5d82c98 (three sequential #25 investigations); conversation timestamps between "kick off" and the first live app demo. Acted on immediately: `docs/workflow.md` "What level are we parallelising at?" section and a CLAUDE.md workflow bullet, same session.

### 2026-11-07 A loosely-scoped research prompt tripled the cost of one bug investigation
status: candidate
what happened: The bot-stress harness found S1 purchases always timing out. The first research agent concluded it was client-side message staleness (wrong — the harness was already polling correctly, a detail the prompt didn't ask it to check). A second agent confirmed the client had a deliberate anti-staleness poller and declared the architecture sound (also incomplete — it didn't explain why a harness that *was* polling still timed out). Only a third, much more specific prompt — built by noticing the contradiction between "harness polls settle every second" and "the server log shows a full 3-minute timeout" — found the real mechanism (the specialist NPC's served position silently reverts to its free-roaming schedule once the sale conversation ends, so the stock runner's walk target resets every tick forever).
his words: (implicit, from the eventual budget question) "$116 tokens used... is this justified"
lecture lesson: week 8's "lay out options and costs before an expensive choice" extends to diagnosis, not just design decisions: an investigation prompt that doesn't name the specific contradiction to resolve gets a plausible-sounding answer that doesn't actually resolve it, and the next investigation has to re-derive context the first one already gathered. Two research agents' full context load (around 50k and 20k tokens) were substantially spent confirming a wrong hypothesis apiece before the third one, prompted with the exact contradiction ("the bot polls every second AND it times out after 3 minutes — these can't both be true unless something else is wrong"), found root cause in one pass.
evidence: agent reports a36e2e76 (client staleness, wrong), ab1f261b (poller exists, incomplete), a5d82c98 (root cause, correct) in this session; issue #25's comment thread.

### 2026-11-07 Review found what build-time mutation-checking should have caught first
status: candidate
what happened: Two PRs (#1's staff-offer logic, #11's sound mixer) each passed their own builder's self-mutation-check (4/4 and 7/7 mutations caught) and still needed a second full build-review cycle after a fresh reviewer found real gaps the builder's own check missed: #1 had two silently-unmutated branches (the greeter hold-back condition, the one-offer-per-staff rule) that a coarser mutation missed; #11 had an entire acceptance criterion (sound occlusion through walls) with no code at all, which a passing test suite doesn't surface by definition.
his words: n/a — this is an orchestrator-side observation from gating, not something Ritesh said directly this session.
lecture lesson: week 10's "a wrong implementation looks identical to a correct one in every normal run" (CLAUDE.md's own defect-loop language, echoing the lecture) applies to mutation *selection*, not just presence: running some mutations and getting some reds is not the same evidence as running mutations fine-grained enough to isolate each independent branch. A builder mutating "the whole call" where "one condition inside it" is the actual risk gets a false sense of coverage.
evidence: PR #27 review (finding 3, "two of the rules this PR adds go unpinned"); PR #23 review (finding 1, "AC2 isn't implemented at all").

