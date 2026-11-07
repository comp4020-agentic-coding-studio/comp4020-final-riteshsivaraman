---
name: integrate
description: Merge verified, reviewed PRs into the integration branch in a safe order, rebuild, re-run the full check, and revert any red merge. Use after the reviewer approves. Never touches main.
---
# Integrate

Run as the `integrator`. Only PRs labelled `status:verified` with an approving review.
1. Order: migrations first, then server, then client, then docs; smaller before larger.
2. `git merge --no-ff` each PR into `integration`. After each: `pnpm build`, `/run-checks`. Red result: `git revert -m 1 <merge>` (a new commit; never rewrite), relabel `status:in-progress`, explain on the issue.
3. Mechanical conflicts only (adjacent lines, imports, doc tables). Behavioural disagreement goes to the orchestrator.
4. On success set `status:merged`, comment the merge hash on the issue.
5. Push `integration` only if Ritesh has approved pushing the integration branch this session; otherwise leave it local and say so.
