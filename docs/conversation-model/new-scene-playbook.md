---
status: draft
what: Recipe for building the next conversation scene on this system, what is phone-specific versus generic today, and the pitfalls already paid for. Compact first version.
date: 2026-10-18
source: the phone-scene build (see how-we-built-it.md); the laptop port that first tested the generalisation claim and found it hadn't landed; then a real core extraction, done in three checked-in steps with Ritesh reviewing each before the next began (phase 2 steps 1 to 3, all landed -- docs/conversation-model/core-extraction-proposal.md). Claude's account.
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

## Generic today vs phone-specific (final account, phase 2 steps 1 to 3 complete)

The first attempt did the scene-definition refactor *while* porting laptop in one unsupervised
overnight pass; the extraction didn't happen (only `core/rng.ts` and `core/types.ts`'s original
contents were genuinely pulled out, and laptop was ported by near-verbatim copy-paste). The fix
was process, not more code: a short, reviewed design doc first
(`core-extraction-proposal.md`, phase 1 -- no code, a real line-by-line diff of what the two
scenes actually shared), then the extraction itself in three small steps, each checked in with
Ritesh before the next began, each re-diffing the real code fresh rather than trusting the
proposal's pre-implementation guesses. All three have landed; what follows is what's actually
true of the code today, and should be read as settled, not provisional.

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
  - `core/npc.ts`, step 3: `staffMove`, `runConversation`, `randomStaff`, the `tone()` helper and
    `pickN()` -- byte-identical between the two scenes' NPC loops, re-diffed fresh rather than
    trusted from phase 1's sketch. Each scene's `npc.ts` is now a thin wrapper passing its own
    `customerMove`, `questionById` and question-id literals in as arguments.
- **Deliberately left duplicated, as a real exception, not a shortcut:** `staffActs`,
  `applyStaff`, `customerMenu`, `applyCustomer` themselves, because their `confirm`/`reconfirm`/
  `keepPreferences` branches depend on more than phase 1's guessed "which axes vary" hook could
  honestly cover -- a laptop's extra memory axis means different *option ids* exist at
  confirm-time (a `memory` change phone never offers), not just a different answer to a yes/no
  check. Turning this into a hook now would mean inventing 5-6 more callbacks from only two data
  points, which is the same mistake ("a rule that fits the examples but not the data") the first
  attempt made at a larger scale. Left scene-owned on purpose, with the reasoning written down in
  `core/engine.ts`'s comments. **Settled by the device-service scene:** service has no
  `confirm`/`reconfirm`-shaped moment at all -- there's no "resolved pool of one" to reconfirm the
  way a purchase does -- so this cluster stays scene-owned by default rather than the third data
  point revealing a missing hook, which is itself useful confirmation that phase 1's worry (forcing
  a hook from only two examples) was the right thing to worry about rather than premature caution.
- **Step 3 found the same shape of exception inside the NPC loop:** `compatible`, `consistent`,
  `answerQuestion` and `customerMove` each read a `Sku`/`Constraints`/tier field whose shape
  differs per scene (phone's `storage`/`screen`/`foldable` vs laptop's `memoryGb`/`storageGb`/
  `family`/`maxWeightG`), tied to `Persona.target`'s differing shape -- this is almost entirely
  persona/goal-matching, which is scene content, not loop mechanics, so it stayed scene-owned for
  the same reason as the confirm cluster above. `randomPersona` is entirely scene-specific content
  (signal lists, impossible-persona archetypes, want shapes), also correctly scene-owned.
- **Genuinely scene-specific, as expected, not part of the plan to share:** `data.ts` (the sourced
  catalogue and its schema), the attributes and ranking logic in `pool.ts`, every question in
  `bank.ts`, the facts and phrasing in `lines.ts`, and the persona/goal-matching half of `npc.ts`
  described above.
- **What made all three steps land differently from the first attempt:** stopping to design before
  coding (phase 1), then stopping again mid-step whenever a cluster turned out deeper than planned
  (confirm/reconfirm in step 2, persona/goal-matching in step 3), to ask whether to force a hook or
  leave it scene-owned, rather than guessing silently and writing it up afterwards as if it had
  been the plan all along. The honest answer to "did the framework generalise": yes, for the turn
  protocol, the question-bank machinery and the NPC loop mechanics -- roughly the majority of each
  scene's engine code by line count -- and no, for the pool/catalogue/wording/persona content,
  which is exactly the part that is supposed to differ per scene. Verified behaviour-preserving at
  every step: all 140 specs plus an ad hoc 2000-seed simulation per scene, unchanged before and
  after.

## The device-service scene: the real test of the extraction above

Phone and laptop are both "narrow a catalogue" scenes, so the extraction above could only ever
prove the core is purchase-family-generic, not pool-shape-generic -- `service-scene-proposal.md`
said this plainly before any service code existed, and building it confirmed the prediction: the
question-bank fold (`core/engine.ts` step 1) held with zero changes against a pool of fault
explanations instead of products, but `core/types.ts`'s `Pending`/`StaffAct`/`CustomerAction`/
`Ended` and `core/npc.ts`'s `staffMove` turned out to be purchase-shaped after all (`demo`, `pick`,
`recommend`, `{how:"bought"}` baked in) -- service defines its own small versions instead of
forcing a fit. Two new mechanisms came out of this, one needing zero core changes (a staff-authored
fact -- `run_check` writes into `sc.answers` the same channel a customer answer uses) and one
genuinely new (a precondition gate on an *outcome*, not just the next question -- `forced`/`owed`
had nothing to generalise, since neither purchase scene has an ending with a real-world stake).
Full account, with the exact functions and the one real bug found: `engine-reference.md` section
11. The method that produced this -- a design doc before code, re-verifying the design's guesses
against real code rather than trusting them -- is the same one steps 1-3 used, applied one level up
(validating the *shared core*, not just building on it).

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
