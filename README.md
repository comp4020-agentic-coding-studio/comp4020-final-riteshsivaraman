<!--
SCAFFOLD, not finished prose. Claude drafted the structure, the fact lists and the [TK]
markers on 2026-10-17. Ritesh writes the paragraphs (CLAUDE.md, "Ritesh writes the prose").
Delete this comment when the prose is his. Target 400 to 600 words, published at /readme/.
Facts below come from SCOPE.md (section named in brackets) unless marked otherwise.
-->

# [TK store name]

[TK one or two sentences, Ritesh's words: what this is.]

Facts to build it from:
- An obvious parody of a famous fruit-themed retail store, as a shared first-person 3D shop. [SCOPE intro, D6]
- Real visitors and CPU players share one room; the Genius Bar queue is the shared state. [SCOPE 0, D2, D3]
- Brand name is still `[TK]`.

## What good means here

[TK Ritesh: a first answer to "is it any good?". The three questions from the week 8 lecture are function, quality of execution, and differentiation from the median.]

**Function.**
- [TK who is this for. SCOPE 0b gives the direction but not a person. The earlier attempt to answer this described the company's culture, not a person, so it stayed `[TK]`.]
- Direction in Ritesh's words (SCOPE 0b, 2026-10-10): each part of a store visit is simulated end to end, so you feel both the satisfaction and the frustration of a real visit.
- Satisfaction he named: wanting a flagship phone, seeing colours, storage and memory options, being asked about other products, swiping a card, being handed a bag.
- Frustration he named: a problem not resolved, a colour or configuration out of stock, a price out of budget, long waits.

**Quality of execution.**
- [TK how it should feel, and what a visitor should notice first versus later. The calm hotel-lobby intent against the lived queue is in `CLAUDE.md`; say it in your own words.]

**Differentiation from the median.**
- [TK what a generic "multi-user, real-time 3D shop" would be, and what this does instead.]

## How it works

Facts only (SCOPE 3, 3b to 3d, 5):
- Visitors choose customer or an employee kind, and customise a character. [D34]
- Stock is finite and shared, so two visitors can race for the last unit. [SCOPE 0b]
- CPU players and staff take real slots and queue positions, and are labelled as CPUs. [Tier 1 item 7, section 5]
- Humans win over CPUs for slots, devices and capacity. [section 5]
- Conversations are menu-driven. [D9]
- [TK confirm which of these are built and live today before this goes out. `WORKLOG.md` is the place to check.]

## What is enforced and what is judged

Enforced in `spec/` (see the test files for the exact rules):
- [TK list the rules that have a check today, one line each, for example the back room being staff-only, an out-of-stock configuration being unbuyable, the occupancy cap.]

Judged by me, because no automated check can tell:
- [TK whether the wait feels frustrating and the room feels calm and crowded.]
- [TK how you judged it: `CLAUDE.md` says two browser profiles, as two different visitors, at 1920x1080 and 390x844. Say what you actually did and when.]

## What I read

Sources behind the definition (the files hold what each is, and `references/README.md` says how far to trust them):
- Visitor accounts of real store visits: `references/accounts.md`.
- Commentary on the store's design intent: `references/experience.md`.
- Two satirical reels: `references/reels.md`.
- The final project brief's notes on what good means at small scale, and the week 8 lecture's three questions.
- [TK add what you read on small-web or small-scale software. The brief asks you to cite some.]
- Decisions are recorded as architecture decision records in `docs/adr/` (Nygard's format).

## What I chose not to build

SCOPE Tier 3 (2026-10-10) lists what is cut from this submission: baskets, purchases, payments, refunds, repair flows, product comparison, user accounts, chat between visitors, voice, more than one store, multiple floors, rigged human characters, VR, native mobile, any paid API.
- [TK say in your own words which of these matter most and why. Check each against what is actually cut; `CUTS.md` has none for the store yet.]

## Status

- Live at [TK confirm the URL and whether it serves the store]. The Fly app is `comp4020-final-riteshsivaraman`.
- [TK what is built today, from `WORKLOG.md`.]
