import { MODELS, modelById } from "./data.ts";
import { mergeConstraints, mergeSignals, modelIds, poolOf, priceBands, rank, screenBand, type Constraints, type ScreenBand, type Signals } from "./pool.ts";
import type { Ctx, Option, Scene } from "./types.ts";

// The question bank. A question is what staff can ask; it says when it is
// worth asking (pre), what the customer can answer (options, generated from the
// pool so every option really splits it), and what an answer does to the
// constraints and signals (apply). Because the scene's state is a fold over
// the answers, reopening a question is just replacing its answer.
//
// Built from the questions that appeared in docs/conversation-model/transcripts/
// (rounds 1 and 2); the wording here is the neutral base, tone is added in lines.ts.

export interface Contribution {
  c?: Constraints;
  s?: Signals;
  fix?: string; // the customer named this model
  route?: string; // how the visit goes from here (opening_intent)
  end?: string; // the customer is done: "other" desk
  wanted?: string; // a model we do not carry
  gift?: boolean;
}

export interface QuestionDef {
  id: string;
  // hard: narrows the pool; soft: only reorders it; route: steers the visit;
  // resolve: pins down the final storage or colour, so "Not sure" is not an answer to stop on.
  kind: "hard" | "soft" | "route" | "resolve";
  multi?: boolean;
  ask(ctx: Ctx, reopen: boolean): string;
  pre(ctx: Ctx): boolean;
  options(ctx: Ctx): Option[];
  apply(picks: string[]): Contribution;
}

export function newScene(): Scene {
  return {
    answers: {},
    order: [],
    excluded: [],
    demoed: [],
    recommended: [],
    declinedDemo: [],
    relaxDeclined: 0,
    gift: false,
    patience: 8,
    turn: 0,
    toMove: "staff",
    pending: null,
    owed: null,
    forced: null,
    ended: null,
    log: [],
  };
}

// ---- helpers ----

export const money = (n: number): string => `A$${n.toLocaleString("en-AU")}`;
// The ceiling the customer last gave, if they gave a number ("No real limit" is not one).
const givenCeiling = (ctx: Ctx): number | null => {
  const had = ctx.sc.answers["budget_ceiling"]?.picks[0];
  return had?.startsWith("ceiling:") ? Number(had.slice("ceiling:".length)) : null;
};
const NOTSURE: Option = { id: "notsure", label: "Not sure", neutral: true };
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const nameOf = (id: string): string => modelById(id).name;
// A reopened question can come up after the model has been dropped again, so its wording can't assume one.
const thePhone = (ctx: Ctx): string => (ctx.model ? nameOf(ctx.model) : "phone");
const valueOf = (picks: string[], prefix: string): string | undefined => picks.find((p) => p.startsWith(prefix))?.slice(prefix.length);
const pickedIds = (picks: string[], prefix: string): string[] => picks.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
const poolModels = (ctx: Ctx) => ctx.ranked;
const varies = (vals: unknown[]): boolean => new Set(vals).size > 1;

export function describeConstraints(c: Constraints): string[] {
  const out: string[] = [];
  if (c.model) out.push(nameOf(c.model));
  if (c.lines) out.push(`the ${c.lines.map((l) => (l === "air" ? "Air" : l === "duo" ? "Duo" : l)).join(" or ")} line`);
  if (c.foldable === true) out.push("a foldable");
  if (c.foldable === false) out.push("a standard phone");
  if (c.screen) out.push(`a ${c.screen} screen`);
  if (c.maxScreenIn !== undefined) out.push("a smaller screen");
  if (c.separateTelephoto) out.push("a separate telephoto lens");
  if (c.minBattery !== undefined) out.push(`${c.minBattery}+ hours of video playback`);
  if (c.minGB !== undefined) out.push(`at least ${c.minGB >= 1024 ? c.minGB / 1024 + "TB" : c.minGB + "GB"}`);
  if (c.storage) out.push(c.storage);
  if (c.colours) out.push(c.colours.join(" or "));
  if (c.maxPrice !== undefined) out.push(`up to ${money(c.maxPrice)}`);
  return out;
}

// ---- the bank ----

const lineLabel = (ids: string[]): string => ids.map(nameOf).join(", ");
const LINE_NAMES: Record<string, string> = { "18": "18 line", "17": "17 line", air: "Air", "16": "16", duo: "Duo" };

