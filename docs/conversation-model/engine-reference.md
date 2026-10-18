---
status: working
what: How the conversation engine in src/shared/talk works: layers, modules, the state, the turn protocol, how options and legal moves are computed, the rules the engine enforces, the NPCs, the wording system, the tests that guard it, and where to extend it. Covers the phone, laptop and device-service scenes, and says plainly which parts are actually shared between them and which are duplicated.
date: 2026-10-18
source: read from src/shared/talk/*.ts, src/shared/talk/core/*.ts, src/shared/talk/scenes/{laptop,service}/*.ts and spec/talk-*.test.ts, updated through phase 2 step 3 (the final step) of the core extraction and then through the device-service scene (Claude, with Ritesh reviewing and approving each step/proposal in session; see decisions.md, core-extraction-proposal.md and service-scene-proposal.md). Claude's account; the code is the source of truth.
---

# Engine reference

## 1. Layers

There are now three scenes on this engine: phone (`src/shared/talk/`), laptop
(`src/shared/talk/scenes/laptop/`) and device-service (`src/shared/talk/scenes/service/`). The
three-step core extraction (`docs/conversation-model/core-extraction-proposal.md`) is complete:
`core/rng.ts`, `core/types.ts`, **`core/engine.ts`** and **`core/npc.ts`** are genuinely shared
between phone and laptop, in three layers. Section 11 below covers what the service scene (the
first genuinely different scene shape -- a pool of fault explanations, not products) actually
reused from this shared core and what it correctly did not.

- **The question-bank machinery (step 1):** `derive`, `withoutAnswer`, `rowsIf`, `optionsFor`,
  `askable`, `reopenable` and `gain` each have exactly one body, generic over a small `EngineDeps`
  interface (pool functions, the bank array, a `withAnswer` scene-copy helper). Each scene's
  `bank.ts` is a thin wrapper re-exporting these under its own concrete types.
- **The turn-protocol pieces that turned out to be pure rules (step 2):** `demoCandidates`,
  `relaxMoves`, `hintText`, `validatePicks`, `nearestModels` and `eligibleRecommendations` (the
  recommend loop's one real hook: phone won't recommend an unasked foldable, laptop has no such
  gate) each have exactly one body too. Each scene's `scene.ts` calls these instead of
  reimplementing them -- `demoCandidates(ctx)` and `relaxMoves(ctx)` in `scene.ts` are now
  one-line wrappers, not the algorithm itself.
- **The NPC loop mechanics (step 3):** `staffMove`, `runConversation`, `randomStaff`, the `tone()`
  helper and `pickN()` are byte-identical between the two scenes' `npc.ts` (re-diffed fresh at
  step 3, not trusted from phase 1's pre-implementation guess) and now have exactly one body each
  in `core/npc.ts`, parameterized with plain function arguments rather than one large dependency
  object (the same conservative style `engine.ts`'s `relaxMoves`/`nearestModels` already used).
  Each scene's `npc.ts` calls into these, passing its own `customerMove`/`questionById`/question-id
  literals as closures/arguments.

**What stayed duplicated, and why that is the honest answer, not an oversight:** `staffActs`,
`applyStaff`, `customerMenu` and `applyCustomer` themselves stay in each scene's `scene.ts`,
because their `confirm`/`reconfirm`/`keepPreferences` branches turned out to depend on more than
"which axes vary" -- a laptop has a memory axis a phone doesn't, so the actual *option ids* at
confirm time differ (laptop offers a `memory` change phone never has), not just whether a check
passes. Phase 1's proposed `confirmExtraOptions`/`parseStorageTier` hooks would have had to grow
into a much larger, more speculative interface to cover this honestly, built from only two data
points -- exactly the "a rule that fits the examples but not the data" mistake
new-scene-playbook.md warns against. So this cluster (plus the pure-data `ASK_LABEL`/`KEY_TEXT`
maps and item-noun wording) stays scene-owned, documented as a real exception rather than hidden.

Step 3 found the same shape of exception in `npc.ts`: `compatible`, `consistent`, `answerQuestion`
and `customerMove` each read a `Sku`/`Constraints`/tier field whose *shape* differs per scene
(phone's `r.storage`/`t.storage` vs laptop's `r.memoryGb`/`r.storageGb`/`t.storageGb`), tied to
`Persona.target`'s differing shape -- the same restraint applied, rather than building a hook for
the persona/goal-matching logic from two data points. `randomPersona` is entirely scene-specific
content (signal lists, impossible-persona archetypes, want shapes), correctly left scene-owned, the
same category `pool.ts`'s own content already falls into.

**`pool.ts`, the actual `QuestionDef`s, and all of `lines.ts`'s wording stay fully duplicated by
deliberate decision**, not because nobody got to them -- they are what makes a phone scene a phone
scene and a laptop scene a laptop scene. Read new-scene-playbook.md's "Generic today vs
phone-specific" for the full, final account of the split.

```
          core/rng.ts     core/types.ts          core/engine.ts            core/npc.ts
          (seeded RNG)    (Tone, Role, Option,    (derive..gain, AND        (staffMove,
               │           Answer, Pending,        demoCandidates,          runConversation,
               │           StaffAct, Customer-     relaxMoves, hintText,    randomStaff,
               │           Action/Reply, Line,      validatePicks,          tone(), pickN())
               │           Snapshot, Ended<Sku>)   nearestModels,                │
               │                 │                 eligibleRecommendations)      │
        ┌──────┴─────────────────┴──────────────────────┴────────────────────────┴─────┐
        v                                                                               v
  PHONE SCENE (src/shared/talk/)                        LAPTOP SCENE (src/shared/talk/scenes/laptop/)
  devices.json ─> data.ts ─> pool.ts                    laptops.json ─> data.ts ─> pool.ts
                     │                                                     │
              bank.ts (thin wrapper over core/engine.ts,            bank.ts (thin wrapper,
              plus this scene's own QuestionDef[])                  same shape)
                     │                                                     │
          ┌──────────┴──────────┐                             ┌──────────┴──────────┐
          v                     v                              v                     v
       scene.ts              lines.ts                       scene.ts              lines.ts
  (thin calls into core    (scene-specific,              (thin calls into core    (scene-specific,
   engine helpers, plus     correctly so)                 engine helpers, plus     correctly so)
   confirm/reconfirm/                                      confirm/reconfirm/
   keepPreferences, kept                                   keepPreferences, kept
   scene-owned -- see                                      scene-owned -- see
   above)                                                  above)
          └──────────┬──────────┘                             └──────────┬──────────┘
                      v                                                   v
                   npc.ts                                              npc.ts
    (thin calls into core/npc.ts for staffMove/              (thin calls into core/npc.ts, same
     runConversation/randomStaff/tone/pickN;                  shape; compatible/consistent/
     compatible/consistent/answerQuestion/                    answerQuestion/customerMove/
     customerMove/randomPersona stay here --                  randomPersona stay here, same
     see above)                                                reasons)
```

Net effect of the three steps: `core/` is 698 lines (`engine.ts` 408, `npc.ts` 156, `types.ts` 105,
`rng.ts` 29). The phone scene's own files total 1,915 lines, the laptop scene's 1,783 -- each
scene's files shrank as their thin wrappers replaced full duplicated bodies, while `pool.ts`,
`lines.ts`, the bank's actual questions, and the persona/goal-matching NPC logic remain
scene-specific in full, by evidenced decision.

Within one scene, `types.ts` holds the scene's own vocabulary (re-exporting `core/types.ts`'s
pieces alongside `Scene`, `Pending`, `StaffAct`, which do depend on that scene's pool shape).
Everything is pure: state in, state out, no DOM, clock or network. The scene is plain JSON
(cloneable, serialisable), so the two tabs of the phone page pass it around and a spec can build
any state by hand. The laptop scene has no page (`poc/talk/` is phone-only).

Import order matters within a scene: `bank.ts` owns `derive()` and the question definitions;
`scene.ts` imports it; `lines.ts` imports `bank.ts` (for `describeConstraints`, `named`,
`questionById`); nothing imports `scene.ts` except `npc.ts`, the specs and (phone only) the page.
That is how a circular import is avoided, in both scenes' module graphs independently.

Node runs the `.ts` files directly (erasable syntax only: no enums, no parameter properties) and
each scene's `data.ts` imports its own JSON (`docs/conversation-model/devices.json` or
`laptops.json`) with an import attribute; vite and vitest handle both.

## 2. The state: `Scene` (`types.ts`)

| Field | Meaning |
|---|---|
| `answers`, `order` | what the customer has answered, by question id, in the order first answered. **Everything else about the customer's wants is derived from these.** |
| `fixed` | the phone they named, chose, liked after a demo, or agreed to |
| `excluded` | phones they turned down |
| `demoed`, `declinedDemo`, `recommended` | what staff have shown, offered and declined, suggested |
| `carried` | wishes (colour, storage floor) that travelled with them to a new phone and have not yet been checked |
| `wantsMore` | they asked about other phones: staff go back to asking before offering anything |
| `relaxDeclined` | how many times they refused to give something up when nothing fitted |
| `wanted`, `gift` | a phone they asked for that we do not carry; whether it is a gift |
| `patience` | the customer's; staff tone and number of questions move it |
| `turn`, `toMove`, `pending` | whose move, and what the customer is being asked (a question, a demo offer, a reaction, a recommendation, a reconfirm, a nudge, a rescue, a confirm, or a free turn) |
| `owed`, `owedPool` | throw-backs staff must answer next (several joined by `\|`), and the phones the customer was looking at when they asked |
| `forced` | the only move staff may make next |
| `ended` | `bought` (with the SKU) or `left` (with why) |
| `log` | every line: who, tone, expression, move, question id, picks, throw-back, the spoken text, and a snapshot of the pool after |

`derive(scene)` is the heart: it **folds** the answers into `Constraints` and `Signals`,
applies `fixed` and `excluded`, computes the pool and the ranking, and returns a `Ctx`
`{ sc, c, s, pool, ranked, model }` where `model` is the one phone it is down to (or the fixed one).
Because it is recomputed every time, reopening a question is replacing its answer; conceding a want is
deleting the answers that set it (`forget` in `scene.ts`); nothing needs undoing. The body now lives
once in `core/engine.ts`; `bank.ts` exports `derive` as a one-line call into it with this scene's
`EngineDeps` (see section 1).

## 3. The pool (`pool.ts`)

- A **Sku** is `{ model, storage, gb, colour, price }`. `poolOf(constraints)` returns every SKU that
  passes.
- **Constraints** (hard): model, lines, excluded, maxPrice, minGB, storage, colours, foldable, screen band,
  maxScreenIn, separateTelephoto, minBattery, features. A constraint on an attribute that is `null` for a model
  never eliminates it.
- **Signals** (soft, staff-side): photos, video, battery, bigScreen, light, features. They only affect `rank()`.
- `rank(pool, signals)`: starting rule agreed by Ritesh, to be tuned: with no signals cheapest first; photos
  rewards lens lines (+1 for a separate telephoto); video rewards 4K at 120 fps and ProRes; battery rewards
  hours (40+ = 2, 30 to 39 = 1); each wanted feature the model has = 1; big screen = 1 plus a small bonus per
  inch; light rewards the lightest; ties go to the cheaper.
- `priceBands(pool)`: distinct tier prices rounded up to A$100, kept only if they change which rows are left
  (the pool is over rows), thinned to three. "No real limit" and "Set my own budget" sit beside them.

## 4. The question bank (`bank.ts`)

A `QuestionDef` has: `id`, `kind` (`hard` narrows, `soft` re-ranks, `route` steers the visit, `resolve` pins
the final storage or colour), `multi`, `ask(ctx, reopen)` (the neutral wording), `pre(ctx)` (worth asking
now?), `options(ctx)` (generated from the pool), `apply(picks)` (its contribution: constraints, signals, a
fixed model, a route, "went to another desk", a wanted-but-uncarried model, gift).

Current bank (16): `opening_intent`, `known_model`, `model_family`, `use_case`, `form_factor`,
`screen_size_pref`, `telephoto_need`, `battery_priority`, `weight_pref`, `hardware_features`, `storage_need`,
`budget_ceiling`, `colour_prefs`, `size_fit_check` (retired: `pre` is `false`), `storage_tier_for_model`,
`colour_pick`.

How "worth asking" is decided (`askable`): not asked yet (or a `resolve` question the customer was unsure
about), its own `pre` holds, and for hard and resolve questions at least one non-neutral option would narrow the
pool (`optionsFor` hides options that would change nothing). Notable preconditions, each one a reviewed
finding: technical questions (telephoto, battery) wait until the customer has shown they care; features and
colours wait until use or budget is known; `resolve` questions need an *accepted* phone (`fixed`); the budget
question is not asked once they have chosen the phone.

`withoutAnswer(ctx, qid)` generates the options of a **reopen**: "what else could the answer be, holding the
rest fixed". `rowsIf` previews a pick. `gain` scores how much a question narrows (used by the staff NPC and the
staff menu hint). `reopenable` lists answered questions, and on an empty pool only those whose reopening can
bring something back.

## 5. The turn protocol (`scene.ts`)

```
staffActs(sc)          the legal staff moves (a list with labels and hints)
applyStaff(sc, act, tone)    validates against that list; records the line; sets what the customer is asked
customerMenu(sc)       options for the pending question + throw-backs + standing actions
applyCustomer(sc, reply)     validates against that menu; applies picks, then an action; records the line;
                             if the scene ended, adds the staff sign-off
```

**Staff moves** (`StaffAct`): `ask` (with `reopen`), `offer_demo`, `demo`, `recommend`, `reconfirm`, `nudge`,
`rescue`, `confirm`, `answer`.

**Customer side:** the answer to the pending menu (single or multi; the budget option takes a number in
A$100 steps); optionally one throw-back; or a standing action instead or as well: `demo` or `pick` any phone
we carry, `change` an earlier answer, `leave`, `ok`.

**What the engine forces or forbids** (all enforced here, not left to NPC taste):

- First staff move: only the two opening questions (a greeting that introduces them). `staffActs` filters
  to them when the log is empty.
- Every scene ends with a staff sign-off line.
- `forced`: a requested demo; a requested change; "I know the range" forces `model_family`, "I have a phone in
  mind" forces `known_model`.
- `owed`: a throw-back is answered in staff's next line, before or alongside their next move; several are
  answered in order; the answer is about the phones in play when it was asked (`owedPool`). "No model in mind
  yet" owes an overview.
- `wantsMore`: after "ask about other phones" no demo or recommendation until staff ask a question.
- Empty pool: `nudge` (and `rescue` after a refusal); the nudge's give-up options are single concessions, or
  the smallest pair when no single one helps, plus raising the budget.
- `confirm` and `resolve` questions need the phone accepted. `recommend` is offered once use or budget is known
  (or nothing is left to ask), never a foldable unasked.
- Demos: only phones not yet shown or declined; the customer can always ask again.
- A turned-down phone is never offered by staff; the customer can ask about it, see it or go with it, which
  brings it back (`reconsider`).
- A fixed phone that is turned down is released (`setAside`); preferences travel (`keepPreferences`).
- Illegal moves and off-menu picks return `{ error }` and change nothing.

## 6. Wording (`lines.ts`)

Every line is built from state and data; nothing is free text. Pieces:

- `staffBase(act, ctx, models)` builds the staff line for each move; `staffLine` adds answers to owed
  throw-backs and a content-aware **lead-in** (`staffLead`): none on the first line, none before bad news (which
  carries its own "Sorry,"), "Understood."/"No problem." after a refusal, "That's fine." after hesitation,
  "Of course." after a change request, "Um," only on questions.
- `customerLine` builds what the customer says. Static picks use the `SAID` table (per tone where it matters);
  question-specific frames cover models, colours, storage, budget, uses; the menu label is never the line
  (`NOT_SURE` has one per tone). Tone suffixes ("Thanks!", "What's next?") only follow a plain answer, never an
  action or a refusal.
- `answerThrowback` answers compare/attribute/price/overview/about/not-carried from data, scoped honestly.
- `highlights`/`describe` read facts about a phone (foldable first, then what the customer cares about).
- `named(ctx, id)` decides whether to say "it": the phone talked about most recently, and only if that line
  talked about just that one (`mentioned` matches longest names first so "iPhone 18 Pro" is not found inside
  "iPhone 18 Pro Max").
- All placeholder phrases are marked [TK] for Ritesh to rewrite.

**Tone and face:** `TONE_EXPRESSION` in `types.ts` maps friendly/neutral/impatient/unsure to the character's own
`smile`/`neutral`/`focused`/`worried`; every `Line` carries `expression`.

## 7. NPCs (`npc.ts`, mechanics shared from `core/npc.ts`)

- `Persona`: opening style, optional target SKU, hard `wants`, `signals`, `unsure`, `patience`, `relax` (what it
  would give up), `resistance`, optional `looseFirstCeiling`, `throwbackRate`, `tones`. Scene-owned content.
- `customerMove(sc, persona, rng, memory)`: leaves if patience is spent; otherwise picks for the pending menu.
  An answer is consistent if it contradicts no want and leaves the target in the pool (`consistent`,
  `compatible`). Memory (`conceded`) stops it insisting on a want it gave up. Stays scene-owned (step 3 found
  each of `compatible`/`consistent`/`answerQuestion` reads a field whose shape differs per scene -- see
  section 1).
- `staffMove(sc, traits, rng)`: each scene's version is now a thin wrapper deriving the pool/ranking and the
  scene's own question-id literals, then calling `core/npc.ts`'s `staffMove`, which does the actual weighting
  over `staffActs`; forced moves and single options are taken.
- `randomPersona`: scene-owned (signal lists, impossible-persona archetypes, want shapes are scene content).
- `randomStaff`, `runConversation(persona, staff, rng, scene)`: re-exports/thin wrappers over `core/npc.ts`,
  byte-identical mechanics in both scenes. `runConversation` returns the final scene and `stuck` if either
  side ever had no legal move.
- `pickN`: moved to `core/npc.ts`, used by each scene's `randomPersona` to sample signals.
- `rng.ts`: `makeRng(seed)` (mulberry32), `chance`, `pickOne`, `weighted` -- shared from `core/rng.ts` since
  before step 1, confirmed untouched by step 3.

## 8. Tests (what each file promises)

| File | Promise |
|---|---|
| `spec/talk-data.test.ts` | the parsed records say what the sourced scrape says, and nothing it does not (golden values) |
| `spec/talk-pool.test.ts` | pool, ranking and bands behave as the transcripts need; a hard filter never eliminates on not-stated |
| `spec/talk-scene.test.ts` | refusals; answers recomputed not stacked; throw-backs; demos; an empty pool has a way out; finishing; opening and sign-off; remembering preferences; turned-down phones; every reviewed finding |
| `spec/talk-replay.test.ts` + `spec/talk-replays/*.json` | the engine reproduces the 11 sample conversations step by step |
| `spec/talk-sim.test.ts` | over 400 seeded NPC-vs-NPC runs: nobody stranded, all end, no repeated question except a reopen, no sale to someone who cannot be satisfied, greeting and sign-off, no demo twice, no reopen without reason, technical questions only when they matter, no repeated throw-back, never wanting and refusing one phone |
| `spec/talk-lines.test.ts` | what is said reads as English: no bare menu label, no stacked acknowledgements, no cheer before bad news, no invented "closest" or "crop", menu text never equals speech (all 4 tones), tone maps to a real face |

`vitest.talk.config.ts` runs just these (`pnpm test:talk`, about a second, no app). `pnpm check` runs them
too through the main config (which needs the app up for the older specs).

**Laptop scene:** `spec/talk-laptop-{data,pool,sim,lines}.test.ts` make the same four promises
(golden data values, pool/ranking/bands, 400-run simulation invariants, English wording) against
`src/shared/talk/scenes/laptop/`. There is no `talk-laptop-scene.test.ts` or replay suite --
laptop was never given hand-written sample transcripts to convert into replays, so that half of
the phone scene's test coverage (direct scene-mechanics specs and transcript replays) has no
laptop equivalent yet.

**Service scene:** `spec/talk-service-{data,pool,sim,lines}.test.ts` (22 specs). `data` and `pool`
promise the fault table's internal consistency and `runCheck`'s determinism, plus the pool's
different shape (empty with no symptom, populated not narrowed by the symptom question, collapsed
to one row by a confirmed fault). `sim` is 500 seeded NPC-vs-NPC runs with the same no-stuck/
always-ends invariants as the other scenes, plus the scene's own point: a GATE test asserting
every seed that reaches a destructive-fault outcome has `dataLossWarned: true`, read directly off
engine state, and a dedicated mutation-check test that removes the gate and confirms both tests go
red for the right reason before restoring it. `lines` is light (v1's wording is placeholder) and
only checks structural facts: tone-to-face mapping, the warning line is unconditional, and outcome
wording reads real cost/location off `data.ts` rather than inventing one.

162 specs total across all three scenes.

## 9. The page (`poc/talk/`)

`pnpm poc` (port 5180). Setup screen or a hash. Play either side against an NPC or open the shown link in a
second tab (`BroadcastChannel`, same browser only: moves are replayed on both sides, a join asks for the
current scene). Staff see the pool size, the ranking, what the customer has told them and a patience hint;
the customer never sees the ranking. The page shows tone and face on each line. It is throwaway: nothing is
persisted or logged.

## 10. Known limits

- One scene's questions and facts are hard-wired (see the playbook for what is generic -- as of
  2026-10-18, the turn protocol, question-bank machinery and NPC loop mechanics are genuinely
  shared; what's left hard-wired per scene is the pool, the actual questions, the wording, and the
  persona/goal-matching half of the NPC loop -- see section 1 above for the full account).
- `devices.json`/`laptops.json` are imported from `docs/`; a deployed build would need them copied.
- No persistence and no `events` rows (the CLAUDE.md invariant applies the moment this is wired).
- Customers sometimes give a looser first budget than their limit (intended: it exercises the reopen).
- Ranking is a starting rule, not a considered one.
- The customer's menu offers every phone/laptop we carry as a demo or pick (14 phone actions, 14 laptop
  actions): fine for the page, long for a real UI (group it). The laptop scene has no page at all yet.
- Laptop's catalogue only models Apple's preconfigured SKUs, not the full build-to-order
  memory/storage space (see `laptops-v2-notes.md`), and excludes the nano-texture display finish
  (no bank question distinguishes a finish; including it left two rows the engine could never
  resolve between -- see the laptop `data.ts` comment on `skusStandard`).
- Service v1 is phone-only, 4 symptoms, no pricing beyond `[TK]` placeholder, and has no page or
  replay suite. It has never been played by a human.

## 11. The device-service scene: what a genuinely different pool shape actually needed

Phone and laptop are both "narrow a catalogue" scenes: the pool is purchasable items, hard
constraints eliminate rows, a customer ends by buying one or leaving. The core extraction (section
1) was built and verified against exactly these two. `docs/conversation-model/
service-scene-proposal.md` (phase 1, before any code) predicted the shared vocabulary in
`core/types.ts` and `core/npc.ts`'s `staffMove` would turn out to be purchase-family-generic, not
pool-shape-generic -- and building the scene confirmed it, with one correction found along the way:

- **`core/engine.ts`'s fold (`derive`/`askable`/`gain`/etc., step 1) is genuinely pool-shape-generic,
  reused wholesale.** It never assumed "purchasable" -- only "a pool narrowed by constraints,
  ranked by signals" -- and `scenes/service/bank.ts` wires it the same way phone and laptop's
  `bank.ts` do, no changes needed.
- **`core/engine.ts`'s `validatePicks` and `hintText` (step 2) are also genuinely generic**, reused
  as-is in `scenes/service/scene.ts`.
- **`core/types.ts`'s `Pending`/`StaffAct`/`CustomerAction`/`Ended` and `core/npc.ts`'s `staffMove`
  are NOT pool-shape-generic -- they are purchase-family vocabulary.** Service defines its own
  small `Pending`/`StaffAct`/`CustomerAction`/`Outcome` in `scenes/service/types.ts` (no
  `demo`/`pick`/`recommend`/`{how:"bought"}` at all -- this scene has `run_check`,
  `warn_data_loss`, `present_outcome`, `cannot_diagnose` instead) and its own `staffMove` in
  `scenes/service/npc.ts`, since `core/npc.ts`'s `staffMove` pattern-matches the purchase
  `StaffAct` union by name and simply doesn't have cases for this scene's acts. This is not a
  shortcoming of steps 1-3 -- the diff that produced `core/types.ts` was only ever run against two
  purchase scenes, so it correctly found what *those two* shared, which was always going to be
  narrower than "any two-party menu conversation."
- **A new mechanism the core needed zero changes for, confirmed by building it rather than
  guessed:** a staff-authored fact. `run_check` (`scenes/service/scene.ts`) reads the fault table
  deterministically (`data.ts`'s `runCheck`, not a dice roll) and writes the result into
  `sc.answers`/`sc.order` exactly the way a customer's pick would -- `core/engine.ts`'s `derive()`
  folds it identically either way, since it only ever asked "is there an answer for this question
  id", never "who gave it".
- **A new mechanism that genuinely does not exist in the core, built scene-local:** a precondition
  gate on reaching an *outcome*. `forced`/`owed` (phone/laptop) only ever constrain which
  *question* is asked next; neither purchase scene has an ending with a real-world stake attached
  to a specific line, so there was nothing to generalise from. Service's `dataLossWarned` boolean on
  `Scene`, checked in `staffActs` before `present_outcome` is ever offered and re-checked in
  `applyStaff`'s own legality list (so a malformed direct call can't bypass it either), is built
  fresh. Verified failing-first: the check was deliberately removed, both `spec/
  talk-service-sim.test.ts`'s GATE test and its own mutation-check test went red for the right
  reason, then it was restored (CLAUDE.md's defect loop, applied to a new mechanism rather than a
  regression).
- **One real bug found while wiring the bank, not predicted by the proposal:** `symptom` had to be
  a `"route"` question, not `"hard"` -- `core/engine.ts`'s `optionsFor` only offers a hard option
  when it strictly narrows an *already non-empty* pool (true for phone/laptop, whose catalogue
  starts full), but this scene's pool starts empty and `symptom` populates it rather than narrowing
  it, same category as phone's own `opening_intent`/`known_model`. Found by a failing smoke run
  (`staffActs` went empty after the model question), fixed, not guessed in advance.

**Honest bottom line:** the question-bank fold is proven pool-shape-generic across a genuinely
different pool (products vs. fault explanations). The turn-protocol/NPC-loop vocabulary in
`core/types.ts`/`core/npc.ts` is proven purchase-family-generic, a real but smaller claim than "any
conversation on this engine" -- and that is a correct, useful finding from building a third,
different scene, not a failure of the first two scenes' extraction. A fourth scene closer in shape
to service (another fault-diagnosis-style conversation) would be the next test of whether
service's own vocabulary generalises past one example, the same way laptop tested phone's.
