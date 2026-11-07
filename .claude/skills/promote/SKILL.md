---
name: promote
description: Ritesh's one command to ship integration to main. Opens the integration to main pull request with an evidence report, waits for his explicit approval, then watches CI and smoke-tests the live URL. Use only when Ritesh says "promote" or "ship integration". A push to main deploys to Fly, so never run it unprompted.
---
# Promote integration to main

1. Preconditions: `/audit-workflow` has no FAIL; `integration` is green in CI; every issue in the promotion is `status:merged`; items labelled `needs-feel-check` have Ritesh's sign-off.
2. Open a PR `integration` to `main` with: issues closed (`Fixes #n` list), a table of evidence per issue (checks, screenshots, reviewer verdict), what Ritesh must feel-check, spend so far. Title and description complete (summary, test plan, related issues).
3. **Stop and ask Ritesh to approve.** Only he merges, or says "merge it". No standing exception.
4. After merge: watch the `checks` workflow and the Fly deploy; then run `/post-deploy-smoke`. Set the issues to `status:shipped`.
5. If the deploy or smoke fails, tell Ritesh at once with the last known good tag (`latest-good`); do not force anything.
