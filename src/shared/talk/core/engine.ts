// The part of the question-bank machinery that turned out not to depend on
// phones or laptops at all: derive() folds a scene's answers into a pool and
// a ranking, and the rest (withoutAnswer, rowsIf, optionsFor, askable,
// reopenable, gain) all build on that fold. Phase 1's diff
// (docs/conversation-model/core-extraction-proposal.md) found these
// byte-identical in structure between src/shared/talk/bank.ts (phones) and
// scenes/laptop/bank.ts, and confirmed none of them reference a phone- or
// laptop-specific field -- only a scene's own QuestionDef.apply(), its BANK
// array, and its pool functions. This file is that block, moved once and
// made generic over whatever Scene/Ctx/Constraints/Signals/Sku/ModelRec/
// Option shape a scene defines. Each scene's bank.ts re-exports these under
// its own types so every existing import keeps working (same pattern as
// core/{rng,types}.ts).
//
// Pool logic (poolOf, rank, mergeConstraints, mergeSignals) and the BANK
// content itself stay in each scene's own pool.ts/bank.ts: that's what makes
// a phone scene a phone scene, and generalizing it would be the "a rule that
// fits the examples but not the data" mistake new-scene-playbook.md warns
// against. This file only takes those as a required interface (EngineDeps).
//
// `pre` (a question's precondition) also stays scene-supplied: phase 1 found
// no generic shape for it (it reads whatever scene-specific Ctx fields that
// question cares about), so it is passed into askable() rather than put on
// EngineQuestion.
//
// SC (the scene type) and OPT (the option type) are left as the scene's own
// types, not reinvented here: both phone's and laptop's Scene/Option are
// structurally identical already (see types.ts in each scene), so rather
// than define a narrower EngineScene/EngineOption and lose fields on the
// round trip, this file is generic over whatever concrete SC/OPT a scene
// passes in, bounded only by the handful of fields these functions actually
// read.

// Constraints always carry these three fields in every scene found so far
// (phone, laptop): the fixed model, the turned-down list and a price
// ceiling. derive()'s excluded/fixed folding and optionsFor()'s "keep my
// budget" special case both read them directly, so they are a required
// bound on C rather than a per-call callback.
export interface EngineConstraints {
  model?: string;
  excluded?: string[];
  maxPrice?: number;
}

// The fields these functions read off a scene's own Scene type. SC itself
// (the type parameter) stays the scene's full type, so sc.demoed,
// sc.recommended etc. survive every round trip untouched.
export interface EngineSceneFields {
  answers: Record<string, { picks: string[]; turn: number }>;
  order: string[];
  excluded: string[];
  fixed?: string;
  turn: number;
}

// The fields these functions read off a scene's own Option type.
export interface EngineOptionFields {
  id: string;
  neutral?: boolean;
  param?: unknown;
}

export interface EngineQuestion<C, S, Ctx, Opt extends EngineOptionFields> {
  id: string;
  kind: "hard" | "soft" | "route" | "resolve";
  options(ctx: Ctx): Opt[];
  apply(picks: string[]): { c?: C; s?: S };
}

export interface EngineCtx<C, S, Sku, Model, SC extends EngineSceneFields> {
  sc: SC;
  c: C;
  s: S;
  pool: Sku[];
  ranked: Model[];
  model: string | null;
}

// What a scene must supply for this block to run over its own pool shape.
// Not shared code: each scene's pool.ts/bank.ts implements these against its
// own Constraints/Signals/Sku/ModelRec/QuestionDef/Scene/Option types.
export interface EngineDeps<
  C extends EngineConstraints,
  S,
  Sku,
  Model,
  SC extends EngineSceneFields,
  Opt extends EngineOptionFields,
  Q extends EngineQuestion<C, S, EngineCtx<C, S, Sku, Model, SC>, Opt>,
