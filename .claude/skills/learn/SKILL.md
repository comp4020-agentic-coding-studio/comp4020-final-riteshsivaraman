---
name: learn
description: Structured capture of Ritesh's learnings about working with AI coding assistants, from every exchange with the orchestrator. `/learn capture` appends candidates to docs/learnings-inbox.md; `/learn review` shows them in one batch; `/learn promote` writes chosen ones into LEARNINGS.md tied to a lecture lesson. The orchestrator runs capture at the end of each exchange; Ritesh runs review and promote.
---
# Learning log

LEARNINGS.md entries are about the prompter, not the stack, each tied to a named COMP4020 lecture lesson and a commit (CLAUDE.md "Session handoff").

## The test for a candidate: is it about the prompter?
LEARNINGS.md is about how **Ritesh** prompts, delegates and decides, not about what the agents built. Before capturing, check: could the sentence still be true if Claude had done everything itself? If yes, it is a build note for WORKLOG or CUTS, not a learning. A candidate must name something Ritesh did (a prompt, a question, a decision, a correction, a thing he noticed) and what it changed. Write it from his side ("I asked ...", "I noticed ...") and end with a proposed "next time" that he confirms or edits.

## capture (interface agent, end of every exchange; the orchestrator only after a direct exchange with him)
Look for moments where Ritesh: corrected an agent, changed the plan, spotted something the agents missed, made a delegation or scope decision, or learned something about how the workflow behaves. Max 2 per exchange. If none, append nothing and say "no candidate" in one line.
Append to `docs/learnings-inbox.md`, using the same fields LEARNINGS.md entries use (they are a bank for writing PROCESS.md, which the course marks on: failures fixed at the harness level, judgement visible in what was thrown away, why a call beat the obvious alternative, how I knew it was right, every claim cited to a commit):
```
### <date> <title: what I did, from his side; if his act is not in the record, a neutral title>
status: candidate
the obvious thing (his instinct or the agent's default): <...>
what I did instead (from his side): <his words verbatim where possible; [TK: ...] where the record does not show his act>
his words: "<exact quote, no paraphrased sentiment>"
how I knew it helped: <evidence he saw before accepting it, with a number if there is one>
where it landed: <CLAUDE.md rule | spec check | doc | thrown-away attempt | nowhere>
record: <repo only | my recall needed>
lecture lesson: <week N and the lesson as worded in lessons-by-week.md; say if it comes from a slide deck instead>
for PROCESS.md: <strong | medium | skip, and why against the rubric>
evidence: <commit hash | issue/PR number | "none yet">
```
Match the voice of his Assignment 1 and 2 `PROCESS.md` files: say the instinct, then the refusal; fix the class, not the instance; put a number on it; say what he accepted and what he stopped accepting.

## review
Show all `status: candidate` entries in one list with a recommended keep/merge/drop for each. Ask once.

## promote
For each kept entry write a LEARNINGS.md entry in the file's existing format (`## title`, commit link, short paragraph, lesson tie). If there is no commit yet put `[TK: commit]`. End with "(Draft by Claude; Ritesh to check and reword.)". Never apply silently. Set the inbox entry to `status: promoted` with the LEARNINGS heading. Duplicates of an existing entry are merged, not repeated.
