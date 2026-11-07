---
name: agent-check
description: Checks whether a running subagent (spec-writer, builder, researcher, reviewer) is actually making progress or stuck, using deterministic worktree evidence rather than trusting the "running" status or elapsed time alone. Use when Ritesh asks "is it stuck", "what's taking so long", or whenever a running agent has gone past its expected time for its task size and model tier, before guessing or just waiting longer.
---
# Agent check

Elapsed time alone is a bad signal: an opus builder on a size:l server task
can legitimately run 45-90 minutes; a sonnet spec-writer should usually land
in 5-20. "Running" from `ListAgents` only means the process hasn't exited --
it says nothing about whether the last 10 minutes were spent writing code,
reading three files to understand one function, or looping on the same dead
end. This skill replaces "it's probably fine" or "let me interrupt it" with
actual evidence from the worktree.

## Step 0: agree milestones at launch, not after (Ritesh, 2026-11-08)

The gap this skill can't close on its own: worktree evidence (touch time,
commits) tells you *whether* something changed, not *where the agent thinks
it is* in its own task. Two consecutive spec-writer attempts on issue #2 both
went quiet for 10+ minutes with no file activity; one was genuinely
investigating (fine), the other was killed on suspicion of being stuck but
its last internal state showed it had just finished research and was about
to write the file -- i.e. the kill may have been premature, because there
was no agreed checkpoint to tell the difference.

So every brief for a non-trivial task (more than a single obvious edit)
should ask the agent to send a one-line `SendMessage` checkpoint at 2-4
named milestones specific to its task, e.g. for a spec-writer: "found/
confirmed the mechanism" -> "spec drafted" -> "committed and confirmed red".
For a builder: "design settled" -> "core logic written" -> "tests passing,
opening PR". This turns "it's been quiet for 15 minutes" from a guess into
a fact: either a checkpoint arrived on schedule (fine, say so) or it didn't
(now you have real grounds to check or nudge, not just elapsed time).

When launching any agent whose task isn't a one-line fix, bake these
checkpoints into the brief itself, not as an afterthought if it goes quiet.

## Steps

1. **List running agents.** `ListAgents` to get the current agent id(s),
   their type, and elapsed time. Note elapsed time but don't conclude from it
   alone.
2. **Run the liveness script per running agent**, pointed at its worktree
   path (from the agent's own earlier `output_file`/`worktree` metadata, or
   `.claude/worktrees/agent-<id>/`):
   ```
   bash scripts/agent-liveness.sh .claude/worktrees/agent-<id> [base-branch]
   ```
   It reports, deterministically, with no judgment:
   - `TOUCH <n>s ago` -- age of the most recently modified file in the tree
     (excluding node_modules/.git). This is the single best proxy for "is
     anything happening right now."
   - `COMMITS <n> since <base>` -- has it actually produced anything, with
     the commit log if non-zero.
   - `TREE dirty|clean` -- mid-edit (dirty) vs. between steps or not yet
     started writing (clean).
   - `SCRATCH <n> probe/debug file(s)` (if any) -- tmp-*/*.bak/debug-* files
     newer than the worktree's creation, meaning real exploratory work even
     with nothing committed yet (this is exactly what a deep investigation
     looks like before it writes the actual fix).
3. **Judge, don't just report the numbers.** Match the pattern to what the
   agent's brief asked it to do:
   - **Touch under ~3 min, or dirty tree:** actively working. No action
     needed, don't interrupt.
   - **Touch 3-10 min, clean tree, task is investigative** (spec-writer
     probing an unfamiliar mechanism, researcher tracing a root cause,
     builder reading before a genuinely novel design problem): plausibly
     fine -- reasoning doesn't touch files. Say so plainly rather than
     alarm; this is the single most common false "stuck" signal in this
     project (every multi-step investigation this session looked quiet for
     several minutes before the agent that actually found the answer).
   - **Touch over ~10 min, clean tree, zero commits, task is a normal build
     (not investigative):** worth a direct check-in message (`SendMessage`)
     asking for a one-line status and whether it's blocked on a design
     question -- don't just keep waiting silently, and don't assume it's
     broken either.
   - **Touch over ~15-20 min with no commits and no scratch files on what
     should be a small, bounded task** (a one-line fix, a documented spec):
     genuinely worth escalating -- message it, and if it doesn't respond
     coherently within one more check, consider it stuck: report to Ritesh
     rather than silently waiting longer, and ask whether to let it keep
     running, nudge again, or kill and retry with a tighter brief.
4. **When messaging a possibly-stuck agent**, ask two things explicitly in
   one message: (a) a one-line status of what it's found/done so far, (b)
   whether it's blocked on a design question it should be escalating instead
   of grinding on alone. This project's actual stuck-looking cases
   (`a7d524b4`, `a0bfeb83`) both turned out to be real, hard, in-progress
   work -- the message that resolved each one asked for status, not "are you
   stuck", which let the agent self-report correctly either way.
5. **Report to Ritesh** only the judgment, not the raw script output, unless
   he asks for detail: "still running, confirmed active (just touched X Y
   minutes ago)" or "no activity for N minutes on what should be a small
   task, I've nudged it and I'm waiting for a response" or "it reported back:
   <summary>". Never fabricate or guess what a still-running agent will
   report -- the notification is the only real signal, per the harness's own
   fork/agent rules.

## Notes

- The check itself is read-only -- it never edits anything in the target
  worktree, only `SendMessage` to ask the agent directly. Killing an agent
  (`TaskStop`) is a separate, heavier decision: only do it after a nudge goes
  unanswered for a real stretch (not just "still thinking"), and prefer it
  when there's a concrete reason to believe continuing wastes more than
  restarting saves -- a repeat failure on the same issue, or missed
  milestones (see Step 0). A kill is not reversible insight: the agent's
  last internal state (visible in the stop notification's `result` field)
  may show it was about to finish, so don't kill reflexively on elapsed time
  alone, and say so plainly to Ritesh if the kill turns out to have been
  premature rather than quietly treating it as vindicated.
- A dirty tree is not itself bad news -- it usually means active editing.
  Only a *clean* tree with an *old* touch time and *no commits* on a
  non-investigative task is the real stuck signal.
- Don't run this reflexively on every agent every few minutes -- that's
  polling waste the harness already warns against. Use it when elapsed time
  crosses what's plausible for the task's size/model tier, or when Ritesh
  asks directly.
