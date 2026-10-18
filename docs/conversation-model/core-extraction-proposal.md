---
status: draft
what: Phase 1 of the real core extraction - a diff-verified proposal for the scene-definition abstraction that the overnight run promised but didn't build, for Ritesh's review before any of it is written.
date: 2026-10-18
source: Claude's own line-by-line diff of src/shared/talk/{scene,bank,npc,pool,lines}.ts against scenes/laptop/{scene,bank,npc,pool,lines}.ts, done fresh (not reusing the overnight run's claims, which the docs reconciliation already flagged as unverified in places).
---

# Core extraction: what's actually generic, and the proposed shape

Last night's run was asked to extract a generic engine core while porting the laptop scene,
and instead near-verbatim copy-pasted `scene.ts` into `scenes/laptop/scene.ts` (confirmed:
identical function names in identical order, 468 vs 435 lines). Only `core/{rng,types}.ts`
were genuinely pulled out. This document is the design step that should have preceded any
porting: a real diff of what's shared, and a concrete proposal for the shape that would let
`core/engine.ts` exist once, with `scenes/phone/` and `scenes/laptop/` as thin config over it.

**No code is written here.** This is for review before phase 2.

## 1. What the diff actually shows, file by file

### `bank.ts`'s engine functions: already 100% generic, proven by inspection

`derive`, `withoutAnswer`, `rowsIf`, `optionsFor`, `askable`, `reopenable`, `gain` (bank.ts
lines 424-498, ~75 lines) are byte-identical in structure between phone and laptop, and
**on inspection, none of them reference a phone- or laptop-specific field at all** — they
only call `questionById(qid).apply(picks)` (a method the scene's own `QuestionDef` objects
provide), `BANK` (the scene's own question array), and generic `pool.ts` functions
(`mergeConstraints`, `mergeSignals`, `poolOf`, `modelIds`, `rank`) that operate on whatever
`Constraints`/`Signals`/`Sku` shape the scene defines. For example, `derive`:

```ts
export function derive(sc: Scene): Ctx {
  let c: Constraints = {};
  let s: Signals = {};
  for (const qid of sc.order) {
    const a = sc.answers[qid];
    if (!a) continue;
    const k = questionById(qid).apply(a.picks);
    if (k.c) c = mergeConstraints(c, k.c);
    if (k.s) s = mergeSignals(s, k.s);
  }
  if (sc.excluded.length) c = mergeConstraints(c, { excluded: sc.excluded });
  if (sc.fixed) c = { ...c, model: sc.fixed };
  const pool = poolOf(c);
  const ids = modelIds(pool);
  return { sc, c, s, pool, ranked: rank(pool, s), model: sc.fixed ?? (ids.length === 1 ? ids[0]! : null) };
}
```

This is the single strongest piece of evidence that a real generic core is achievable, not
aspirational: it already behaves like one. It's just physically duplicated in two files.
**This block should move to `core/engine.ts` verbatim, generic over `Scene<C, S, Item>`.**

### `scene.ts`: almost all generic, a handful of real scene-specific branches

Diffed in full. Identical structure; nearly identical content. Real differences:

- `ASK_LABEL`, `KEY_TEXT` — pure data (question-id → label maps). Trivially becomes scene
  config, not logic.
- `reactions()`'s "other phones"/"other laptops" string, `confirm`'s "this phone"/"this
  laptop" — pure wording, already isolated to a few literal strings. Becomes scene config
  (a `nouns: { item: string, itemPlural: string }` or similar).
- **`customerMenu`'s `confirm` branch is a genuine logic difference, not just wording**:
  phone checks colour/storage variance only; laptop also checks `memoryVaries` because
  laptops have a memory axis phones don't. This is the clearest case of "same shape,
  different specifics" — the *pattern* (offer a change option for each axis that varies
  within the resolved SKU) is generic, but which axes exist is scene-specific.
- **`staffActs`'s recommend loop**: phone filters `askedFold` (don't recommend a foldable
  unasked); laptop has no such filter (no foldable-equivalent axis). Same situation — a
  generic "eligibility filter before recommending" hook, with phone supplying one and
  laptop supplying a no-op.
- `keepPreferences()`: nearly identical; phone has a TB/GB string-parsing branch
  (`"512GB"` style) that laptop's plain-number storage field doesn't need. Minor,
  collapses easily (push the string-parsing into a scene-provided `parseStorage` function).

