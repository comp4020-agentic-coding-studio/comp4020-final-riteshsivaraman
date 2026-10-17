import { derive, questionById } from "./bank.ts";
import { MODELS, modelById } from "./data.ts";
import { ceil100, poolOf, screenBand, type Constraints } from "./pool.ts";
import { chance, pickOne, weighted, type Rng } from "./rng.ts";
import { applyCustomer, applyStaff, customerMenu, staffActs, type CustomerMenu } from "./scene.ts";
import { TONES, type CustomerReply, type Scene, type StaffAct, type Tone } from "./types.ts";

// NPCs. Neither is scripted: each turn they choose among the moves the engine
// says are legal, with weights and a little noise, so conversations differ but
// stay sensible. The customer has a hidden goal and checks every answer
// against it, so it cannot contradict itself; the staff member prefers
// questions that genuinely narrow the pool, and moves to demos as the pool shrinks.

export interface Persona {
  id: string;
  opening: "know" | "line" | "help" | "browse";
  target?: { model: string; storage: string; colour: string }; // buys this
  wants: Constraints; // hard truths: never contradicted
  signals: string[]; // use cases they would tick
  unsure: number; // chance of "Not sure" where it is offered
  patience: number; // leaves when the scene's patience falls to this
  relax?: { key: keyof Constraints | "budget"; to?: number }; // what they would give up
  resistance: number; // nudges refused before relaxing
  looseFirstCeiling?: number; // first budget answer is looser than the truth
  throwbackRate: number;
  tones: Tone[];
}

// ---- the customer ----

const compatible = (c: Constraints, p: Persona): boolean => {
  const w = p.wants;
  const tm = p.target ? modelById(p.target.model) : null;
  if (c.maxPrice !== undefined && w.maxPrice !== undefined && c.maxPrice > w.maxPrice) return false;
  if (c.minGB !== undefined && ((w.minGB !== undefined && c.minGB > w.minGB) || (p.target && c.minGB > gbOf(p.target.storage)))) return false;
  if (c.foldable !== undefined && ((w.foldable !== undefined && c.foldable !== w.foldable) || (tm && c.foldable !== tm.foldable))) return false;
  if (c.separateTelephoto === true && w.separateTelephoto !== true && tm && !tm.separateTelephoto) return false;
  if (c.screen !== undefined && ((w.screen !== undefined && c.screen !== w.screen) || (tm && screenBand(tm.screenIn) !== c.screen))) return false;
  if (c.minBattery !== undefined && ((w.minBattery !== undefined && c.minBattery > w.minBattery) || (tm?.batteryHours && c.minBattery > tm.batteryHours))) return false;
  if (c.colours && ((w.colours && !c.colours.some((x) => w.colours!.includes(x))) || (p.target && !c.colours.includes(p.target.colour)))) return false;
  if (c.model !== undefined && ((p.target && c.model !== p.target.model) || (w.model && c.model !== w.model))) return false;
  if (c.lines && p.target && !c.lines.includes(modelById(p.target.model).line)) return false;
  if (c.storage !== undefined && p.target && c.storage !== p.target.storage) return false;
  return true;
};
const gbOf = (s: string): number => (s.endsWith("TB") ? parseInt(s, 10) * 1024 : parseInt(s, 10));

// An answer is consistent with the persona when it contradicts no hidden want
// and still leaves the thing they came to buy in the pool.
function consistent(sc: Scene, p: Persona, qid: string, picks: string[]): boolean {
  const q = questionById(qid);
  const k = q.apply(picks);
  if (k.c && !compatible(k.c, p)) return false;
  if (k.end) return false;
  if (p.target && qid !== "opening_intent") {
    const trial: Scene = { ...sc, answers: { ...sc.answers, [qid]: { picks, turn: sc.turn } }, order: sc.order.includes(qid) ? sc.order : [...sc.order, qid], fixed: k.fix ?? sc.fixed };
    const pool = derive(trial).pool;
    if (!pool.some((r) => r.model === p.target!.model && r.storage === p.target!.storage && r.colour === p.target!.colour)) return false;
  }
  return true;
}

const tone = (sc: Scene, p: Persona, rng: Rng): Tone => (sc.patience <= 3 ? "impatient" : pickOne(rng, p.tones));

