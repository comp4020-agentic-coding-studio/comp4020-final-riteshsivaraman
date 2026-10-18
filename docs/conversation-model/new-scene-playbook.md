---
status: draft
what: Recipe for building the next conversation scene on this system, what is phone-specific versus generic today, and the pitfalls already paid for. Compact first version.
date: 2026-10-18
source: the phone-scene build (see how-we-built-it.md); the laptop port that first tested the generalisation claim and found it hadn't landed; then a real core extraction, done in two checked-in steps with Ritesh reviewing each before the next began (phase 2 steps 1 and 2 -- docs/conversation-model/core-extraction-proposal.md). Claude's account.
---

# Playbook: building the next scene

## Recipe (the order that worked)
1. **Define the scene:** the two roles, the goal, the possible outcomes (including "leaves"), what it hands off to, and what is out of scope. Write it into `decisions.md` as Ritesh's words, dated.
2. **Name the pool.** What is the set of candidates the conversation narrows? Phones: model x storage x colour. Service: candidate faults or repair options. Staff fetch: candidate items or locations. Hard constraints shrink it; soft signals only re-rank it.
3. **Source the data** (D37): fetched, dated, `null` for not stated. Nothing a character says may go beyond a field.
4. **Mockup and numbered questions with defaults** to Ritesh before any code.
5. **Scenarios:** one agent designs about 16 customer briefs with computed feasibility (prompt B in `prompts.md`). They become NPC personas and regression tests.
6. **Sample transcripts** (prompt C), one agent per batch, until a round adds almost no new question types.
7. **Bank:** each question has preconditions, options generated from the pool, and effects.
8. **Engine:** reuse the turn protocol, `derive` as a fold, obligations (`forced`, `owed`), NPC loop (see `engine-reference.md`).
9. **Replays** of the transcripts (prompt D), **seeded simulation** with the invariants in `spec/talk-sim.test.ts`, **wording specs** like `spec/talk-lines.test.ts`.
10. **Play it, paste transcripts, fix with a spec each.** Then the **review loop** (`scripts/talk-transcripts.ts` plus prompt E on fresh seeds, spot-check before acting).

## Generic today vs phone-specific (updated through phase 2 step 2)

The first attempt did the scene-definition refactor *while* porting laptop in one unsupervised
overnight pass; the extraction didn't happen (only `core/rng.ts` and `core/types.ts`'s original
contents were genuinely pulled out, and laptop was ported by near-verbatim copy-paste). The fix
was process, not more code: a short, reviewed design doc first
(`core-extraction-proposal.md`, phase 1 -- no code, a real line-by-line diff of what the two
scenes actually shared), then the extraction itself in small steps, each checked in with Ritesh
before the next began. Two steps have landed this way; what follows is what's actually true of
the code today.

- **Actually extracted into `core/` and reused by both scenes:**
  - `core/rng.ts` (seeded generator), `core/types.ts` (`Tone`, `Role`, `Option`, `Answer`, the
    tone-to-expression map, and -- added in step 2, once the diff showed them byte-identical --
    `Pending`, `StaffAct`, `CustomerAction`, `CustomerReply`, `Snapshot`, `Line`, and `Ended<Sku>`).
  - `core/engine.ts`, step 1: `derive`, `withoutAnswer`, `rowsIf`, `optionsFor`, `askable`,
    `reopenable`, `gain` -- the question-bank fold, one body each, generic over a small
    `EngineDeps` interface.
  - `core/engine.ts`, step 2: `demoCandidates`, `relaxMoves`, `hintText`, `validatePicks`,
    `nearestModels`, `eligibleRecommendations` -- the turn-protocol pieces that turned out to be
    pure rules with no scene-specific branch inside them. Each scene's `scene.ts` now calls these
    instead of reimplementing them.
- **Deliberately left duplicated, as a real exception, not a shortcut:** `staffActs`,
  `applyStaff`, `customerMenu`, `applyCustomer` themselves, because their `confirm`/`reconfirm`/
  `keepPreferences` branches depend on more than phase 1's guessed "which axes vary" hook could
  honestly cover -- a laptop's extra memory axis means different *option ids* exist at
  confirm-time (a `memory` change phone never offers), not just a different answer to a yes/no
  check. Turning this into a hook now would mean inventing 5-6 more callbacks from only two data
  points, which is the same mistake ("a rule that fits the examples but not the data") the first
  attempt made at a larger scale. Left scene-owned on purpose, with the reasoning written down in
  `core/engine.ts`'s comments, so a real third scene can settle whether this needs a hook or is
  just always scene work.
- **Still fully duplicated, not yet attempted:** the NPC loop shape (`npc.ts`'s `customerMove`/
  `staffMove`/`runConversation`) -- step 3, not yet done.
- **Genuinely scene-specific, as expected, not part of the plan to share:** `data.ts` (the sourced
  catalogue and its schema), the attributes in `pool.ts`, every question in `bank.ts`, the facts
  and phrasing in `lines.ts`.
- **What made step 2 land differently from the first attempt:** stopping to design before coding
  (phase 1), then stopping again mid-step-2 when the confirm/reconfirm cluster turned out deeper
  than planned, to ask whether to force a hook or leave it scene-owned, rather than guessing
  silently and writing it up afterwards as if it had been the plan all along.

## Pitfalls already paid for (details: how-we-built-it.md section 7)
- Two correct rules interacting (test pairs of features, not each alone).
- A fact held in two places (derive everything from the answers).
- Wording glued from independent parts (lead-in plus built-in acknowledgement; tone plus label).
- A claim scoped to the wrong set (say what the comparison was).
- An invented fact (check every number and "closest/best/only" against data).
- A rule that fits the examples but not the data (golden tests).
- A phone left by elimination treated as chosen (require acceptance).
- A thrown-back question overwritten by another (obligations are a list).
- Reviewer noise (spot-check; fresh seeds each pass).

## Definition of done for a scene
Specs green; replays of its transcripts pass or are logged in a findings file; 400-run simulation invariants hold; two review passes on fresh seeds with the real findings fixed; Ritesh has played both sides; wording reviewed by him; then the ADR and wiring (event log row per state change).
