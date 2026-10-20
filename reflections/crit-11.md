---
status: skeleton
what: Fact list and [TK] gaps for the crit 11 reflection. Ritesh writes the prose (150 to 300 words, as crit-9.md and crit-10.md).
date: 2026-10-21
source: Claude's notes from the 2026-10-20 and 2026-10-21 sessions, from the commit log and tests; nothing here is Ritesh's own account.
---

# Crit 11 reflection

## What was the breakthrough that moved the work forward?

Facts to draw on (not prose):
- Two real people at once exposed bugs that the NPC-only tests never could. The seat rule only counted chats with an NPC, so two real people sitting held no table (fixed in `8c6ef38`, with a test that seats a real pair). The first version of the stock hand-over only settled for an NPC specialist, so a real one would have waited for ever (found while writing the real-person test, replaced in `2e64098`).
- NPCs were treated as standing at their timetable spot even when they had walked off to talk to someone. That left an invisible obstacle at the greeter's old post and no collision where it really stood (reported by you; fixed in `9c333fc` and `50d6c65`, with a test in `spec/people.test.ts`).
- The greeter flow took three attempts (`07b27d2`, `9c333fc`, `3a633c6`). The first two misread your description. What moved it was driving the real client in a private headless Chrome (swiftshader, scripted keys over the DevTools protocol) and reading the page text. The returning-visitor cause was only found that way, because your character is remembered between visits. The driver script was scratch and is not in the repo.
- The event log now narrates a whole sale and a visit (`45f9999`): zone changes, every notice the store sends, and a test that reads greeter, chat, order, hand-over and payment back from the table in order.
- Whether any of this was "the breakthrough", or which was: [TK]

## What did this work change about who I want to be as a software developer?

- [TK] Ritesh's own account.
- Prompts that may help: you told me "you're struggling with this" mid-session, and I had guessed at the flow twice before reproducing it. What would you do differently when a fix does not stick? Also, I twice swept your uncommitted iOS pilot files into a commit (`a494c2b`, undone in `04e3cfe` and earlier in `fa914f4`); the harness rule that came out of it is to stage by explicit file names.
- Known gaps you will be asked about: the stand-in customer never buys (so no stock is held for someone who left); an order is called off after 3 minutes; the bag is carried by the runner and specialist but not yet handed to the customer; the tap-to-pay animation is the next step.

## Evidence kinds
- Repo: the commits named above; `spec/service.test.ts` (seats, stand-ins, orders, the event-log story), `spec/people.test.ts`.
- Recall only: how the greeter debugging felt, and anything about what you decided in the session. [TK]
