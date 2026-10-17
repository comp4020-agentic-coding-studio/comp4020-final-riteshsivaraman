---
status: working
what: How the conversation engine in src/shared/talk works: layers, modules, the state, the turn protocol, how options and legal moves are computed, the rules the engine enforces, the NPCs, the wording system, the tests that guard it, and where to extend it.
date: 2026-10-18
source: read from src/shared/talk/*.ts and spec/talk-*.test.ts at commit 417f949. Claude's account; the code is the source of truth.
---

# Engine reference

## 1. Layers

```
devices.json  ──>  data.ts   (typed, normalised records; null = not stated)
                      │
                      v
                   pool.ts   (constraints, signals, the pool of SKUs, ranking, price bands)
                      │
                      v
                   bank.ts   (questions: preconditions, options, effects; derive(); helpers)
                      │
        ┌─────────────┴─────────────┐
        v                           v
     scene.ts                    lines.ts
 (turn engine: legal moves,    (every spoken line, built from
  menus, applying a move)       state + data; tone; the SAID table)
        │                           │
        └─────────────┬─────────────┘
                      v
                   npc.ts    (customer persona + staff weights + runConversation)
                      │
         ┌────────────┼──────────────────┐
         v            v                  v
   spec/talk-*    scripts/talk-      poc/talk/
    (tests)       transcripts.ts     (HTML page)
```

`types.ts` is the shared vocabulary; `rng.ts` is a seeded generator. Everything is pure: state in,
state out, no DOM, clock or network. The scene is plain JSON (cloneable, serialisable), so the two
tabs of the page pass it around and a spec can build any state by hand.

Import order matters: `bank.ts` owns `derive()` and the question definitions; `scene.ts` imports it;
`lines.ts` imports `bank.ts` (for `describeConstraints`, `named`, `questionById`); nothing imports
`scene.ts` except `npc.ts`, the specs and the page. That is how a circular import is avoided.

Node runs the `.ts` files directly (erasable syntax only: no enums, no parameter properties) and
`data.ts` imports `docs/conversation-model/devices.json` with an import attribute; vite and vitest
handle both.

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

`derive(scene)` (in `bank.ts`) is the heart: it **folds** the answers into `Constraints` and `Signals`,
applies `fixed` and `excluded`, computes the pool and the ranking, and returns a `Ctx`
`{ sc, c, s, pool, ranked, model }` where `model` is the one phone it is down to (or the fixed one).
Because it is recomputed every time, reopening a question is replacing its answer; conceding a want is
deleting the answers that set it (`forget` in `scene.ts`); nothing needs undoing.

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

## 7. NPCs (`npc.ts`)

- `Persona`: opening style, optional target SKU, hard `wants`, `signals`, `unsure`, `patience`, `relax` (what it
  would give up), `resistance`, optional `looseFirstCeiling`, `throwbackRate`, `tones`.
- `customerMove(sc, persona, rng, memory)`: leaves if patience is spent; otherwise picks for the pending menu.
  An answer is consistent if it contradicts no want and leaves the target in the pool (`consistent`,
  `compatible`). Memory (`conceded`) stops it insisting on a want it gave up.
- `staffMove(sc, traits, rng)`: weights over `staffActs`; forced moves and single options are taken.
- `randomPersona`, `randomStaff`, `runConversation(persona, staff, rng, scene)` returns the final scene and
  `stuck` if either side ever had no legal move.
- `rng.ts`: `makeRng(seed)` (mulberry32), `chance`, `pickOne`, `weighted`.

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

## 9. The page (`poc/talk/`)

`pnpm poc` (port 5180). Setup screen or a hash. Play either side against an NPC or open the shown link in a
second tab (`BroadcastChannel`, same browser only: moves are replayed on both sides, a join asks for the
current scene). Staff see the pool size, the ranking, what the customer has told them and a patience hint;
the customer never sees the ranking. The page shows tone and face on each line. It is throwaway: nothing is
persisted or logged.

## 10. Known limits

- One scene's questions and facts are hard-wired (see the playbook for what is generic).
- `devices.json` is imported from `docs/`; a deployed build would need it copied.
- No persistence and no `events` rows (the CLAUDE.md invariant applies the moment this is wired).
- Customers sometimes give a looser first budget than their limit (intended: it exercises the reopen).
- Ranking is a starting rule, not a considered one.
- The customer's menu offers every phone we carry as a demo or pick (14 actions): fine for the page, long for a
  real UI (group it).