> {
  bank: Q[];
  questionById(id: string): Q;
  mergeConstraints(a: C, b: C): C;
  mergeSignals(a: S, b: S): S;
  poolOf(c: C): Sku[];
  modelIds(pool: Sku[]): string[];
  rank(pool: Sku[], s: S): Model[];
  emptyConstraints: C;
  emptySignals: S;
  // Builds a copy of a scene with an answer overridden/removed and its
  // `order` adjusted. Scene-supplied because SC has fields (demoed, carried,
  // wantsMore, ...) this file never touches and must not drop on a copy.
  withAnswer(sc: SC, qid: string, picks: string[] | null): SC;
}

type Ctx<C extends EngineConstraints, S, Sku, Model, SC extends EngineSceneFields> = EngineCtx<C, S, Sku, Model, SC>;
type Deps<C extends EngineConstraints, S, Sku, Model, SC extends EngineSceneFields, Opt extends EngineOptionFields, Q extends EngineQuestion<C, S, Ctx<C, S, Sku, Model, SC>, Opt>> = EngineDeps<
  C,
  S,
  Sku,
  Model,
  SC,
  Opt,
  Q
>;

export function derive<C extends EngineConstraints, S, Sku, Model, SC extends EngineSceneFields, Opt extends EngineOptionFields, Q extends EngineQuestion<C, S, Ctx<C, S, Sku, Model, SC>, Opt>>(
  deps: Deps<C, S, Sku, Model, SC, Opt, Q>,
  sc: SC,
): Ctx<C, S, Sku, Model, SC> {
  let c: C = deps.emptyConstraints;
  let s: S = deps.emptySignals;
  for (const qid of sc.order) {
    const a = sc.answers[qid];
    if (!a) continue;
    const k = deps.questionById(qid).apply(a.picks);
    if (k.c) c = deps.mergeConstraints(c, k.c);
    if (k.s) s = deps.mergeSignals(s, k.s);
  }
  if (sc.excluded.length) c = deps.mergeConstraints(c, { excluded: sc.excluded } as C);
  if (sc.fixed) c = { ...c, model: sc.fixed };
  const pool = deps.poolOf(c);
  const ids = deps.modelIds(pool);
  return { sc, c, s, pool, ranked: deps.rank(pool, s), model: sc.fixed ?? (ids.length === 1 ? ids[0]! : null) };
}

// The scene as it was before this question was answered, for generating the
// options of a reopen: "what else could the answer be, holding the rest
// fixed". The original scene stays on ctx.sc, so "you said X, still right?"
// can quote it.
export function withoutAnswer<
  C extends EngineConstraints,
  S,
  Sku,
  Model,
  SC extends EngineSceneFields,
  Opt extends EngineOptionFields,
  Q extends EngineQuestion<C, S, Ctx<C, S, Sku, Model, SC>, Opt>,
>(deps: Deps<C, S, Sku, Model, SC, Opt, Q>, ctx: Ctx<C, S, Sku, Model, SC>, qid: string): Ctx<C, S, Sku, Model, SC> {
  const sc = deps.withAnswer(ctx.sc, qid, null);
  return { ...derive(deps, sc), sc: ctx.sc };
}

// What the pool would be if this question had these picks (without changing the scene).
export function rowsIf<
  C extends EngineConstraints,
  S,
  Sku,
  Model,
  SC extends EngineSceneFields,
  Opt extends EngineOptionFields,
  Q extends EngineQuestion<C, S, Ctx<C, S, Sku, Model, SC>, Opt>,
>(deps: Deps<C, S, Sku, Model, SC, Opt, Q>, ctx: Ctx<C, S, Sku, Model, SC>, qid: string, picks: string[]): number {
  const sc = deps.withAnswer(ctx.sc, qid, picks);
  return derive(deps, sc).pool.length;
}

// The options a customer actually sees: for questions that narrow the pool,
// only picks that narrow it or are explicitly neutral. An option that would
// change nothing would be a question worth nothing. The "keep my current
// budget" option is the one place a hard question's own current answer must
// survive even though re-picking it narrows nothing further.
export function optionsFor<
  C extends EngineConstraints,
  S,
  Sku,
  Model,
  SC extends EngineSceneFields,
  Opt extends EngineOptionFields,
  Q extends EngineQuestion<C, S, Ctx<C, S, Sku, Model, SC>, Opt>,
