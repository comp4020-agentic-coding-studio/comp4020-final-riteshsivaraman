import { MODELS, modelById } from "./data.ts";
import { mergeConstraints, mergeSignals, modelIds, poolOf, priceBands, rank, type Constraints, type Signals } from "./pool.ts";
import type { Ctx, Option, Scene } from "./types.ts";

// The laptop question bank. Same contract as src/shared/talk/bank.ts
// (phones): a question says when it is worth asking (pre), what the customer
// can answer (options, generated from the pool), and what an answer does to
// the constraints and signals (apply). derive(), withoutAnswer(), rowsIf(),
// optionsFor(), askable(), reopenable() and gain() below are copied from the
// phone bank nearly unchanged -- they only touch Ctx/Scene/QuestionDef, never
// a phone-specific field, which is the clearest evidence yet for
// new-scene-playbook.md's claim that this machinery is generic. See
// new-scene-playbook.md's updated "Generic today vs phone-specific" for what
// this means for the next refactor pass.

export interface Contribution {
  c?: Constraints;
  s?: Signals;
  fix?: string;
  route?: string;
  end?: string;
  wanted?: string;
  gift?: boolean;
}

export interface QuestionDef {
  id: string;
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
    carried: null,
    wantsMore: false,
    declinedDemo: [],
    relaxDeclined: 0,
    gift: false,
    patience: 8,
    turn: 0,
    toMove: "staff",
    pending: null,
    owed: null,
    owedPool: null,
    forced: null,
    ended: null,
    log: [],
  };
}

// ---- helpers ----

export const money = (n: number): string => `A$${n.toLocaleString("en-AU")}`;
const givenCeiling = (ctx: Ctx): number | null => {
  const had = ctx.sc.answers["budget_ceiling"]?.picks[0];
  return had?.startsWith("ceiling:") ? Number(had.slice("ceiling:".length)) : null;
};
const NOTSURE: Option = { id: "notsure", label: "Not sure about this", neutral: true };
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const gbText = (n: number): string => (n >= 1024 ? `${n / 1024}TB` : `${n}GB`);
const capitalise = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const nameOf = (id: string): string => modelById(id).name;
const theLaptop = (ctx: Ctx): string => (ctx.model ? nameOf(ctx.model) : "laptop");
const varies = (vals: unknown[]): boolean => new Set(vals).size > 1;
const orList = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);
const poolModels = (ctx: Ctx) => ctx.ranked;
const valueOf = (picks: string[], prefix: string): string | undefined => picks.find((p) => p.startsWith(prefix))?.slice(prefix.length);
const pickedIds = (picks: string[], prefix: string): string[] => picks.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
// Technical questions wait until staff know what it is for or what it should cost (same rule the phone bank uses).
const knowsBasics = (ctx: Ctx): boolean => !!(ctx.sc.answers["use_case"] || ctx.sc.answers["budget_ceiling"]);

// Once a laptop has been named by either side, staff say "it" (mirrors bank.ts's named()).
export function mentioned(text: string): string[] {
  const found: string[] = [];
  let rest = text;
  for (const m of [...MODELS].sort((a, b) => b.name.length - a.name.length)) {
    if (rest.includes(m.name)) {
      found.push(m.id);
      rest = rest.split(m.name).join(" ");
    }
  }
  return found;
}
export const named = (ctx: Ctx, id: string | null): boolean => {
  if (id === null) return false;
  for (let i = ctx.sc.log.length - 1; i >= 0; i--) {
    const m = mentioned(ctx.sc.log[i]!.text);
    if (m.length > 0) return m.length === 1 && m[0] === id;
  }
  return false;
};

