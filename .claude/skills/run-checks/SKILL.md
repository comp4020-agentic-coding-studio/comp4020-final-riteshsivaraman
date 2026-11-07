---
name: run-checks
description: Run the full automated gate in a worktree and report a short table: typecheck, tests, check:evidence, build. Use before opening a PR, after merging, and in /integrate.
---
# Run checks

From the worktree root:
```
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test      # = pnpm check
pnpm check:evidence
pnpm build
```
Report a table: step, pass/fail, first failing test name and file:line. Never paste the full log. If tests are red on a clean `integration`, say so: it is not this PR's fault. Remember `pnpm start` serves the gitignored `static/` build; rebuild before any live drive. Stop every dev server you started.