>(deps: Deps<C, S, Sku, Model, SC, Opt, Q>, ctx: Ctx<C, S, Sku, Model, SC>, q: Q): Opt[] {
  const all = q.options(ctx);
  if (q.kind !== "hard") return all;
  return all.filter((o) => o.neutral || o.param || rowsIf(deps, ctx, q.id, [o.id]) < ctx.pool.length || (o.id.startsWith("ceiling:") && o.id === `ceiling:${ctx.c.maxPrice}`));
}

// Worth asking: not asked yet (or a resolving question the customer was
// unsure about), its own precondition holds, and for hard questions at least
// one answer would narrow the pool.
export function askable<
  C extends EngineConstraints,
  S,
  Sku,
  Model,
  SC extends EngineSceneFields,
  Opt extends EngineOptionFields,
  Q extends EngineQuestion<C, S, Ctx<C, S, Sku, Model, SC>, Opt>,
>(deps: Deps<C, S, Sku, Model, SC, Opt, Q>, ctx: Ctx<C, S, Sku, Model, SC>, pre: (q: Q, ctx: Ctx<C, S, Sku, Model, SC>) => boolean): Q[] {
  return deps.bank.filter((q) => {
    const a = ctx.sc.answers[q.id];
    if (a && !(q.kind === "resolve" && a.picks.includes("notsure"))) return false;
    if (!pre(q, ctx)) return false;
    const opts = optionsFor(deps, ctx, q);
    if (q.kind === "hard" || q.kind === "resolve") return opts.some((o) => !o.neutral);
    return opts.length > 1;
  });
}

// Questions already answered that the customer could be asked to confirm
// again. With nothing left in the pool, only a question whose reopening
// could bring something back is worth reopening; the rest would be a menu of
// dead ends.
export function reopenable<
  C extends EngineConstraints,
  S,
  Sku,
  Model,
  SC extends EngineSceneFields,
  Opt extends EngineOptionFields,
  Q extends EngineQuestion<C, S, Ctx<C, S, Sku, Model, SC>, Opt>,
>(deps: Deps<C, S, Sku, Model, SC, Opt, Q>, ctx: Ctx<C, S, Sku, Model, SC>): Q[] {
  return ctx.sc.order
    .map((id) => deps.questionById(id))
    .filter((q) => q.kind !== "route" && (ctx.sc.answers[q.id]?.picks.length ?? 0) > 0)
    .filter((q) => ctx.pool.length > 0 || withoutAnswer(deps, ctx, q.id).pool.length > 0);
}

// How much a question would narrow the pool: the share of rows the worst
// non-neutral answer still leaves, inverted. Soft questions get a flat,
// lower score, since they only reorder.
export function gain<
  C extends EngineConstraints,
  S,
  Sku,
  Model,
  SC extends EngineSceneFields,
  Opt extends EngineOptionFields,
  Q extends EngineQuestion<C, S, Ctx<C, S, Sku, Model, SC>, Opt>,
>(deps: Deps<C, S, Sku, Model, SC, Opt, Q>, ctx: Ctx<C, S, Sku, Model, SC>, q: Q): number {
  if (q.kind === "soft") return 0.25;
  if (q.kind === "route") return 0.1;
  const opts = optionsFor(deps, ctx, q).filter((o) => !o.neutral && !o.param);
  if (opts.length === 0) return 0;
  const left = opts.map((o) => rowsIf(deps, ctx, q.id, [o.id]) / ctx.pool.length);
  return 1 - left.reduce((a, b) => a + b, 0) / left.length;
}

