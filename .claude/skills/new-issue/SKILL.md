---
name: new-issue
description: Turn scoped drafts from .agents/drafts/ into GitHub issues with the right labels, once Ritesh has approved the batch. Use after /scope-feature, or when an agent finds a bug or follow-up. Never create issues before the batch is approved, except bugs labelled status:needs-triage.
---
# Create issues

1. Show the full batch as one list (title, labels, size, dependencies, spec line). Wait for one explicit yes. Exception: an agent-found bug may be filed immediately with `type:bug status:needs-triage`.
2. For each draft: `gh issue create --title ... --body-file ... --label type:...,area:...,size:...,status:ready,wave:wN` (add `touches:` labels). The body follows `.github/ISSUE_TEMPLATE/feature.yml` sections: Behaviour, Acceptance criteria, Spec line, Feeds (staff attention / stock / tables), Out of scope, Depends on.
3. Add dependencies as "Depends on #n" in the body. Do not set `status:ready` on an issue whose dependency is open; use `status:blocked`.
4. Reply with the issue numbers and a one-line wave proposal. Move the draft to `.agents/drafts/done/`.