Everything else — `demoCandidates`, `relaxMoves`, `staffActs`'s overall shape, `hintFor`,
`modelCountIf`, `validPicks`, `applyStaff`, `log`, `applyCustomer`, `reconsider`,
`setAside`, `switchModel`, `forget`, and `answer`'s question/offer_demo/demo_reaction/
reconfirm/recommend/nudge/rescue branches — are identical modulo type names that already
resolve to generic shapes (`Scene`, `Ctx`, `StaffAct`, `Constraints`, `QuestionDef`). These
move to `core/engine.ts` as-is.

### `pool.ts`: genuinely scene-specific, correctly not shared

`modelPasses`, `score` (the ranking heuristic), and the field-by-field `mergeConstraints`
logic are hardcoded to phone attributes (`foldable`, `separateTelephoto`, `screen`,
`minBattery`, camera features) and laptop's equivalent file hardcodes its own (`family`,
`minMemoryGb`, `minThunderboltGen`, `maxWeightG`). This is correct, not a gap: these
functions encode what a phone or laptop *is*, which is exactly what should differ. **Pool
logic stays scene-specific.** The generic core only needs `poolOf(c): Item[]`,
`rank(pool, s): Model[]`, `mergeConstraints`, `mergeSignals` as a **required interface**
each scene implements, not shared code.

### `npc.ts`: same algorithm, different field names

`Persona.target` differs in shape (`{model, storage, colour}` vs `{model, memoryGb,
storageGb, colour}`) but `consistent()`/`compatible()`-style checks apply the identical
algorithm to whatever `Constraints` fields the scene has. `customerMove`/`staffMove`/
`runConversation` are the same weighted-choice/patience/RNG loop over whatever
`staffActs`/`customerMenu` already returns (already generic, since those are generic).
**This moves to `core/engine.ts` too**, parameterized the same way as `scene.ts`.

### `lines.ts`: entirely scene-specific, correctly not shared

Every staff/customer line is built from scene-specific facts about the item (`highlights`,
`describe`, the `SAID` table, tone-specific phrasing). There's no shared algorithm here to
extract — wording is the one thing that should always differ per scene. No action needed;
`lines.ts` stays a required-interface file per scene (an object of wording functions the
generic core calls at the right moments, same as today).

## 2. Proposed shape

```ts
// core/types.ts (extends what's already there)
export interface ItemConstraints { excluded?: string[]; maxPrice?: number; [k: string]: unknown }
export interface ItemSignals { [k: string]: unknown }

export interface SceneDef<Item, C extends ItemConstraints, S extends ItemSignals, Target> {
  // data + pool (scene supplies, required interface — not shared code)
  poolOf(c: C): Item[];
  rank(pool: Item[], s: S): unknown[]; // ranked models/variants
  mergeConstraints(a: C, b: C): C;
  mergeSignals(a: S, b: S): S;

  // the bank: the actual QuestionDef[] (scene-specific content, generic machinery)
  bank: QuestionDef<C, S>[];

  // labels and wording (pure data/config, not logic)
  askLabel: Record<string, string>;
  relaxLabel: Partial<Record<keyof C, string>>;
  nouns: { item: string; itemPlural: string }; // "phone"/"laptop" substitution

  // the few genuine logic hooks found above — small, explicit, not a catch-all
  confirmExtraOptions(ctx: Ctx<Item, C, S>): { id: string; label: string }[]; // memory/storage/colour variance checks
  recommendEligible(ctx: Ctx<Item, C, S>, candidate: unknown): boolean; // phone's askedFold-style gating; laptop returns true always
  parseStorageTier?(pick: string): number; // collapses the TB/GB string-parsing difference

  // wording (already an object of functions in lines.ts; wire it the same way)
  wording: SceneWording<Item, C, S, Target>;
}

// core/engine.ts — written ONCE, generic over SceneDef
export function derive<Item, C, S>(def: SceneDef<Item, C, S, unknown>, sc: Scene<C>): Ctx<Item, C, S> { /* exact body shown above */ }
export function staffActs<...>(def, sc): ActView[] { /* exact body from scene.ts, using def.askLabel/def.relaxLabel/def.confirmExtraOptions/def.recommendEligible instead of literals */ }
// ...applyStaff, customerMenu, applyCustomer, askable, reopenable, gain, withoutAnswer, rowsIf — same treatment
```