function answerQuestion(sc: Scene, p: Persona, menu: CustomerMenu, rng: Rng): string[] {
  if (menu.pending.kind !== "question") return [];
  const qid = menu.pending.qid;
  const opts = menu.options;
  const sure = opts.find((o) => o.id === "notsure");
  if (qid === "opening_intent") return [p.opening];
  if (qid === "known_model") return p.target && p.opening === "know" ? [`model:${p.target.model}`] : [(opts.find((o) => o.id === "notyet") ?? sure ?? opts[0]!).id];
  if (qid === "use_case") {
    const ticks = opts.filter((o) => p.signals.includes(o.id)).map((o) => o.id);
    return ticks.length && !chance(rng, p.unsure) ? ticks : [(sure ?? opts[0]!).id];
  }
  if (qid === "budget_ceiling") {
    const truth = p.wants.maxPrice;
    if (truth === undefined) return [(opts.find((o) => o.id === "nolimit") ?? sure ?? opts[0]!).id];
    const floor = p.target ? Math.min(...modelById(p.target.model).tiers.filter((t) => t.storage === p.target!.storage).map((t) => t.price)) : 0;
    const loose = p.looseFirstCeiling !== undefined && !sc.answers["budget_ceiling"] ? p.looseFirstCeiling : undefined;
    if (loose !== undefined) return [`ceiling:${loose}`];
    const band = opts.filter((o) => o.id.startsWith("ceiling:") && !o.param).map((o) => Number(o.id.slice(8))).filter((b) => b >= floor && b <= truth).sort((a, b) => b - a)[0];
    return [`ceiling:${band ?? truth}`];
  }
  if (qid === "colour_prefs" || qid === "colour_pick") {
    const want = p.target?.colour ?? p.wants.colours?.[0];
    const cols = opts.filter((o) => o.id === `colour:${want}`);
    if (cols.length) return [cols[0]!.id];
    // Having given up the colour they wanted, they take one the model comes in.
    const here = opts.filter((o) => o.id.startsWith("colour:") && !o.group);
    if (here.length && !p.wants.colours && !p.target) return [pickOne(rng, here).id];
    return [(sure ?? opts[0]!).id];
  }
  // Everything else: a random consistent, non-neutral option, or "Not sure".
  if (sure && chance(rng, p.unsure) && qid !== "storage_tier_for_model") return [sure.id];
  const ok = opts.filter((o) => !o.param && o.id !== "notsure" && consistent(sc, p, qid, [o.id]));
  const narrowing = ok.filter((o) => !o.neutral);
  if (menu.multi) return ok.length ? [pickOne(rng, ok).id] : [(sure ?? opts[0]!).id];
  if (narrowing.length) return [pickOne(rng, narrowing).id];
  if (ok.length) return [pickOne(rng, ok).id];
  if (opts.length === 0) throw new Error(`no options for ${qid} (rows ${derive(sc).pool.length}, models ${derive(sc).ranked.length})`);
  return [(sure ?? opts.find((o) => o.neutral) ?? opts[0]!).id];
}

// What the customer has already given up in this conversation. Once they have
// agreed to drop a want they do not insist on it again.
export interface Memory {
  wants: Constraints;
  conceded: Set<string>;
}

