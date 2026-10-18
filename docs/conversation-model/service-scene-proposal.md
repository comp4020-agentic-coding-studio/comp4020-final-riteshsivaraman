---
status: draft
what: Pre-implementation design analysis for the device-service scene (G1, phone intake/diagnosis) -- the real test of whether the completed core extraction (core/engine.ts, core/npc.ts) generalises beyond two purchase scenes, or only fit phone and laptop because both are "narrow a catalogue" conversations. No code is written here.
date: 2026-10-18
source: fresh reading of src/shared/talk/core/{engine,npc,types}.ts and src/shared/talk/scene.ts as they stand after phase 2 step 3, docs/conversation-model/{conversation-types,decisions,engine-reference,new-scene-playbook,core-extraction-proposal}.md, SCOPE.md's S8 and docs/customer-journeys.md's T4 transcript. Claude's analysis; the honesty bar matches core-extraction-proposal.md's phase 1.
---

# Device-service scene: does the core hold, bend, or break?

**Headline verdict: bends, in one real place, and the bend is bigger than the four hooks
step 2 needed for laptop.** The question-bank fold (`core/engine.ts` step 1: `derive`,
`askable`, `gain`, etc.) holds cleanly -- it never assumed "product," only "pool of things
narrowed by constraints." But `core/types.ts`'s `Pending`/`StaffAct`/`CustomerAction`/`Ended`
and `core/npc.ts`'s `staffMove` weighting are not generic at all today -- they are the
*phone-and-laptop-shaped* vocabulary (`offer_demo`, `demo`, `recommend`, `reconfirm`, `pick`,
`confirm`, `{how: "bought"}`) wearing a `core/` address. That's not a bug in steps 1-3 -- phase
1's diff was only ever run against two purchase scenes, so it correctly found what those two
shared and correctly didn't guess beyond them. It just means this scene is the first real
signal that `core/types.ts` and `core/npc.ts`'s `staffMove` are scene-family-generic (true for
any "offer and narrow a catalogue" scene), not scene-shape-generic (true for any two-party
menu conversation on this engine, which was the original ambition in decisions.md's "Later
scope" section).

## 1. Walking the four checks against the real code

### a) A pool of explanations, not a catalogue -- **fits `core/engine.ts`, breaks `core/types.ts`**

`derive()`, `askable()`, `optionsFor()`, `gain()` (core/engine.ts) only ever touch
`EngineConstraints`/`EngineSceneFields`/a scene's own `Sku`/`Model` types through the
`EngineDeps` interface -- nothing in them says "purchasable." A service scene's `Sku`-equivalent
(`{fault, likelihood, repairOption}`) and `Constraints` (`{model, symptom, wetExposure,
priorRepair}`) satisfy `EngineConstraints`'s bound (`model?`, `excluded?`, `maxPrice?` -- all
optional) and `pool.ts`'s required-interface shape (`poolOf`, `rank`, `mergeConstraints`,
`mergeSignals`) with no strain. **This part of the core is genuinely pool-shape-agnostic, as
designed.**

It breaks one level up, in `core/types.ts`'s `CustomerAction` and `core/engine.ts`'s
`demoCandidates`/`nearestModels`/`eligibleRecommendations`: these assume the pool holds things
you *demo* and *pick*. A service scene's pool holds things you *learn are true* (a fault,
confirmed or ruled out by a check) -- there's no "try before you decide" and no "choose one of
several" the way a phone customer picks a SKU. The nearest service equivalent to `pick` is
"accept the diagnosis and choose an outcome," which is a different shape: one pool item
(the most-likely fault) becomes the accepted explanation, and then a *separate* small set
(fixed now / booked / sent away / replace / cannot fix / decline) is chosen from, not narrowed
by constraints at all -- it's closer to a fixed menu than a derived pool.

### b) Facts arriving from world state (a test result), not just customer answers -- **does not fit `core/types.ts`'s `Scene` shape as written; needs a real extension, not a workaround**

This is the most important finding. `core/engine.ts`'s `derive()` folds `sc.answers` (indexed by
question id, each an array of customer picks) into `Constraints`/`Signals`. There is no second
channel in `EngineSceneFields` for "a fact staff learned that didn't come from a customer pick."
G1's own sketch is explicit this fact is deterministic ("the NPC technician reads it off a fault
table," not a dice roll) -- so this isn't about adding randomness, it's about adding a *source*
of state change that isn't `applyCustomer`.

