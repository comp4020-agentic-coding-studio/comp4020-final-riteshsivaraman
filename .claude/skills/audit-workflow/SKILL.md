---
name: audit-workflow
description: Self-audit that the parallel build workflow is actually being followed. Runs scripts/audit-workflow.sh (deterministic checks on git, GitHub labels, PRs, docs) and adds judgment. Run at session start, before each wave, on a 30 minute loop, and before any promote. Findings are fixed or reported, never ignored.
---
# Workflow audit

1. Run `bash scripts/audit-workflow.sh`. It prints PASS/WARN/FAIL lines for: uncommitted changes in the main checkout; `integration` branch exists; open PRs not targeting `integration`; PRs without `Fixes #`/`Refs #`; open issues without exactly one `status:` label; `status:in-progress` issues with no `agent/<n>-*` branch; stale `agent/*` branches; commits on `main` that did not come from `integration`; CLAUDE.md length; WORKLOG.md older than the latest board activity; unreviewed learning candidates; budget log age.
2. Add judgment the script cannot: Did the last exchange with Ritesh get a `/learn capture`? Did every agent brief use the template? Did anyone message a peer directly? Did a builder edit outside its MAY EDIT list (`git diff --stat` of its PR)?
3. FAIL: stop and fix before continuing. WARN: fix when cheap, else add to the digest. Append the result to `.agents/audit.log`.
4. If the same finding repeats twice, do not just fix it: change CLAUDE.md or the skill so it cannot recur (CLAUDE.md "Workflow" section; week 6, compound the correction).
5. Scheduled: the orchestrator starts a recurring `/loop 30m /audit-workflow` at the start of each session.
