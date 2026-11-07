---
name: learn
description: Structured capture of Ritesh's learnings about working with AI coding assistants, from every exchange with the orchestrator. `/learn capture` appends candidates to docs/learnings-inbox.md; `/learn review` shows them in one batch; `/learn promote` writes chosen ones into LEARNINGS.md tied to a lecture lesson. The orchestrator runs capture at the end of each exchange; Ritesh runs review and promote.
---
# Learning log

LEARNINGS.md entries are about the prompter, not the stack, each tied to a named COMP4020 lecture lesson and a commit (CLAUDE.md "Session handoff").

## capture (orchestrator, end of every exchange)
Look for moments where Ritesh: corrected an agent, changed the plan, spotted something the agents missed, made a delegation or scope decision, or learned something about how the workflow behaves. Max 2 per exchange. If none, append nothing and say "no candidate" in one line.
Append to `docs/learnings-inbox.md`:
```
### <date> <short title>
status: candidate
what happened: <facts, past tense, file or issue refs>
his words: "<exact quote, no paraphrased sentiment>"
lecture lesson: <week N, the lesson, from ~/Documents/.../Lectures/lessons-by-week.md; read it, do not recall from memory>
evidence: <commit hash | issue/PR number | "none yet">
```
## review
Show all `status: candidate` entries in one list with a recommended keep/merge/drop for each. Ask once.

## promote
For each kept entry write a LEARNINGS.md entry in the file's existing format (`## title`, commit link, short paragraph, lesson tie). If there is no commit yet put `[TK: commit]`. End with "(Draft by Claude; Ritesh to check and reword.)". Never apply silently. Set the inbox entry to `status: promoted` with the LEARNINGS heading. Duplicates of an existing entry are merged, not repeated.