`scenes/phone/index.ts` and `scenes/laptop/index.ts` become one file each assembling a
`SceneDef` from their existing `data.ts`/`pool.ts`/`bank.ts`'s question array/`lines.ts`,
with `pool.ts` and the bank's question content staying exactly as scene-specific as they
are today (they're not being changed, just referenced from one assembly point instead of
duplicating the engine around them).

The four hooks (`confirmExtraOptions`, `recommendEligible`, `nouns`, `parseStorageTier`)
are deliberately small and named after the actual differences found in section 1, not
invented speculatively — this is the thing `new-scene-playbook.md` warns against doing in
reverse ("a rule that fits the examples but not the data"). If a third, differently-shaped
scene (device-service) needs a hook that doesn't fit this list, that's expected and fine —
add it then, against real evidence, rather than guessing more hooks now.

## 3. What doesn't generalize, and why that's fine

`pool.ts` and the bank's actual `QuestionDef` content (the specific questions, their
`pre`/`options`/`apply` bodies) are not being generalized, on purpose — they're what makes
a phone scene a phone scene. Forcing them into the generic core would be the exact mistake
the playbook warns about. The "generic core" is specifically: the turn protocol, the
obligations machinery, the NPC loop shape, and the small set of hooks above — not the
content of what's being sold or asked about.

**Caveat on evidence strength:** both examples here are purchase scenes (catalogue + pool
narrowing). The hooks above were extracted from exactly two data points, both shaped the
same way. A genuinely different scene (device-service: pool of fault *explanations*, not
products, facts arriving from world state like a test result rather than only customer
answers) is the real test of whether this shape holds — that's phase 3, deliberately not
attempted here.

## 4. Blast radius estimate

- **New**: `src/shared/talk/core/engine.ts` (~500-550 lines: the moved `scene.ts` +
  `bank.ts` engine-function bodies, generic over `SceneDef`), `core/npc.ts` (~250-280
  lines, same treatment for `npc.ts`).
- **Deleted**: `src/shared/talk/scene.ts`, `scenes/laptop/scene.ts`, `npc.ts`,
  `scenes/laptop/npc.ts`, and the `derive`/`withoutAnswer`/`rowsIf`/`optionsFor`/
  `askable`/`reopenable`/`gain` block from both `bank.ts` files (~75 lines x 2).
- **New, thin**: `scenes/phone/index.ts`, `scenes/laptop/index.ts` (~40-60 lines each,
  assembling a `SceneDef` from the existing `pool.ts`/bank-question-array/`lines.ts`,
  which stay where they are and stay scene-specific).
- **Net**: roughly -400 to -500 lines of duplicated code removed, +150-200 lines of new
  generic core and ~100 lines of thin assembly added. A net reduction, not a wash, but the
  per-file churn is real: `scene.ts`, `bank.ts`, `npc.ts` all get restructured in both
  scenes simultaneously, and import paths across the test suite change.
- **Specs**: `spec/talk-scene.test.ts`, `spec/talk-pool.test.ts` (phone), `spec/talk-sim.test.ts`
  (both) import from `src/shared/talk/{scene,bank,npc}.ts` directly — these import paths
  would need updating to point at `scenes/phone/index.ts` (or the generic core re-exports
  under the old path, if we want zero spec changes — recommend this: keep
  `src/shared/talk/scene.ts` etc. as thin re-exports of the phone scene instantiation, so
  all 106 existing phone specs run completely unchanged, same way `core/{rng,types}.ts`
  are already re-exported from the old path today). Laptop's 34 specs need their imports
  repointed similarly but should otherwise pass unchanged, since behavior isn't changing,
  only where it lives.

**Honest size call: medium.** Not a quick refactor (it touches the three largest files in
the engine, in both scenes, simultaneously, and needs care to keep all 140 specs green
without behavior drift) but well-scoped and lower-risk than it might sound, because the
diff above already identifies almost the entire boundary — this isn't open-ended design
work anymore, it's a mechanical move-and-parameterize with four named exceptions.

## 5. Recommendation

Proceed to phase 2 with a tight scope: move `derive`/`withoutAnswer`/`rowsIf`/
`optionsFor`/`askable`/`reopenable`/`gain` first (lowest risk, zero scene-specific logic,
easiest to verify byte-for-byte against both existing test suites), then `scene.ts`'s
turn-protocol functions with the four hooks, then `npc.ts`. Check in after each of the
three moves rather than doing all three in one unsupervised pass — that's the checkpoint
discipline that was missing last time. Do not attempt a third scene until phase 2 is done
and both existing scenes still pass their full spec suites against the new shared core.