export function customerMove(sc: Scene, persona: Persona, rng: Rng, mem: Memory = { wants: persona.wants, conceded: new Set() }): CustomerReply {
  const p: Persona = { ...persona, wants: mem.wants };
  const menu = customerMenu(sc)!;
  const t = tone(sc, p, rng);
  const leave: CustomerReply = { action: { t: "leave" }, tone: "impatient" };
  if (sc.patience <= p.patience) return leave;
  const pend = menu.pending;
  let reply: CustomerReply;
  if (pend.kind === "free") reply = { action: { t: "ok" }, tone: t };
  else if (pend.kind === "question") reply = { picks: answerQuestion(sc, p, menu, rng), tone: t };
  else if (pend.kind === "offer_demo") {
    const want = p.target && pend.models.includes(p.target.model) ? p.target.model : pend.models.find((m) => fits(m, p));
    reply = want && chance(rng, 0.7) ? { picks: [`demo:${want}`], tone: t } : { picks: ["decline"], tone: t };
  } else if (pend.kind === "demo_reaction") {
    const m = modelById(pend.model);
    const cheapest = Math.min(...m.tiers.map((x) => x.price));
    const pick = p.target ? (m.id === p.target.model ? "happy" : "notforme") : p.wants.maxPrice !== undefined && cheapest > p.wants.maxPrice ? "expensive" : fits(m.id, p) && chance(rng, 0.6) ? "happy" : "notforme";
    reply = { picks: [pick], tone: t };
  } else if (pend.kind === "recommend") {
    const m = pend.model;
    const yes = p.target ? m === p.target.model : fits(m, p);
    reply = { picks: [yes ? (chance(rng, 0.85) ? "yes" : "unsure") : "no"], tone: t };
  } else if (pend.kind === "nudge") {
    const moves = menu.options.filter((o) => o.id.startsWith("drop:") || o.id.startsWith("raise:"));
    const give = p.relax && sc.relaxDeclined >= p.resistance ? moves.find((o) => (p.relax!.key === "budget" ? o.id.startsWith("raise:") && (p.relax!.to === undefined || Number(o.id.slice(6)) <= p.relax!.to) : o.id === `drop:${p.relax!.key}`)) : undefined;
    if (give?.id.startsWith("drop:")) {
      const key = give.id.slice(5) as keyof Constraints;
      mem.wants = { ...mem.wants };
      delete mem.wants[key];
      mem.conceded.add(key);
    } else if (give?.id.startsWith("raise:")) {
      mem.wants = { ...mem.wants, maxPrice: Number(give.id.slice(6)) };
      mem.conceded.add("maxPrice");
    }
    reply = { picks: [give?.id ?? "keep"], tone: t };
  } else if (pend.kind === "rescue") {
    const see = menu.options.find((o) => o.id.startsWith("demo:") && chance(rng, 0.25));
    reply = { picks: [see?.id ?? "think"], tone: t };
  } else {
    // Say yes only to a phone that is what they wanted; otherwise walk away.
    const r = derive(sc).pool[0]!;
    const right = p.target ? r.model === p.target.model && r.storage === p.target.storage && r.colour === p.target.colour : poolOf(p.wants).some((x) => x.model === r.model && x.storage === r.storage && x.colour === r.colour);
    reply = { picks: [right ? "yes" : "leave"], tone: t };
  }
  if (!reply.action && menu.throwbacks.length && chance(rng, p.throwbackRate)) reply.throwback = pickOne(rng, menu.throwbacks).id;
  return reply;
}

// A model satisfies the persona when something they would accept exists in it.
const fits = (id: string, p: Persona): boolean => poolOf({ ...p.wants, model: id }).length > 0;

// ---- the staff member ----

export interface StaffTraits {
  thorough: number; // appetite for questions (0.5 to 1.5)
  salesy: number; // appetite for demos (0.5 to 1.5)
  tones: Tone[];
}

export function staffMove(sc: Scene, tr: StaffTraits, rng: Rng): { act: StaffAct; tone: Tone } {
  const acts = staffActs(sc);
  const lastCustomerTone = [...sc.log].reverse().find((l) => l.who === "customer")?.tone;
  const impatient = lastCustomerTone === "impatient";
  const t: Tone = impatient ? weighted(rng, [{ item: "friendly", w: 3 }, { item: "neutral", w: 2 }]) : pickOne(rng, tr.tones);
  const ctx = derive(sc);
  const models = ctx.ranked.length;
  const weights = acts.map((v) => {
    const a = v.act;
    let w = 0;
    if (acts.length === 1) w = 1;
    else if (a.t === "ask" && a.reopen) w = ctx.pool.length === 0 ? 1 : 0.05;
    else if (a.t === "ask") {
      const q = questionById(a.qid);
      w = a.qid === "opening_intent" && sc.turn === 0 ? 6 : a.qid === "known_model" && sc.turn === 0 ? 2 : 0.2 + v.gain * 3;
      if (q.kind === "resolve") w = 3;
      w *= tr.thorough * (impatient ? 0.5 : 1);
    } else if (a.t === "offer_demo") w = (models <= 4 ? 1 + (5 - models) * 0.8 : 0.3) * tr.salesy * (impatient ? 2 : 1);
    else if (a.t === "recommend") w = (acts.some((x) => x.act.t === "ask" && !x.act.reopen) ? 0.3 : 6) * tr.salesy;
    else if (a.t === "confirm") w = 12;
    else if (a.t === "nudge") w = 10;
    else if (a.t === "rescue") w = 5;
    else if (a.t === "answer") w = 0.5;
    return { item: a, w };
  });
  return { act: weighted(rng, weights), tone: t };
}