export function describeConstraints(c: Constraints): string[] {
  const out: string[] = [];
  if (c.model) out.push(nameOf(c.model));
  if (c.family) out.push(c.family === "air" ? "the Air line" : "the Pro line");
  if (c.minMemoryGb !== undefined) out.push(`at least ${gbText(c.minMemoryGb)} of memory`);
  if (c.minStorageGb !== undefined && c.storage === undefined) out.push(`at least ${gbText(c.minStorageGb)} of storage`);
  if (c.storage) out.push(gbText(c.storage));
  if (c.colours) out.push(c.colours.join(" or "));
  if (c.maxWeightG !== undefined) out.push("something light to carry");
  if (c.minBattery !== undefined) out.push(`${c.minBattery}+ hours of battery`);
  if (c.minScreenIn !== undefined) out.push(`at least a ${c.minScreenIn}" screen`);
  if (c.maxScreenIn !== undefined) out.push("a smaller screen");
  if (c.minThunderboltGen !== undefined) out.push(`Thunderbolt ${c.minThunderboltGen}`);
  if (c.maxPrice !== undefined) out.push(`up to ${money(c.maxPrice)}`);
  return out;
}

// ---- the bank ----

export const BANK: QuestionDef[] = [
  {
    id: "opening_intent",
    kind: "route",
    ask: () => "Hi, welcome in. I'm on the Mac table. What brings you in today?",
    pre: (ctx) => ctx.sc.turn === 0 && !ctx.sc.fixed,
    options: () => [
      { id: "know", label: "I already have a laptop in mind" },
      { id: "line", label: "I know Air or Pro, not the exact model" },
      { id: "help", label: "I need help choosing" },
      { id: "browse", label: "Just browsing" },
      { id: "other", label: "I'm here about something else (repair, accessory)" },
    ],
    apply: (picks) => (picks[0] === "other" ? { route: "other", end: "other" } : { route: picks[0] }),
  },
  {
    id: "known_model",
    kind: "route",
    ask: (ctx) => (ctx.sc.log.length === 0 ? "Hi, welcome in. I'm on the Mac table. Did you already have a laptop in mind?" : "Which one did you have in mind?"),
    pre: (ctx) => !ctx.sc.fixed && ctx.pool.length > 0 && [undefined, "know"].includes(ctx.sc.answers["opening_intent"]?.picks[0]),
    options: () => [
      ...MODELS.map((m) => ({ id: `model:${m.id}`, label: `Name the ${m.name}` })),
      { id: "gift", label: "Say it's a gift", neutral: true },
      { id: "notyet", label: "No model in mind yet", neutral: true },
      NOTSURE,
    ],
    apply: (picks) => {
      const m = valueOf(picks, "model:");
      return { fix: m, gift: picks.includes("gift") || undefined, c: m ? { model: m } : undefined };
    },
  },
  {
    id: "model_family",
    kind: "hard",
    ask: () => "Are you thinking Air or Pro?",
    pre: (ctx) => ctx.sc.answers["opening_intent"]?.picks[0] === "line" && ctx.c.family === undefined && uniq(ctx.ranked.map((m) => m.family)).length > 1,
    options: (ctx) => [
      ...uniq(ctx.ranked.map((m) => m.family)).map((f) => ({ id: `family:${f}`, label: f === "air" ? "MacBook Air" : "MacBook Pro" })),
      NOTSURE,
    ],
    apply: (picks) => {
      const f = valueOf(picks, "family:") as "air" | "pro" | undefined;
      return f ? { c: { family: f } } : {};
    },
  },
  {
    id: "use_case",
    kind: "soft",
    multi: true,
    ask: (ctx) => `What will ${ctx.sc.gift ? "they" : "you"} mainly use it for? Pick as many as apply.`,
    pre: (ctx) => ctx.ranked.length > 1,
    options: () => [
      { id: "office", label: "Office and email" },
      { id: "creative", label: "Photo or video editing" },
      { id: "study", label: "Study and browsing" },
      { id: "gaming", label: "Gaming" },
      { id: "dev", label: "Software development" },
      { id: "travel", label: "Travelling for work" },
      { id: "basics", label: "Just the basics" },
      NOTSURE,
    ],
    apply: (picks) => ({
      s: {
        portability: picks.includes("travel") || picks.includes("basics") || undefined,
        performance: picks.includes("creative") || picks.includes("gaming") || picks.includes("dev") || undefined,
        battery: picks.includes("travel") || undefined,
      },
    }),
  },
  {
    id: "portability_pref",
    kind: "soft",
    ask: () => "Does it need to be light enough to carry around a lot?",
    pre: (ctx) => varies(poolModels(ctx).map((m) => m.weightG)),
    options: () => [
      { id: "yes", label: "Yes, portability matters" },
      { id: "no", label: "Not really, it mostly stays put", neutral: true },
      NOTSURE,
    ],
    apply: (picks) => (picks[0] === "yes" ? { s: { portability: true } } : {}),
  },
  {
    id: "screen_size_pref",
    kind: "hard",
    ask: () => "What screen size are you after?",
    pre: (ctx) => uniq(poolModels(ctx).map((m) => m.screenIn)).length > 1,
    options: (ctx) => [...uniq(poolModels(ctx).map((m) => m.screenIn)).sort((a, b) => a - b).map((s) => ({ id: `screen:${s}`, label: `About ${s}"` })), NOTSURE],
    apply: (picks) => {
      const s = valueOf(picks, "screen:");
      return s ? { c: { minScreenIn: Number(s), maxScreenIn: Number(s) }, s: Number(s) >= 16 ? { screen: true } : {} } : {};
    },
  },
  {
    id: "performance_pref",
    kind: "soft",
    ask: () => "Do you need serious processing power (heavy editing, 3D, big builds), or is everyday performance enough?",
    // A technical question: only once the customer has shown (via use_case) that performance matters.
    pre: (ctx) => ctx.s.performance === true && varies(poolModels(ctx).map((m) => m.cpuCores)),
    options: () => [
      { id: "max", label: "Want the most power available" },
      { id: "some", label: "A bit more than everyday" },
      { id: "no", label: "Everyday performance is enough", neutral: true },
      NOTSURE,
    ],
    apply: (picks) => (picks[0] === "max" || picks[0] === "some" ? { s: { performance: true } } : {}),
  },
  {
    id: "battery_priority",
    kind: "hard",
    ask: () => "How long does the battery need to last on a charge?",
    pre: (ctx) => ctx.s.battery === true && varies(poolModels(ctx).map((m) => m.batteryHours >= 22)),
    options: () => [
      { id: "min:22", label: "Battery: as long as possible (22+ hours)" },
      { id: "avg", label: "Battery: average is fine", neutral: true },
      NOTSURE,
    ],
    apply: (picks) => {
      const n = valueOf(picks, "min:");
      return n ? { c: { minBattery: Number(n) }, s: { battery: true } } : {};
    },
  },
  {
    id: "longevity_pref",
    kind: "soft",
    ask: () => "Is this something that needs to keep up for several years, or more of a short-term need?",
    pre: (ctx) => knowsBasics(ctx) && varies(poolModels(ctx).map((m) => m.cpuCores)),
    options: () => [
      { id: "years", label: "Needs to last several years" },
      { id: "short", label: "Shorter-term, fine to replace sooner", neutral: true },
      NOTSURE,
    ],
    apply: (picks) => (picks[0] === "years" ? { s: { longevity: true } } : {}),
  },
  {
    id: "ports_need",
    kind: "hard",
    ask: () => "Do you need the fastest Thunderbolt ports for external displays or fast storage?",
    pre: (ctx) => knowsBasics(ctx) && varies(poolModels(ctx).map((m) => m.thunderboltGen)),
    options: () => [
      { id: "yes", label: "Yes, I need the fastest Thunderbolt" },
      { id: "no", label: "Standard ports are fine", neutral: true },
      NOTSURE,
    ],
    apply: (picks) => (picks[0] === "yes" ? { c: { minThunderboltGen: 5 } } : {}),
  },
  {
    id: "storage_need",
    kind: "hard",
    ask: () => "What's the least storage you'd want?",
    pre: (ctx) => ctx.model === null && ctx.c.storage === undefined && uniq(ctx.pool.map((r) => r.storageGb)).length > 1,
    options: (ctx) => [...uniq(ctx.pool.map((r) => r.storageGb)).sort((a, b) => a - b).map((gb) => ({ id: `min:${gb}`, label: `Storage: at least ${gbText(gb)}` })), NOTSURE],
    apply: (picks) => {
      const n = valueOf(picks, "min:");
      return n ? { c: { minStorageGb: Number(n) } } : {};
    },
  },
  {
    id: "budget_ceiling",
    kind: "hard",
    ask: (ctx, reopen) => {
      const n = givenCeiling(ctx);
      return reopen && n !== null ? `You said up to ${money(n)}. Still right?` : "What's the most you'd like to spend?";
    },
    pre: (ctx) => !ctx.sc.fixed && priceBands(ctx.pool).length > 0,
    options: (ctx) => {
      const n = givenCeiling(ctx);
      const bands = priceBands(ctx.pool);
      return [
        ...(n !== null ? [{ id: `ceiling:${n}`, label: `Keep my budget at ${money(n)}` }] : []),
        ...bands.filter((b) => b !== n).map((b) => ({ id: `ceiling:${b}`, label: `Budget: up to ${money(b)}` })),
        { id: "nolimit", label: "No budget limit", neutral: true },
        { id: "ceiling:own", label: "Set my own budget (A$100 steps)", param: { prefix: "ceiling:", min: 100, max: 9000, step: 100 } },
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
    pre: (ctx) => knowsBasics(ctx) && !ctx.model && uniq(ctx.pool.map((r) => r.colour)).length > 1,
    options: (ctx) => [...uniq(ctx.pool.map((r) => r.colour)).sort().map((col) => ({ id: `colour:${col}`, label: `Colour: ${col}` })), NOTSURE],
    apply: (picks) => {
      const cols = pickedIds(picks, "colour:");
      return cols.length ? { c: { colours: cols } } : {};
    },
  },
  {
    // Only needed when a model's preconfigured tiers vary in memory at the
    // same storage (e.g. the 16-inch M5 Max's 36GB and 48GB tiers): most
    // models have one memory figure across their tiers, so `pre` is false
    // there and this question never appears for them.
    id: "memory_tier_for_model",
    kind: "resolve",
    ask: (ctx) => {
      const shown = uniq(ctx.pool.map((r) => r.memoryGb));
      const who = named(ctx, ctx.model) ? "it" : `the ${theLaptop(ctx)}`;
      return `${capitalise(who)} comes with ${orList(shown.map(gbText))} of memory. Which would you like?`;
    },
    pre: (ctx) => ctx.model !== null && ctx.sc.fixed !== undefined && uniq(ctx.pool.map((r) => r.memoryGb)).length > 1,
    options: (ctx) => [
      ...uniq(ctx.pool.map((r) => r.memoryGb)).map((gb) => ({ id: `memory:${gb}`, label: `Memory: ${gbText(gb)} (${money(Math.min(...ctx.pool.filter((r) => r.memoryGb === gb).map((r) => r.price)))})` })),
      ...(ctx.sc.answers["memory_tier_for_model"]?.picks.includes("notsure") ? [] : [NOTSURE]),
    ],
    apply: (picks) => {
      const gb = valueOf(picks, "memory:");
      return gb ? { c: { memory: Number(gb) } } : {};
    },
  },
  {
    id: "storage_tier_for_model",
    kind: "resolve",
    ask: (ctx) => {
      const shown = uniq(ctx.pool.map((r) => r.storageGb));
      const full = ctx.model ? modelById(ctx.model).tiers.length : shown.length;
      const who = named(ctx, ctx.model) ? "it" : `the ${theLaptop(ctx)}`;
      if (shown.length === full) return `${capitalise(who)} comes in ${orList(shown.map(gbText))}. Which would you like?`;
      const model = ctx.model ? modelById(ctx.model) : null;
      const byBudget = ctx.c.maxPrice !== undefined && model?.tiers.some((t) => t.price > ctx.c.maxPrice!);
      const why = byBudget ? `Within your ${money(ctx.c.maxPrice!)} budget` : ctx.c.minStorageGb !== undefined ? `Since you wanted at least ${gbText(ctx.c.minStorageGb)}` : "With what you've told me";
      return `${why}, you could have ${who} in ${orList(shown.map(gbText))}. Which would you like?`;
    },
    pre: (ctx) => ctx.model !== null && ctx.sc.fixed !== undefined && uniq(ctx.pool.map((r) => r.storageGb)).length > 1,
    options: (ctx) => [
      ...uniq(ctx.pool.map((r) => r.storageGb)).map((st) => ({ id: `storage:${st}`, label: `Storage: ${gbText(st)} (${money(Math.min(...ctx.pool.filter((r) => r.storageGb === st).map((r) => r.price)))})` })),
      ...(ctx.sc.answers["storage_tier_for_model"]?.picks.includes("notsure") ? [] : [NOTSURE]),
    ],
    apply: (picks) => {
      const st = valueOf(picks, "storage:");
      return st ? { c: { storage: Number(st) } } : {};
    },
  },
  {
    id: "colour_pick",
    kind: "resolve",
    ask: (ctx, reopen) => (reopen || named(ctx, ctx.model) ? `Which colour would you like${reopen ? " instead" : ""}?` : `Which colour for the ${theLaptop(ctx)}?`),
    pre: (ctx) => ctx.model !== null && ctx.sc.fixed !== undefined && uniq(ctx.pool.map((r) => r.colour)).length > 1,
    options: (ctx) => {
      const here = uniq(ctx.pool.map((r) => r.colour));
      const others = uniq(MODELS.flatMap((m) => m.colours)).filter((col) => !here.includes(col)).sort();
      return [
        ...here.map((col) => ({ id: `colour:${col}`, label: `Colour: ${col}` })),
        ...others.map((col) => ({ id: `colour:${col}`, label: `Ask for ${col} (not in this model)`, group: "other colours" })),
        ...(ctx.sc.answers["colour_pick"]?.picks.includes("notsure") ? [] : [NOTSURE]),
      ];
    },
    apply: (picks) => {
      const cols = pickedIds(picks, "colour:");
      return cols.length ? { c: { colours: cols } } : {};
    },
  },
];

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

export function withoutAnswer(ctx: Ctx, qid: string): Ctx {
  const sc: Scene = { ...ctx.sc, answers: { ...ctx.sc.answers }, order: ctx.sc.order.filter((q) => q !== qid) };
  delete sc.answers[qid];
  return { ...derive(sc), sc: ctx.sc };
}

export function rowsIf(ctx: Ctx, qid: string, picks: string[]): number {
  const sc: Scene = { ...ctx.sc, answers: { ...ctx.sc.answers, [qid]: { picks, turn: ctx.sc.turn } }, order: ctx.sc.order.includes(qid) ? ctx.sc.order : [...ctx.sc.order, qid] };
  return derive(sc).pool.length;
}

export function optionsFor(ctx: Ctx, q: QuestionDef): Option[] {
  const all = q.options(ctx);
  if (q.kind !== "hard") return all;
  return all.filter((o) => o.neutral || o.param || rowsIf(ctx, q.id, [o.id]) < ctx.pool.length || (o.id.startsWith("ceiling:") && o.id === `ceiling:${ctx.c.maxPrice}`));
}

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

export const reopenable = (ctx: Ctx): QuestionDef[] =>
  ctx.sc.order
    .map(questionById)
    .filter((q) => q.kind !== "route" && (ctx.sc.answers[q.id]?.picks.length ?? 0) > 0)
    .filter((q) => ctx.pool.length > 0 || withoutAnswer(ctx, q.id).pool.length > 0);

export function gain(ctx: Ctx, q: QuestionDef): number {
  if (q.kind === "soft") return 0.25;
  if (q.kind === "route") return 0.1;
  const opts = optionsFor(ctx, q).filter((o) => !o.neutral && !o.param);
  if (opts.length === 0) return 0;
  const left = opts.map((o) => rowsIf(ctx, q.id, [o.id]) / ctx.pool.length);
  return 1 - left.reduce((a, b) => a + b, 0) / left.length;
}