export const BANK: QuestionDef[] = [
  {
    id: "opening_intent",
    kind: "route",
    ask: () => "Hi, welcome in. I'm on the phones table. What brings you in today?",
    pre: (ctx) => ctx.sc.turn === 0 && !ctx.sc.fixed,
    options: () => [
      { id: "know", label: "I know which phone I want" },
      { id: "line", label: "I have a model line in mind" },
      { id: "help", label: "I want help choosing" },
      { id: "browse", label: "I'm just looking" },
      { id: "other", label: "Something else (repair, accessory)" },
    ],
    apply: (picks) => (picks[0] === "other" ? { route: "other", end: "other" } : { route: picks[0] }),
  },
  {
    id: "known_model",
    kind: "route",
    ask: (ctx) => (ctx.sc.log.length === 0 ? "Hi, welcome in. I'm on the phones table. Did you already have a phone in mind?" : "Which one did you have in mind?"),
    pre: (ctx) => !ctx.sc.fixed && ctx.pool.length > 0 && [undefined, "know"].includes(ctx.sc.answers["opening_intent"]?.picks[0]),
    options: () => [
      ...MODELS.map((m) => ({ id: `model:${m.id}`, label: m.name })),
      { id: "unlisted:iPhone 16 Plus", label: "iPhone 16 Plus (not on this list)" },
      { id: "unlisted:iPhone 17 Pro", label: "iPhone 17 Pro (not on this list)" },
      { id: "gift", label: "It's a gift for someone else", neutral: true },
      { id: "notyet", label: "Not yet, show me options", neutral: true },
      NOTSURE,
    ],
    apply: (picks) => {
      const m = valueOf(picks, "model:");
      const u = valueOf(picks, "unlisted:");
      return { fix: m, wanted: u, gift: picks.includes("gift") || undefined, c: m ? { model: m } : undefined };
    },
  },
  {
    id: "model_family",
    kind: "hard",
    ask: () => "Which line are you thinking of?",
    pre: (ctx) => ctx.sc.answers["opening_intent"]?.picks[0] === "line" && ctx.c.lines === undefined && uniq(ctx.ranked.map((m) => m.line)).length > 1,
    options: (ctx) => [
      ...uniq(ctx.ranked.map((m) => m.line)).map((l) => ({
        id: `line:${l}`,
        label: `${LINE_NAMES[l]} (${lineLabel(ctx.ranked.filter((m) => m.line === l).map((m) => m.id))})`,
      })),
      NOTSURE,
    ],
    // "Not sure" picks no line, and an empty list of allowed lines would mean no phone at all.
    apply: (picks) => {
      const lines = pickedIds(picks, "line:");
      return lines.length ? { c: { lines } } : {};
    },
  },
  {
    id: "use_case",
    kind: "soft",
    multi: true,
    ask: (ctx) => `What will ${ctx.sc.gift ? "they" : "you"} mainly use it for? Pick as many as apply.`,
    pre: (ctx) => ctx.ranked.length > 1,
    options: () => [
      { id: "photos", label: "Photos" },
      { id: "video", label: "Video" },
      { id: "travel", label: "Travel" },
      { id: "streaming", label: "Watching videos and streaming" },
      { id: "social", label: "Social media and messaging" },
      { id: "games", label: "Games" },
      { id: "work", label: "Work and email" },
      { id: "basics", label: "Just calls and the basics" },
      NOTSURE,
    ],
    apply: (picks) => ({
      s: {
        photos: picks.includes("photos") || undefined,
        video: picks.includes("video") || undefined,
        battery: picks.includes("travel") || picks.includes("streaming") || undefined,
      },
    }),
  },
  {
    id: "form_factor",
    kind: "hard",
    ask: () => "Standard phone, or are you open to a foldable?",
    pre: (ctx) => varies(poolModels(ctx).map((m) => m.foldable)),
    options: () => [
      { id: "standard", label: "A standard phone" },
      { id: "fold", label: "I want a foldable" },
      { id: "open", label: "Open to a foldable", neutral: true },
      NOTSURE,
    ],
    apply: (picks) => (picks[0] === "standard" ? { c: { foldable: false } } : picks[0] === "fold" ? { c: { foldable: true } } : {}),
  },
  {
    id: "screen_size_pref",
    kind: "hard",
    ask: () => "What screen size are you after?",
    pre: (ctx) => uniq(poolModels(ctx).map((m) => screenBand(m.screenIn))).length > 1,
    options: (ctx) => {
      const present = uniq(poolModels(ctx).map((m) => screenBand(m.screenIn)));
      const label: Record<ScreenBand, string> = { compact: 'Compact (about 6.1")', medium: 'Medium (about 6.3")', large: 'Large (6.5" or bigger)' };
      return [...(["compact", "medium", "large"] as ScreenBand[]).filter((b) => present.includes(b)).map((b) => ({ id: `screen:${b}`, label: label[b] })), NOTSURE];
    },
    apply: (picks) => {
      const b = valueOf(picks, "screen:") as ScreenBand | undefined;
      return b ? { c: { screen: b }, s: b === "large" ? { bigScreen: true } : {} } : {};
    },
  },
  {
    id: "telephoto_need",
    kind: "hard",
    ask: () => "Most of our phones get their 2x zoom by cropping the main camera, which Apple calls optical-quality 2x. Only some have a separate telephoto lens as well. Do you want a separate telephoto lens?",
    pre: (ctx) => varies(poolModels(ctx).map((m) => m.separateTelephoto)),
    options: () => [
      { id: "yes", label: "Yes, a separate telephoto lens" },
      { id: "no", label: "No, the 2x from the main camera is enough", neutral: true },
      NOTSURE,
    ],
    apply: (picks) => (picks[0] === "yes" ? { c: { separateTelephoto: true } } : {}),
  },
  {
    id: "battery_priority",
    kind: "hard",
    ask: () => "How long does the battery need to last?",
    pre: (ctx) => poolModels(ctx).some((m) => m.batteryHours !== null) && varies(poolModels(ctx).map((m) => m.batteryHours === null || m.batteryHours >= 40)),
    options: () => [
      { id: "min:40", label: "As long as possible (40+ hours of video)" },
      { id: "min:30", label: "Long (30+ hours of video)" },
      { id: "avg", label: "Average is fine", neutral: true },
      NOTSURE,
    ],
    apply: (picks) => {
      const n = valueOf(picks, "min:");
      return n ? { c: { minBattery: Number(n) }, s: { battery: true } } : {};
    },
  },
  {
    id: "weight_pref",
    kind: "soft",
    ask: () => "Does a light, slim phone matter to you?",
    pre: (ctx) => varies(poolModels(ctx).map((m) => m.weightG)),
    options: () => [
      { id: "max", label: "Yes, as light as possible" },
      { id: "some", label: "A bit" },
      { id: "no", label: "Doesn't matter", neutral: true },
      NOTSURE,
    ],
    apply: (picks) => (picks[0] === "max" || picks[0] === "some" ? { s: { light: true } } : {}),
  },
  {
    id: "hardware_features",
    kind: "soft",
    multi: true,
    ask: () => "Do any of these matter to you?",
    pre: (ctx) => featuresThatVary(ctx).length > 0,
    options: (ctx) => [
      ...featuresThatVary(ctx).map((f) => ({ id: f, label: FEATURE_LABEL[f] })),
      { id: "none", label: "None of these matter", neutral: true },
      NOTSURE,
    ],
    apply: (picks) => ({ s: { features: picks.filter((p): p is "cameraControl" | "dynamicIsland" | "promotion" => p in FEATURE_LABEL) } }),
  },
  {
    id: "storage_need",
    kind: "hard",
    ask: () => "What's the least storage you'd want?",
    // Once the model is down to one, the tier question below does this job.
    pre: (ctx) => ctx.model === null && ctx.c.storage === undefined && uniq(ctx.pool.map((r) => r.gb)).length > 1,
    options: (ctx) => [...uniq(ctx.pool.map((r) => r.gb)).sort((a, b) => a - b).map((gb) => ({ id: `min:${gb}`, label: gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB` })), NOTSURE],
    apply: (picks) => {
      const n = valueOf(picks, "min:");
      return n ? { c: { minGB: Number(n) } } : {};
    },
  },
  {
    id: "budget_ceiling",
    kind: "hard",
    ask: (ctx, reopen) => {
      const n = givenCeiling(ctx);
      return reopen && n !== null ? `You said up to ${money(n)}. Still right?` : "What's the most you'd like to spend?";
    },
    pre: (ctx) => priceBands(ctx.pool).length > 0,
    options: (ctx) => {
      const n = givenCeiling(ctx);
      const bands = priceBands(ctx.pool);
      return [
        ...(n !== null ? [{ id: `ceiling:${n}`, label: `Yes, up to ${money(n)} stays` }] : []),
        ...bands.filter((b) => b !== n).map((b) => ({ id: `ceiling:${b}`, label: `Up to ${money(b)}` })),
        { id: "nolimit", label: "No real limit", neutral: true },
        { id: "ceiling:own", label: "Set my own ceiling (A$100 steps)", param: { prefix: "ceiling:", min: 100, max: 6000, step: 100 } },
        NOTSURE,
      ];
    },
    apply: (picks) => {
      const n = valueOf(picks, "ceiling:");
      return n !== undefined && Number.isFinite(Number(n)) ? { c: { maxPrice: Number(n) } } : {};
    },
  },
  {
    id: "colour_prefs",
    kind: "hard",
    multi: true,
    ask: () => "Is there a colour that catches your eye?",
    pre: (ctx) => !ctx.model && uniq(ctx.pool.map((r) => r.colour)).length > 1,
    options: (ctx) => [...uniq(ctx.pool.map((r) => r.colour)).sort().map((col) => ({ id: `colour:${col}`, label: col })), NOTSURE],
    apply: (picks) => {
      const cols = pickedIds(picks, "colour:");
      return cols.length ? { c: { colours: cols } } : {};
    },
  },
  {
    id: "size_fit_check",
    kind: "hard",
    ask: (ctx) => {
      const lead = ctx.ranked[0];
      return lead ? `The ${lead.name} has a ${lead.screenIn}" screen${lead.weightG ? ` and weighs ${lead.weightG}g` : ""}. Is that size what you're after?` : "Is the screen size right for you?";
    },
    pre: (ctx) => ctx.ranked.length > 0 && ctx.ranked[0]!.screenIn >= 6.5 && ctx.ranked.some((m) => m.screenIn < ctx.ranked[0]!.screenIn),
    options: (ctx) => [
      { id: "fine", label: "Yes, that size is fine", neutral: true },
      ...(ctx.ranked[0] ? [{ id: `smaller:${ctx.ranked[0].screenIn}`, label: "Too big, show me something smaller" }] : []),
      NOTSURE,
    ],
    apply: (picks) => {
      const n = valueOf(picks, "smaller:");
      return n ? { c: { maxScreenIn: Number(n) - 0.05 } } : {};
    },
  },
  {
    id: "storage_tier_for_model",
    kind: "resolve",
    ask: (ctx) => `The ${thePhone(ctx)} comes in ${uniq(ctx.pool.map((r) => r.storage)).join(", ")}. Which one?`,
    pre: (ctx) => ctx.model !== null && uniq(ctx.pool.map((r) => r.storage)).length > 1,
    options: (ctx) => [
      ...uniq(ctx.pool.map((r) => r.storage)).map((st) => ({ id: `storage:${st}`, label: `${st} (${money(Math.min(...ctx.pool.filter((r) => r.storage === st).map((r) => r.price)))})` })),
      ...(ctx.sc.answers["storage_tier_for_model"]?.picks.includes("notsure") ? [] : [NOTSURE]),
    ],
    apply: (picks) => {
      const st = valueOf(picks, "storage:");
      return st ? { c: { storage: st } } : {};
    },
  },
  {
    id: "colour_pick",
    kind: "resolve",
    ask: (ctx, reopen) => (reopen ? "Which colour would you like instead?" : `Which colour for the ${thePhone(ctx)}?`),
    pre: (ctx) => ctx.model !== null && uniq(ctx.pool.map((r) => r.colour)).length > 1,
    options: (ctx) => {
      const here = uniq(ctx.pool.map((r) => r.colour));
      const others = uniq(MODELS.flatMap((m) => m.colours)).filter((col) => !here.includes(col)).sort();
      return [
        ...here.map((col) => ({ id: `colour:${col}`, label: col })),
        ...others.map((col) => ({ id: `colour:${col}`, label: `Another colour: ${col}`, group: "other colours" })),
        ...(ctx.sc.answers["colour_pick"]?.picks.includes("notsure") ? [] : [NOTSURE]),
      ];
    },
    apply: (picks) => {
      const cols = pickedIds(picks, "colour:");
      return cols.length ? { c: { colours: cols } } : {};
    },
  },
];

const FEATURE_LABEL = { cameraControl: "Camera Control button", dynamicIsland: "Dynamic Island", promotion: "Smoother 120Hz screen" } as const;
function featuresThatVary(ctx: Ctx): (keyof typeof FEATURE_LABEL)[] {
  return (Object.keys(FEATURE_LABEL) as (keyof typeof FEATURE_LABEL)[]).filter((f) => poolModels(ctx).some((m) => m[f] === true) && poolModels(ctx).some((m) => m[f] !== true));
}

export const questionById = (id: string): QuestionDef => {
  const q = BANK.find((x) => x.id === id);
  if (!q) throw new Error(`no such question: ${id}`);
  return q;
};

// ---- the scene as a fold over its answers ----

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

// The scene as it was before this question was answered, for generating the
// options of a reopen: "what else could the answer be, holding the rest fixed".
// The original scene stays on ctx.sc, so "you said X, still right?" can quote it.
export function withoutAnswer(ctx: Ctx, qid: string): Ctx {
  const sc: Scene = { ...ctx.sc, answers: { ...ctx.sc.answers }, order: ctx.sc.order.filter((q) => q !== qid) };
  delete sc.answers[qid];
  return { ...derive(sc), sc: ctx.sc };
}

// What the pool would be if this question had these picks (without changing the scene).
export function rowsIf(ctx: Ctx, qid: string, picks: string[]): number {
  const sc: Scene = { ...ctx.sc, answers: { ...ctx.sc.answers, [qid]: { picks, turn: ctx.sc.turn } }, order: ctx.sc.order.includes(qid) ? ctx.sc.order : [...ctx.sc.order, qid] };
  return derive(sc).pool.length;
}

// The options a customer actually sees: for questions that narrow the pool,
// only picks that narrow it or are explicitly neutral. An option that would
// change nothing would be a question worth nothing.
export function optionsFor(ctx: Ctx, q: QuestionDef): Option[] {
  const all = q.options(ctx);
  if (q.kind !== "hard") return all;
  return all.filter((o) => o.neutral || o.param || rowsIf(ctx, q.id, [o.id]) < ctx.pool.length || (o.id.startsWith("ceiling:") && o.id === `ceiling:${ctx.c.maxPrice}`));
}

// Worth asking: not asked yet (or a resolving question the customer was
// unsure about), its own precondition holds, and for hard questions at least
// one answer would narrow the pool.
export function askable(ctx: Ctx): QuestionDef[] {
  return BANK.filter((q) => {
    const a = ctx.sc.answers[q.id];
    if (a && !(q.kind === "resolve" && a.picks.includes("notsure"))) return false;
    if (!q.pre(ctx)) return false;
    const opts = optionsFor(ctx, q);
    if (q.kind === "hard" || q.kind === "resolve") return opts.some((o) => !o.neutral);
    return opts.length > 1;
  });
}

// Questions already answered that the customer could be asked to confirm
// again. With nothing left in the pool, only a question whose reopening could
// bring something back is worth reopening; the rest would be a menu of dead ends.
export const reopenable = (ctx: Ctx): QuestionDef[] =>
  ctx.sc.order
    .map(questionById)
    .filter((q) => q.kind !== "route" && (ctx.sc.answers[q.id]?.picks.length ?? 0) > 0)
    .filter((q) => ctx.pool.length > 0 || withoutAnswer(ctx, q.id).pool.length > 0);

// How much a question would narrow the pool: the share of rows the worst
// non-neutral answer still leaves, inverted. Soft questions get a flat, lower
// score, since they only reorder.
export function gain(ctx: Ctx, q: QuestionDef): number {
  if (q.kind === "soft") return 0.25;
  if (q.kind === "route") return 0.1;
  const opts = optionsFor(ctx, q).filter((o) => !o.neutral && !o.param);
  if (opts.length === 0) return 0;
  const left = opts.map((o) => rowsIf(ctx, q.id, [o.id]) / ctx.pool.length);
  return 1 - left.reduce((a, b) => a + b, 0) / left.length;
}