// ---------------------------------------------------------------------------
// Phase 2 step 2: the turn protocol (src/shared/talk/scene.ts).
//
// Diffed in full against scenes/laptop/scene.ts
// (docs/conversation-model/core-extraction-proposal.md section 1). Most of it
// never read a phone- or laptop-specific field -- only Pending/StaffAct
// (already generic, core/types.ts), Ctx/Constraints (already generic, above)
// and a handful of scene-supplied facts. Moved here as-is.
//
// Three real exceptions turned out to be deeper than phase 1's diff guessed,
// so they are NOT generalized here and stay duplicated in each scene's own
// scene.ts, honestly, rather than forced into a hook built from only two data
// points (new-scene-playbook.md's "a rule that fits the examples but not the
// data"):
//   - confirm: once the pool is down to one SKU, which extra changes to offer
//     (colour/storage for phone; colour/storage/memory for laptop, since
//     laptops have a memory axis phones don't) and what each pick does.
//   - reconfirm: same story for the carried-wishes check (`sc.carried`'s
//     shape itself differs: phone has {colours, minGB}, laptop has {colours,
//     minMemoryGb, minStorageGb}).
//   - keepPreferences: phone's storage tier is a string ("512GB"/"1TB") that
//     needs unit parsing; laptop's is a plain number. Small, but tied to
//     `carried`'s shape above, so it travels with the same exception.
// A genuinely different third scene (device-service) is what should decide
// whether these three deserve a real hook or are just always scene-owned --
// not a guess made here from two purchase scenes.
//
// What IS generalized: offering and reacting to demos, asking questions
// (including reopens and throw-backs), the recommend loop (behind one real
// hook -- which candidates are eligible, since phone gates an unshown
// foldable and laptop has no such gate), the nudge/rescue path when nothing
// fits, turning a model down and bringing it back, validating a pick against
// the menu, and the sign-off on ending. That is the large majority of
// scene.ts's ~470 lines.

// ---- relaxing a requirement that left nothing ----

export interface EngineRelaxMove {
  id: string;
  label: string;
}

// `key as keyof C` deletions are inherently type-loose for a generic object
// (TS cannot know every C's properties are optional), same idiom the
// original scene.ts used concretely; kept to one narrow `any` rather than
// spreading casts through the rest of the function, which stays fully typed.
export function relaxMoves<C extends EngineConstraints, Sku extends { price: number }>(
  c: C,
  keyText: Partial<Record<string, string>>,
  poolOf: (c: C) => Sku[],
  ceil100: (n: number) => number,
  moneyFmt: (n: number) => string,
): EngineRelaxMove[] {
  const without = (base: C, ...keys: string[]): C => {
    const next = { ...base } as Record<string, unknown>;
    for (const k of keys) delete next[k];
    return next as C;
  };
  const moves: EngineRelaxMove[] = [];
  const keys = Object.keys(keyText);
  for (const key of keys) {
    if ((c as Record<string, unknown>)[key] === undefined) continue;
    if (poolOf(without(c, key)).length > 0) moves.push({ id: `drop:${key}`, label: `Give up ${keyText[key]}` });
  }
  if (moves.length === 0) {
    const present = keys.filter((k) => (c as Record<string, unknown>)[k] !== undefined);
    for (let i = 0; i < present.length; i++)
      for (let j = i + 1; j < present.length; j++) {
        if (poolOf(without(c, present[i]!, present[j]!)).length > 0) moves.push({ id: `drop:${present[i]}+${present[j]}`, label: `Give up ${keyText[present[i]!]} and ${keyText[present[j]!]}` });
      }
  }
  if (c.maxPrice !== undefined) {
    const looser = without(c, "maxPrice");
    const next = [...new Set(poolOf(looser).map((r) => ceil100(r.price)))].filter((p) => p > c.maxPrice!).sort((a, b) => a - b);
    for (const p of next.slice(0, 2)) moves.push({ id: `raise:${p}`, label: `Raise my budget to ${moneyFmt(p)}` });
  }
  return moves;
}

