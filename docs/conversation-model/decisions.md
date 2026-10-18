---
status: draft
what: Settled design decisions for the new conversation model (phone-specialist POC), from Ritesh's description and answers, 2026-10-17. Not an ADR; the ADR waits until the POC is approved.
date: 2026-10-17
source: Ritesh, this session (description, then answers 1 to 8 to the grilling questions). Claude's wording; check before it goes anywhere formal.
---

# Conversation model: settled so far

## Shape
- A conversation has exactly two parties: customer-customer (rare), customer-staff (most common, most complex), staff-staff (fairly common).
- Each kind has **subtypes** (greeting, phone specialist, billing, repair/genius, backroom, ...), each with its own model, a context set before it starts, and a goal.
- Phone specialist goal: narrow to a specific device (model + storage + colour), or the customer decides they want no device. Choosing a device ends the scene; a new conversation starts with whoever handles payment, or a new shopping goal.
- This POC is one subtype (buy a phone), about 5% of the whole. The point is the **system**, which later subtypes reuse.

## Turn model
- Every turn each side picks from a **menu**. No free text anywhere (it can't be tied to preconditions and effects). Customer throw-backs ("I'd want a Max") are menu items too.
- Staff pick a question from a bank, non-linearly. Asked questions grey out but can be reopened ("you said 1200-1500, still right?"); the customer may change the answer.
- Customer answers a multiple-choice question (often with "Not sure"; some questions allow several answers) and may also throw one back.
- Every line can carry an optional **tone** (friendly, apathetic, annoyed, ...). Tone slightly changes the NPC's behaviour and tendency to leave. The customer can always end the conversation, in any tone.
- Don't ask what you don't have to: start with "did you already have a phone in mind?". A customer can pick a device directly at any time, to demo it or finalise it.
- At 4 devices or fewer, staff can offer demos. Staff highlight the device's features during a demo; afterwards: choose it, demo another, or reopen questions.
- Questions narrow to device + storage + colour (storage moves price). Demos are by model only: the demo unit has no specific storage and may not be the customer's colour ("this demo is red, we have yours in stock").
- If the customer's requirements leave no device, staff nudge them to widen their preferences.

## Question bank
- Each question has **preconditions** and **effects** on a shared fact state and the candidate pool. This is how the bank is kept consistent and how devs find gaps. Staff see the live pool size and how much each question would narrow it.
- Bank is built by a loop of subagents generating sample conversations (3 per round) over real, sourced device data, until a round adds no new question type.

## Ranking and soft signals (added 2026-10-17)
- Hard filters define the feasible set; soft signals (e.g. use case) score it into a **ranking**. The ranking drives recommendation order, demo feature highlights and the near-miss list when nothing fits. The customer never sees the ranking; staff only.
- Attribute data has three states: yes, no, not stated. A filter never eliminates on "not stated".
- Tones: four. Wordings per tone are generated offline, reviewed and stored, never produced at runtime. Any line must derive from state and data.
- Throw-backs are parameterised menu items (compare, attribute query) resolved by the system.

## Later scope (keep in mind, not now)
- Every conversation type between any two parties in the store will need its own model on this same engine (laptop, repair, billing, backroom, staff-staff, customer-customer, ...). Keep the engine generic: scene type = roles, goal, move bank with preconditions and effects, fact state.

- Staff internal handoff (Ritesh, 2026-10-17): staff need a way to pass work to each other, e.g. "John will be with you in a moment", or handing a device to a technician and reporting back when done. This is a separate system from conversations: a quick one-way message that assigns a task (radio-style), not a back-and-forth. Separate task later.
- Billing is a different scene, likely handled by another staff member, so the phone scene ends at model + storage + colour. Trade-in, accessories, care plans and payment belong to it.

## Tone is a facial expression (Ritesh, 2026-10-17)
- In the real store each tone shows on the speaker's face. The engine stamps every line with an `expression` from the character's own set: friendly = smile, neutral = neutral, impatient = focused, unsure = worried (`TONE_EXPRESSION`, `src/shared/talk/types.ts`). There is no "annoyed" face yet; adding one is graphics' call.
- The customer's menu says the move; the character says the line (never the menu text), same as the staff side.

## Preferences, demos and naming (Ritesh, 2026-10-17)
- A preference survives a change of model. Colour stays; an exact storage tier becomes a floor ("512GB" so "at least 512GB"). A wish the next phone cannot meet goes through the empty-pool nudge, not silently away.
- Carried wishes are reconfirmed: after a change of model, staff can check them ("Earlier you mentioned Black and at least 512GB. Is that still what you want?"); the customer keeps them, or changes the colour or the storage (which is then asked afresh). It is a staff move with a high NPC weight, not forced, so a human specialist can skip it.
- After a demo they did not like there are two distinct options: **another one you offered** (a demo of one of the other offered phones; hidden when none is left) and **ask about other phones** (the shown phone is set aside and staff go back to asking questions before offering a demo or a recommendation).
- Once a phone has been named by either side, staff do not introduce it again: they say "it" (the final summary still names it).

- A phone the customer turned down is never offered again by staff, but the customer can always ask about it ("ask about the X again" gets the facts) or ask to see it or go with it, which brings it back (Ritesh, 2026-10-17).
- Foldable: it is never suggested to someone who has not said whether they are open to one, and is introduced as a folding phone when shown.

## NPCs
- NPCs loop on quasi-random but sensible choices: pick questions that genuinely narrow, offer demos with higher probability as the pool shrinks, reopen with low probability unless forced (contradiction or empty pool).
- A customer NPC has a hidden goal (target device, must-haves, budget) and never gives conflicting answers.

## POC
- Plain HTML chat-style page. Play as customer or staff against an NPC, or open two tabs as two humans (BroadcastChannel, throwaway). The real app needs real transport later.
- Replaces the current engine (`scripts/sim/`, `src/shared/conversation.ts`'s phones script, ADR 6's slot engine). ADR comes after Ritesh approves the POC.

## Success test
- Coverage: for every reachable pool, at least one askable question still narrows it. Report fact combinations that leave no device.

## Overnight run: laptop scene (Claude, 2026-10-18, under Ritesh's standing authorization)

Ritesh asked Claude to check the conversation-model framework for consistency, then (via
AskUserQuestion, since the framework's own rules required pausing on several open design
questions before building) gave three answers that authorized this run:

1. **Scope:** "Extract generic core + port one scene" -- extract the engine's scene-definition
   abstraction *while* porting a real second scene (laptop), per conversation-types.md's own
   build-order recommendation and new-scene-playbook.md's "Proposed refactor" section, rather than
   designing a generic core speculatively or building a second scene without attempting the
   extraction at all.
2. **Policy data:** "Invent clearly-labelled parody policy" where a scene genuinely needs an
   invented fact (trade-in, care plan, return window, etc.), rather than leaving such scenes
   blocked on real-world sourcing, since this is a fictional store (D6).
3. **Next scene:** "Laptop purchase (G3)" -- conversation-types.md's own recommendation, since it
   shares the phone scene's pool shape (model x memory x storage x colour) and was expected to be
   the clearest test of whether the engine generalises.

**What actually happened, plainly:** the laptop scene (point 3) was built and tested --
`src/shared/talk/scenes/laptop/`, sourced data (`laptops.json`, preconfigured SKUs only),
140 talk specs total (up from 106), a 400-seed simulation in the test suite plus an ad hoc
2000-seed spot check, both clean. Parody policy (point 2) never actually came up: like the phone
scene, the laptop purchase scene ends at model/memory/storage/colour and never touches
checkout, trade-in or care plans, so nothing needed inventing.

**Point 1 -- the generic-core extraction -- did not fully land.** Only `core/rng.ts` and
`core/types.ts` were actually pulled into a shared location; the turn protocol, `derive()` and its
helpers, and the NPC loop shape are duplicated between the phone and laptop scene files, not
extracted into a shared `core/engine.ts`. Porting laptop by direct duplication did confirm these
shapes are identical across two real scenes (useful evidence that the abstraction is sound), but
that confirmation is not the extraction itself. This is recorded honestly in
new-scene-playbook.md's updated "Generic today vs phone-specific" section and in README.md's
status table, rather than claimed as done. The real extraction, a scene-definition object with the
engine generic over it, remains a decision for Ritesh: whether to do it now (against two real
scenes instead of one, lower-risk than before) or after a third scene.

Also found and fixed in the process (the kind of thing CLAUDE.md's defect loop exists to catch):
two engine bugs where a model's preconfigured tiers varied on an axis no bank question could
resolve (a missing `memory_tier_for_model` question for the 16-inch M5 Max's two memory tiers,
fixed; the nano-texture display finish, scoped out rather than given its own question), one
precondition bug (`performance_pref` asked before the customer had shown they cared, unlike the
phone scene's matching telephoto/battery questions), and one wording bug ("a M5 chip" instead of
"an M5 chip", found by hand-spot-checking generated transcripts).

**Not done, by the playbook's own "Definition of done for a scene":** an automated reviewer pass
on fresh seeds (only hand spot-checks were done), Ritesh playing either side, his review of the
wording, and the real core extraction above. These are named, not silently skipped.

## Prior-art check before continuing the core extraction (Ritesh and Claude, 2026-10-18)

Before committing more build time to the generic core, Ritesh asked (half-joking, comparing the
engine to Akinator) whether an existing tool or framework already does what this engine does, so a
subagent researched it rather than assuming either "obviously nothing exists" or "we're
reinventing something standard". Full report in `LEARNINGS.md`'s matching entry; summary here
because it bears on whether the extraction (and the engine design generally) is worth continuing
as designed.

**Finding:** no single existing library combines hard-constraint elimination over a typed
candidate pool, soft-signal reranking, a precondition/effect question bank, and turn-based
menu-driven dialogue with weighted-random NPC move selection on both sides. Akinator itself is a
weaker analogue than its reputation suggests -- publicly-documented reverse-engineering
(Vié-Guerra et al., arXiv:2301.08718) argues it is Bayesian soft-scoring over a crowd-sourced
answer database with no real hard-elimination step, so it only overlaps with this engine's
soft-signal half, not the hard-constraint half. Each half of this design does map to a named,
citable technique: question-ordering-by-narrowing-power is expected-information-gain /
minimum-entropy question selection from 20-questions theory (Jedynak-style sequential Bayesian
search, arXiv:1306.1922), and hard elimination over a typed pool is standard CSP-based
product-configurator design (arXiv:1108.5586 and the configurator-CSP literature). The specific
combination -- adaptively narrowing a candidate pool conversationally -- is a named research area,
constraint-based conversational recommender systems, surveyed in arXiv:2101.09459. Rasa's
slot-filling plus tracker-as-event-log is the closest shipped framework to the turn/state
structure, but its policy is ML-learned from training stories, not an authored precondition/effect
bank, so it is a point of comparison, not something that should have been used instead.

**Decision:** continue the engine and the core extraction as designed. This is not "nothing
compares, so anything goes" -- it is specific evidence that both halves of the design are
individually the textbook-correct technique for what they do, and that the gap (nobody has
packaged this particular combination as a reusable two-party, menu-driven, NPC-playable
conversation engine) is a real gap, not a sign of having missed an obvious existing tool. Citable
in PROCESS.md's stack-case section if a "why build this instead of using X" question comes up at a
crit.

## Core extraction closed out: all three steps landed (Claude, 2026-10-18, under Ritesh's standing authorization)

Ritesh approved step 3 (`npc.ts`) after reviewing steps 1 and 2 directly in VS Code. This closes
the three-step plan from `core-extraction-proposal.md`.

**What step 3 found, re-diffing fresh rather than trusting the phase-1 sketch:** `staffMove`,
`runConversation`, `randomStaff`, the `tone()` helper and `pickN()` were byte-identical between the
phone and laptop scenes' `npc.ts` and now have exactly one body each in `core/npc.ts`. `compatible`,
`consistent`, `answerQuestion` and `customerMove` were NOT moved -- each reads a `Sku`/
`Constraints`/tier field whose shape differs per scene (phone's `storage`/`screen`/`foldable` vs
laptop's `memoryGb`/`storageGb`/`family`/`maxWeightG`), tied to `Persona.target`'s differing shape.
This is the same restraint applied in step 2 to `confirm`/`reconfirm`/`keepPreferences`: the right
call was to leave it scene-owned, documented, rather than invent a hook from two data points.
`randomPersona` is entirely scene content and was never a candidate for extraction.

**The honest answer to the original question ("did the framework actually generalise"):** yes, for
the turn protocol (`core/engine.ts`'s step-2 functions and `staffActs`/`applyStaff`/`customerMenu`/
`applyCustomer`'s shared majority), the question-bank machinery (`core/engine.ts`'s step-1
functions), and the NPC loop mechanics (`core/npc.ts`) -- together the large majority of each
scene's engine code by line count. No, for the pool/catalogue content, the actual questions, the
wording, and the persona/goal-matching half of the NPC loop -- which is exactly the part that is
*supposed* to differ per scene, not a gap in the extraction. `core/` now totals 698 lines
(`engine.ts` 408, `npc.ts` 156, `types.ts` 105, `rng.ts` 29); the phone scene's own files total
1,915 lines and the laptop scene's 1,783, each shrunk by its thin wrappers replacing full
duplicated bodies.

**Verified behaviour-preserving at every step, not just claimed:** all 140 specs pass unchanged
after each of the three steps; full-repo `pnpm typecheck` clean; both transcript generators
(`scripts/talk-transcripts.ts`, `scripts/talk-laptop-transcripts.ts`) still run; an ad hoc 2000-seed
NPC-vs-NPC simulation on each scene after step 3 shows 0 stuck conversations and the same ~80% sell
rate as before the extraction began.

**What remains for a real third test of genericity:** both scenes diffed here are purchase scenes
(catalogue + pool narrowing), so the hooks and the "what stays scene-owned" boundary above were
found from exactly two data points, both shaped the same way. A genuinely different scene --
device-service (G1 in conversation-types.md): a pool of candidate fault *explanations*, not
products, with facts arriving from world state (a test result) rather than only customer answers --
is the real test of whether `core/engine.ts` and `core/npc.ts`'s current shape holds, or needs a
new hook neither purchase scene revealed a need for. That is the next decision for Ritesh, not
assumed here.

## Device-service scene (G1) built: the real test of the core extraction (Claude, 2026-10-18, under Ritesh's standing authorization)

Ritesh reviewed and approved `service-scene-proposal.md` (phase 1, no code) before any of this was
built, same checkpoint discipline as the core extraction -- read the full proposal first, let him
review the design before writing a line, then build in checked-in steps rather than one
unsupervised pass. Two steps: first, two small core-type changes needed to even attempt the scene
(`Ended<Sku>` made generic over an outcome type), verified not to touch phone/laptop behaviour;
second, re-verifying the proposal's predictions against the real post-step-1 code (found the core
needed LESS change than the proposal guessed -- `core/engine.ts`'s fold never required a scene to
use the purchase-shaped `Pending`/`StaffAct`/`CustomerAction`/`Ended` at all, so a scene can simply
define its own instead of needing a core change); then the actual scene build.

**What got built:** `src/shared/talk/scenes/service/` -- phone-only intake/diagnosis, v1 scope
(approved): 4 symptoms, one deterministic `run_check` staff move, one mandatory data-loss gate
built as a real blocking precondition (not a decorative line), outcomes fixed-now/booked/cannot-fix/
declines/left. Explicitly deferred: the "replace the device" cross-scene handoff (needs the case
object conversation-types.md section I names as separate shared work), G2's other device classes,
any pricing beyond `[TK]`-labelled invented placeholder.

**The answer to "did the core actually generalise" (engine-reference.md section 11 has the full
account):** the question-bank fold (`core/engine.ts` step 1) is proven pool-shape-generic -- it held
with zero changes against a pool of fault explanations, a genuinely different shape from a product
catalogue. `core/types.ts`'s `Pending`/`StaffAct`/`CustomerAction`/`Ended` and `core/npc.ts`'s
`staffMove` are NOT pool-shape-generic -- they are purchase-family vocabulary that happened to look
shared when only two purchase scenes existed to diff. Service defines its own small versions rather
than forcing a fit, which the proposal recommended and building it confirmed was the right call.

**Two new mechanisms, one free, one genuinely new:** a staff-authored fact (the `run_check` move's
test result) needed zero core changes -- it writes into `sc.answers` the same channel a customer
answer uses, since `derive()` never asked who wrote an answer, only whether one exists. A
precondition gate on reaching an *outcome* (not just the next question) is genuinely new: neither
purchase scene has an ending with a real-world stake attached to a specific line, so `forced`/`owed`
had nothing to generalise from. Built scene-local, verified failing-first (the gate was deliberately
removed, the relevant specs went red for the right reason, then it was restored) -- the same defect-
loop discipline CLAUDE.md asks for applied to a new mechanism, not a regression.

**One real bug, not predicted by the proposal:** `symptom` needed to be a `"route"` question, not
`"hard"` -- `core/engine.ts`'s `optionsFor` only offers a hard option when it strictly narrows an
already non-empty pool, true for phone/laptop (catalogue starts full) but not for service, whose
pool starts empty until a symptom is given. Found by a failing smoke run, fixed, not guessed.

**Verified, not just claimed:** 22 new specs (162 total), including a 500-seed NPC-vs-NPC
simulation with the gate checked directly against engine state for every seed, plus a dedicated
mutation-check test proving that check would actually catch the gate broken. Full-repo typecheck
clean. A 20-seed transcript spot-check read sensibly, with the gate firing exactly where expected.

**Not done, by the playbook's own "Definition of done for a scene":** an automated reviewer pass,
Ritesh playing either side, his review of the wording (heavier placeholder than phone/laptop's,
since v1's point was the mechanism), the real-vs-invented policy split (data.ts keeps this explicit
per field, but none of it has been reviewed by Ritesh yet).

**What this means for the next scene:** the core's real boundary is now settled by evidence rather
than guessed from two data points -- `core/engine.ts`'s fold is the genuinely shared part; the
vocabulary in `core/types.ts`/`core/npc.ts` is purchase-family only, and a new scene outside that
family (like this one) should expect to define its own `Pending`/`StaffAct`/`staffMove` rather than
trying to fit the existing ones. Whether service's own vocabulary generalises to a second
fault-diagnosis-style scene is the next open question, not assumed here.
