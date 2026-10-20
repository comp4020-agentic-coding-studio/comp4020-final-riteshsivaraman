---
status: skeleton
what: Fact list for rewriting PROCESS.md at crit 11 (target 900 to 1100 words, it is 382 now). Facts, commits and [TK] only; the prose is Ritesh's.
date: 2026-10-21
source: the commit log from 2026-10-19 to 2026-10-21 and the tests named; checked against `git log`. Where something is only Ritesh's recall it says so.
---

# PROCESS.md facts for crit 11

Moments new since crit 9 (the blueprint, character-tool and seven-transcripts moments are already in PROCESS.md). For each: what was the obvious thing, what was done instead, how you knew it helped. Fill the [TK]s yourself.

1. **A real specialist runs the same conversation as an NPC.** Obvious: keep the old reply menu for humans. Instead the engine's own legal moves are listed for the person, with its hint about how far each narrows the phones (`1464b5a`). Evidence it helped: a live two-socket test (`spec/conversations-live.test.ts`). Your reason for choosing this: [TK]
2. **Seats as a limited resource.** The query filtered to NPC chats, so a real pair held no table. Fixed with a test that seats a real pair (`8c6ef38`). How it was found: you saw someone take your seat. Recall vs repo: the report is your recall; the fix is repo.
3. **Collision tied to where NPCs really are.** NPC positions came from the timetable only, so a ghost stood at the greeter's old post (`9c333fc`, `50d6c65`). Found by you. Guarded by `spec/people.test.ts`.
4. **The greeter, three attempts.** Two wrong readings of your description, then reproduced in a headless Chrome driven by script and fixed (`07b27d2`, `9c333fc`, `3a633c6`). What you did instead of the obvious: you re-explained the intended flow in your own words and stopped me guessing. [TK] how you decided to do that.
5. **A sale that outlives the chat.** Your design: chat ends, a runner brings the phone in a logo bag to the specialist, who finds the customer and pays (`2e64098`). Open choices you made: 3-minute cancel with a message, a one-line exchange at the hand-over, a banner for the waiting customer. Combinations tested: NPC and real specialist; a real customer only (the stand-in never buys).
6. **Logs that narrate.** Zone changes, notices and a whole-sale test (`45f9999`), on top of the stdout line from `a60962b`. Could you narrate a visit from `flyctl logs` alone? Not yet tried on Fly: [TK]

Honest slips to mention if asked: two commits swept in your uncommitted iOS pilot files (`a494c2b`, earlier `fa914f4`); both were undone, and the rule is to stage by file name. One earlier `git commit --amend`, disclosed at the time.

Not claimed anywhere above: the deployed app has not been rehearsed on Fly since these changes. [TK]