Two honest options, not a guess at which:
1. **Model "run a check" as a staff-only `QuestionDef`** whose `apply()` is called from a new
   staff act (`run_check`) rather than from a customer's picks -- `sc.answers[qid]` gets written
   by `applyStaff`, not `applyCustomer`. This is a real but small extension to
   `EngineSceneFields`/`derive()`: the fold itself doesn't care who wrote an answer, only that
   `sc.order`/`sc.answers` has one. If this works, it is a clean, generalisable mechanism
   (`core/engine.ts`'s `derive()` needs zero changes; only the turn protocol's who-can-write-
   which-answers rule needs a scene-agnostic staff-authored-answer concept added to `StaffAct`).
2. **Treat it as a wholly scene-specific side-channel** (a `testResults` field on the service
   scene's own `Scene` type, read by the service scene's own `pool.ts`, invisible to
   `core/engine.ts`). Simpler, but then `derive()`'s single fold-of-answers model is no longer
   the complete story for this scene, which would be worth saying plainly rather than quietly
   working around.

Option 1 is recommended -- it is a precise, named addition (a fact can be authored by staff, not
only answered by the customer) in the same spirit as the four real hooks the laptop scene
needed, not a speculative abstraction. But it is genuinely new core surface, which is exactly
what phase 1 predicted might happen and what both purchase scenes, being customer-answer-only,
could never have revealed.

### c) Mandatory lines with real stakes (data-loss warning before authorising) -- **does not fit the existing `forced`/`owed` shape; needs a precondition on an outcome, which doesn't exist today**

`core/types.ts`'s `Pending`/`StaffAct` has no obligation type that blocks reaching an *outcome*
on an unsaid line -- `forced` (phone/laptop) only ever forces which *question* is asked next
(a requested demo, a requested change, "I have a phone in mind"). The phone/laptop engine has no
concept of "cannot end the scene this way until X was said," because neither scene has an ending
with real-world stakes attached to a specific line (buying a phone has no warning step).

This needs a genuinely new mechanism: a boolean-ish gate on reaching the `authorise`-shaped
outcome, checked in `applyStaff`/`applyCustomer`'s ending logic, not expressible as a `forced`
next-question. Small in code (one more field on `Scene`, one more check before accepting an
outcome that can lose data), but it is new vocabulary, not a reuse of `forced`/`owed`.

### d) Richer outcomes than bought/left, including a cross-scene handoff -- **`Ended<Sku>` breaks outright; the cross-scene handoff is out of scope for the engine itself**

`core/types.ts`: `export type Ended<Sku> = { how: "bought"; sku: Sku } | { how: "left"; why:
string };`. Service's outcomes (fixed now, booked, sent away with a due date, replace the
device, cannot fix, declines) don't fit this union at all -- "bought" and "left" are not even
the right shape of distinction (service doesn't "buy" anything; several of its outcomes are
mid-process states with a due date, not terminal). `Ended` needs to become scene-supplied rather
than a shared generic -- which is a small, honest admission that this one shared type was never
actually pool-shape-generic, just purchase-shape-generic, same as the `CustomerAction` finding
in (a).

