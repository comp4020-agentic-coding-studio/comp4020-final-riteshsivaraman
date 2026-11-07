---
name: clarify
description: Collect every open question across issues into ONE digest for Ritesh, each with a recommended answer and what it blocks. Use when issues are labelled status:needs-user, or before a wave. Never ask questions one at a time.
---
# Clarification digest

1. `gh issue list --label status:needs-user --json number,title,comments`. Also include `[TK]` blockers named in WORKLOG.md.
2. Group by issue. Each question: the question, your recommended answer, what it blocks, and the cheapest default if he does not answer.
3. Present it as one message and wait. Meanwhile the orchestrator keeps going on other issues.
4. On his answers: comment them on each issue, move to `status:ready`, and note any that change SCOPE.md (append a dated decision, do not edit history).
