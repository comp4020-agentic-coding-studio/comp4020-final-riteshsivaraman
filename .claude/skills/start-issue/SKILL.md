---
name: start-issue
description: Set up the working context for one issue: worktree, branch, and the context pack (issue text, relevant CLAUDE.md rules, SCOPE section, files owned). Use at the start of any build task, by the orchestrator or a builder.
---
# Start an issue

1. Branch name `agent/<issue>-<slug>`. Subagents with `isolation: worktree` get a worktree automatically (branched from the committed HEAD of the default branch, not from `integration`). Manually: `git worktree add ../wt/<issue>-<slug> -b agent/<issue>-<slug> origin/integration`.
2. First thing: `git fetch origin && git merge origin/integration` so you build on what already landed.
3. Open `docs/INDEX.md`, then read the ADRs and docs that bind this area (see the ground rules in your agent file) and the issue in full, the SCOPE.md decision it cites, and the CLAUDE.md rules for the area (event log, no timers, migration, parody).
4. Confirm the failing spec exists and is red. If not, stop and tell the orchestrator.
5. Comment on the issue: "started, worktree <path>, branch <name>".