The "replace the device, carried preferences" handoff to a *new purchase-scene conversation* is
real and sketched in G1, but it is a cross-scene concern (ending one `Scene` and seeding another
scene's `Scene` with carried facts), which the current engine has no mechanism for at all --
phone/laptop's own "carried preferences" only survives a change of *model within the same
scene*, never a handoff to a different scene type. This is explicitly out of scope for a first
service-scene build: conversation-types.md section I already names "a case object that survives
hand-offs" as separate shared work, not something this engine does internally. Recommend
treating "replace -> new purchase scene" as a scene-external handoff (same category as G7's
staff radio-task protocol) for v1, not something the engine itself needs to solve.

## 2. Real data vs invented parody policy

**Can be reasonably researched, not invented:** common phone fault patterns and their
symptom-to-cause mapping are genuinely public domain knowledge (how any phone retailer or
repair shop triages "won't charge," "cracked screen," "battery drains fast," etc.) -- this is
closer to "how troubleshooting actually works" than to this specific fictional store's policy,
so it doesn't need D37-style sourcing-with-a-date the way a real product spec does, but it
should still be written down as "informed by how phone diagnostics generally work" rather than
invented from nothing, so a marker doesn't read it as fabricated technical claims about a real
product.

**Must be invented, clearly labelled parody policy (per Ritesh's standing authorization from the
laptop run):** repair pricing/quotes, turnaround times, warranty/plan eligibility windows,
loaner-device policy, activation-lock/signed-in-account handling. All already marked `[verify]`
in conversation-types.md's G1 sketch -- nothing new here, just confirming the same policy-vs-fact
split that worked for the laptop run (which, notably, never actually needed this, since the
laptop purchase scene ends before checkout). Service is the first scene that will actually
exercise invented-policy authorization for real.

## 3. Recommended v1 bank scope

Tight, proving the new shape rather than the full G2 matrix:
- **Symptom menu:** 4-5 symptoms max (won't turn on, won't charge, cracked screen, battery
  drains fast, "something else" escape hatch) -- enough to need real branching, not so many the
  fault table becomes its own research project.
- **Hard constraints:** the model (reuse the phone scene's `data.ts`/catalogue -- same devices,
  different use), the confirmed symptom, water exposure yes/no.
- **One `run_check` staff move** producing one fact (test result) per symptom branch -- this is
  the point of the exercise, so it should not be skipped or faked as a customer answer.
- **One mandatory data-loss line**, gated as a real precondition on the "authorise a repair that
  can lose data" outcome -- this is finding (c), and skipping it would mean not actually testing
  the thing that needs testing.
- **Outcomes:** fixed now, sent away (booked, with a due date), cannot fix, declines. Defer
  "replace the device" (the cross-scene handoff) to v2 -- it needs machinery (conversation-types.md
  section I's case object) this scene shouldn't block on.
- **Skip for v1:** G2's other device classes (tablet, laptop, watch, etc.) -- prove the shape
  once on phone before deciding whether "one bank per class" needs anything new per class beyond
  data.

## 4. What this means for the extraction's honest status

Findings (a) and (d) are the same root cause: `core/types.ts`'s shared vocabulary
(`CustomerAction`, `Pending`, `Ended`) was extracted from two scenes that both happen to be
*purchases*, and purchase-shaped concepts (`demo`, `pick`, `bought`) leaked into what was
labelled scene-agnostic. This isn't a failure of phase 2's diff discipline -- the diff correctly
found what two purchase scenes shared, which is necessarily broader than "any two-party menu
conversation" could ever be proven from two data points. It is exactly the caveat
`core-extraction-proposal.md` and `decisions.md` both already named plainly: *both examples are
purchase scenes; a genuinely different scene is the real test.* This document is that test
landing, and the honest result is: the question-bank fold holds completely; the turn-protocol
and NPC-loop vocabulary holds for "any scene that offers and narrows a product-like pool," which
is a real, useful, smaller claim than "any conversation on this engine" -- and device-service
needs three genuinely new things (a staff-authored fact, an outcome precondition gate, and its
own non-purchase `Ended`/`CustomerAction` shape) to fit.

**Recommendation:** proceed to build the service scene as a new scene type with its own
`CustomerAction`/`Pending`/`Ended` (not forced into the purchase-shaped ones), reusing
`core/engine.ts`'s step-1 fold wholesale (it already fits), evaluating case-by-case whether
`core/engine.ts`'s step-2 pieces (`validatePicks`, `hintText`) and `core/npc.ts`'s
`runConversation`/`randomStaff`/`tone()` still apply once the new `StaffAct`/`Pending` shapes
exist (likely yes for `runConversation`'s generic loop-until-ended shape; likely no for
`staffMove`'s weight table, which is keyed to the purchase-specific act names and would need its
own service-scene weighting, the same way `customerMove`/`compatible`/`consistent` already stay
scene-owned for persona reasons). Do not retrofit `core/types.ts` to cover both families
speculatively before building this scene for real -- that would be guessing a bigger
abstraction from three data points instead of two, the identical mistake this whole exercise
exists to avoid.