// ---- small, independently-typed pieces of the turn protocol ----
//
// Rather than relocate staffActs/applyStaff/customerMenu/applyCustomer
// wholesale behind one large parameterized dependency object, each piece
// that is genuinely a pure, self-contained rule is pulled out as its own
// small function with its own plain parameters. This is deliberately more
// conservative than designing one big generic state machine from two data
// points (the trap this whole exercise exists to avoid) -- staffActs,
// applyStaff, customerMenu and applyCustomer themselves stay in each scene's
// scene.ts, now calling these shared pieces instead of duplicating their
// bodies. The three exceptions found while doing this (confirm, reconfirm,
// keepPreferences -- see the comment above relaxMoves) are NOT pulled out:
// their logic stays scene-owned, honestly, since the shape it needs differs
// in ways two data points don't justify guessing an interface for yet.

export interface EngineActView {
  act: unknown;
  label: string;
  gain: number;
  hint: string;
}

// "n -> a / b / c" (or "N models -> a / b / c" when the answer only changes
// rows, not which models survive): the staff-side hint for how much an
// answer would split the pool. Scene-agnostic: it only reads pool/ranked
// counts via the two callbacks given to it.
export function hintText(poolLen: number, rankedLen: number, perOptionModelCounts: number[], perOptionRowCounts: number[]): string {
  const cap = (xs: number[]): string => (xs.length > 6 ? `${xs.slice(0, 6).join(" / ")} …` : xs.join(" / "));
  if (perOptionModelCounts.every((n) => n === rankedLen)) return `${poolLen} options → ${cap(perOptionRowCounts)}`;
  return `${rankedLen} models → ${cap(perOptionModelCounts)}`;
}

// Validates a customer's picks against the menu they were shown: non-empty,
// single unless multi, each pick either a listed option id or within a
// parameterised option's range/step. Scene-agnostic -- Option's `param` shape
// is already generic (core/types.ts).
export function validatePicks<Opt extends EngineOptionFields & { param?: { prefix: string; min: number; max: number; step: number } }>(picks: string[], options: Opt[], multi: boolean): string | null {
  if (picks.length === 0) return "pick something";
  if (!multi && picks.length > 1) return "pick one";
  for (const pick of picks) {
    if (options.some((o) => o.id === pick && !o.param)) continue;
    const p = options.find((o) => o.param && pick.startsWith(o.param.prefix));
    if (p?.param) {
      const n = Number(pick.slice(p.param.prefix.length));
      if (Number.isFinite(n) && n >= p.param.min && n <= p.param.max && n % p.param.step === 0) continue;
    }
    return `"${pick}" is not on the menu`;
  }
  return null;
}

// A phone/laptop the customer has already seen is not offered again (they
// can still ask for it); one they said no to is not offered either.
export function demoCandidates<Model extends { id: string }>(ranked: Model[], demoed: string[], declinedDemo: string[]): string[] {
  return ranked.filter((m) => !declinedDemo.includes(m.id) && !demoed.includes(m.id)).slice(0, 4).map((m) => m.id);
}

// When nothing fits and the customer won't relax, the nearest models are the
// ones the pool would hold with the fewest constraints dropped.
export function nearestModels<C extends EngineConstraints, Sku extends { model: string }>(
  c: C,
  moves: EngineRelaxMove[],
  poolOf: (c: C) => Sku[],
  alreadyDemoed: string[],
): string[] {
  const found: string[] = [];
  for (const m of moves) {
    const next = { ...c } as Record<string, unknown>;
    if (m.id.startsWith("drop:")) for (const key of m.id.slice(5).split("+")) delete next[key];
    else next.maxPrice = Number(m.id.slice(6));
    for (const r of poolOf(next as C)) if (!found.includes(r.model) && !alreadyDemoed.includes(r.model)) found.push(r.model);
  }
  return found.slice(0, 2);
}

// Recommend eligibility is the one real hook in the recommend loop (phone
// gates an unshown foldable; laptop has no such gate) -- this just applies
// whatever predicate the scene supplies and caps the list, since that part
// (take the top 3 eligible) is identical in both scenes.
export function eligibleRecommendations<Model>(ranked: Model[], eligible: (m: Model) => boolean, max = 3): Model[] {
  return ranked.filter(eligible).slice(0, max);
}
