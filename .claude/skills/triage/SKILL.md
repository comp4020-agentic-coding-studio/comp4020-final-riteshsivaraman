---
name: triage
description: Label, dedupe and lock-check new GitHub issues (status:needs-triage), flag SCOPE conflicts, and move complete ones to status:ready. Use after issues are created or bugs are filed, and at the start of each wave.
---
# Triage

Run as the `triage` agent (haiku).
1. `gh issue list --label status:needs-triage`.
2. Dedupe against open and recently closed issues. Link duplicates, do not close them yourself; propose.
3. Set `type:`, `area:`, `size:` (s under an hour, m a few hours, l more or cross-cutting). Grep the files the issue will edit and add `touches:` labels for hot spots (`migrate.ts`, `service.ts`, `presence.ts`, `src/shared/conversation.ts`, world layout).
4. Compare with SCOPE.md decisions. A conflict goes in the digest (`/clarify`), not a silent relabel.
5. Complete (criteria + spec line + feeds one of staff attention / stock / tables) means `status:ready`. Otherwise `status:needs-user`.