export const randomStaff = (rng: Rng): StaffTraits => ({ thorough: 0.6 + rng(), salesy: 0.6 + rng(), tones: TONES.filter((_, i) => i < 2 || chance(rng, 0.25)) });

// ---- personas ----

export function randomPersona(rng: Rng, id = "random"): Persona {
  const tones: Tone[] = pickOne(rng, [["friendly", "neutral"], ["neutral"], ["neutral", "impatient"], ["friendly", "unsure"]]) as Tone[];
  const common = { unsure: rng() * 0.35, patience: Math.floor(rng() * 2), resistance: Math.floor(rng() * 3), throwbackRate: rng() * 0.3, tones, signals: pickN(rng, ["photos", "video", "travel", "streaming", "social", "games", "work", "basics"], 1 + Math.floor(rng() * 3)) };
  if (chance(rng, 0.2)) {
    // A customer whose wants cannot all be met.
    const kind = pickOne(rng, ["fold", "tele", "gold"]);
    const wants: Constraints = kind === "fold" ? { foldable: true, maxPrice: 1000 + 1000 * Math.floor(rng() * 2) + 500 } : kind === "tele" ? { separateTelephoto: true, maxPrice: 1800 + 100 * Math.floor(rng() * 3) } : { colours: ["Light Gold"], model: "18-pro" };
    const relax = chance(rng, 0.5) ? (kind === "gold" ? { key: "colours" as const } : kind === "fold" ? { key: "foldable" as const } : { key: "budget" as const }) : undefined;
    return { id, opening: pickOne(rng, ["help", "browse", "line"] as const), wants, relax, ...common };
  }
  const m = pickOne(rng, MODELS);
  const tier = pickOne(rng, m.tiers);
  const colour = pickOne(rng, m.colours);
  const wants: Constraints = { maxPrice: Math.min(6000, ceil100(tier.price) + 100 * Math.floor(rng() * 4)) };
  if (chance(rng, 0.5)) wants.minGB = tier.gb;
  if (chance(rng, 0.3)) wants.colours = [colour];
  if (m.separateTelephoto && chance(rng, 0.3)) wants.separateTelephoto = true;
  if (m.foldable) wants.foldable = true;
  return {
    id,
    opening: pickOne(rng, ["know", "line", "help", "help", "browse"] as const),
    target: { model: m.id, storage: tier.storage, colour },
    wants,
    looseFirstCeiling: chance(rng, 0.2) ? Math.min(6000, wants.maxPrice! + 1000) : undefined,
    ...common,
  };
}

function pickN<T>(rng: Rng, xs: T[], n: number): T[] {
  const left = [...xs];
  const out: T[] = [];
  while (out.length < n && left.length) out.push(left.splice(Math.floor(rng() * left.length), 1)[0]!);
  return out;
}

// ---- running a whole conversation between two NPCs ----

export interface RunResult {
  scene: Scene;
  turns: number;
  stuck?: string; // set if the engine ever offered no legal move
}

export function runConversation(persona: Persona, staff: StaffTraits, rng: Rng, start: Scene, maxTurns = 80): RunResult {
  let sc = start;
  const mem: Memory = { wants: persona.wants, conceded: new Set() };
  while (!sc.ended && sc.turn < maxTurns) {
    const sm = staffActs(sc);
    if (sm.length === 0) return { scene: sc, turns: sc.turn, stuck: "no legal staff move" };
    const s = staffMove(sc, staff, rng);
    const a = applyStaff(sc, s.act, s.tone);
    if ("error" in a) return { scene: sc, turns: sc.turn, stuck: `staff: ${a.error}` };
    const menu = customerMenu(a);
    if (!menu || (menu.options.length === 0 && menu.actions.length === 0)) return { scene: a, turns: a.turn, stuck: "no legal customer move" };
    const c = applyCustomer(a, customerMove(a, persona, rng, mem));
    if ("error" in c) return { scene: a, turns: a.turn, stuck: `customer: ${c.error}` };
    sc = c;
  }
  return { scene: sc, turns: sc.turn, stuck: sc.ended ? undefined : "did not finish" };
}

