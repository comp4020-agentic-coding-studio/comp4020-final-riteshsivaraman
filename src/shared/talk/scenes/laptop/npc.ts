import { derive, questionById } from "./bank.ts";
import * as coreNpc from "../../core/npc.ts";
import { MODELS, modelById } from "./data.ts";
import { ceil100, poolOf, type Constraints } from "./pool.ts";
import { chance, pickOne, type Rng } from "../../core/rng.ts";
import { applyCustomer, applyStaff, customerMenu, staffActs, type CustomerMenu } from "./scene.ts";
import { type CustomerReply, type Scene, type StaffAct, type Tone } from "./types.ts";

// NPCs for the laptop scene. Same shape as src/shared/talk/npc.ts (phones):
// neither side is scripted, both choose among legal moves with weights and a
// little noise. staffMove, runConversation, randomStaff, tone() and pickN()
// are byte-identical with the phone scene's and now live once in
// core/npc.ts (phase 2 step 3); the rest (customerMove, compatible,
// consistent, answerQuestion, randomPersona) stays here, same as phones,
// because each touches a Sku/Constraints field whose shape differs per scene
// (core/npc.ts's file header explains why).
export const randomStaff = coreNpc.randomStaff;
export type StaffTraits = coreNpc.StaffTraits;

export interface Persona {
  id: string;
  opening: "know" | "line" | "help" | "browse";
  target?: { model: string; memoryGb: number; storageGb: number; colour: string };
  wants: Constraints;
  signals: string[];
  unsure: number;
  patience: number;
  relax?: { key: keyof Constraints | "budget"; to?: number };
  resistance: number;
  looseFirstCeiling?: number;
  throwbackRate: number;
  tones: Tone[];
}

const compatible = (c: Constraints, p: Persona): boolean => {
  const w = p.wants;
  const tm = p.target ? modelById(p.target.model) : null;
  if (c.maxPrice !== undefined && w.maxPrice !== undefined && c.maxPrice > w.maxPrice) return false;
  if (c.minStorageGb !== undefined && ((w.minStorageGb !== undefined && c.minStorageGb > w.minStorageGb) || (p.target && c.minStorageGb > p.target.storageGb))) return false;
  if (c.minMemoryGb !== undefined && ((w.minMemoryGb !== undefined && c.minMemoryGb > w.minMemoryGb) || (p.target && c.minMemoryGb > p.target.memoryGb))) return false;
  if (c.family !== undefined && ((w.family !== undefined && c.family !== w.family) || (tm && c.family !== tm.family))) return false;
  if (c.minBattery !== undefined && ((w.minBattery !== undefined && c.minBattery > w.minBattery) || (tm && c.minBattery > tm.batteryHours))) return false;
  if (c.maxWeightG !== undefined && ((w.maxWeightG !== undefined && c.maxWeightG < w.maxWeightG) || (tm && c.maxWeightG < tm.weightG))) return false;
  if (c.colours && ((w.colours && !c.colours.some((x) => w.colours!.includes(x))) || (p.target && !c.colours.includes(p.target.colour)))) return false;
  if (c.model !== undefined && ((p.target && c.model !== p.target.model) || (w.model && c.model !== w.model))) return false;
  if (c.memory !== undefined && p.target && c.memory !== p.target.memoryGb) return false;
  if (c.storage !== undefined && p.target && c.storage !== p.target.storageGb) return false;
  if (c.minScreenIn !== undefined && tm && c.minScreenIn > tm.screenIn) return false;
  if (c.maxScreenIn !== undefined && tm && c.maxScreenIn < tm.screenIn) return false;
  return true;
};

function consistent(sc: Scene, p: Persona, qid: string, picks: string[]): boolean {
  const q = questionById(qid);
  const k = q.apply(picks);
  if (k.c && !compatible(k.c, p)) return false;
  if (k.end) return false;
  if (p.target && qid !== "opening_intent") {
    const trial: Scene = { ...sc, answers: { ...sc.answers, [qid]: { picks, turn: sc.turn } }, order: sc.order.includes(qid) ? sc.order : [...sc.order, qid], fixed: k.fix ?? sc.fixed };
    const pool = derive(trial).pool;
    if (!pool.some((r) => r.model === p.target!.model && r.memoryGb === p.target!.memoryGb && r.storageGb === p.target!.storageGb && r.colour === p.target!.colour)) return false;
  }
  return true;
}

const tone = (sc: Scene, p: Persona, rng: Rng): Tone => coreNpc.tone(sc.patience, p.tones, rng);

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
    const floor = p.target ? Math.min(...modelById(p.target.model).tiers.filter((t) => t.storageGb === p.target!.storageGb).map((t) => t.price)) : 0;
    const loose = p.looseFirstCeiling !== undefined && !sc.answers["budget_ceiling"] ? p.looseFirstCeiling : undefined;
    if (loose !== undefined) return [`ceiling:${loose}`];
    const band = opts.filter((o) => o.id.startsWith("ceiling:") && !o.param).map((o) => Number(o.id.slice(8))).filter((b) => b >= floor && b <= truth).sort((a, b) => b - a)[0];
    return [`ceiling:${band ?? truth}`];
  }
  if (qid === "colour_prefs" || qid === "colour_pick") {
    const want = p.target?.colour ?? p.wants.colours?.[0];
    const cols = opts.filter((o) => o.id === `colour:${want}`);
    if (cols.length) return [cols[0]!.id];
    const here = opts.filter((o) => o.id.startsWith("colour:") && !o.group);
    if (here.length && !p.wants.colours && !p.target) return [pickOne(rng, here).id];
    return [(sure ?? opts[0]!).id];
  }
  if (sure && chance(rng, p.unsure) && qid !== "storage_tier_for_model") return [sure.id];
  const ok = opts.filter((o) => !o.param && o.id !== "notsure" && consistent(sc, p, qid, [o.id]));
  const narrowing = ok.filter((o) => !o.neutral);
  if (menu.multi) return ok.length ? [pickOne(rng, ok).id] : [(sure ?? opts[0]!).id];
  if (narrowing.length) return [pickOne(rng, narrowing).id];
  if (ok.length) return [pickOne(rng, ok).id];
  if (opts.length === 0) throw new Error(`no options for ${qid} (rows ${derive(sc).pool.length}, models ${derive(sc).ranked.length})`);
  return [(sure ?? opts.find((o) => o.neutral) ?? opts[0]!).id];
}

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
    const another = pick === "notforme" && menu.options.some((o) => o.id === "another") && chance(rng, 0.5) ? "another" : pick === "notforme" && chance(rng, 0.3) ? "others" : pick;
    reply = { picks: [another], tone: t };
  } else if (pend.kind === "reconfirm") {
    reply = { picks: ["keep"], tone: t };
  } else if (pend.kind === "recommend") {
    const m = pend.model;
    const yes = p.target ? m === p.target.model : fits(m, p);
    reply = { picks: [yes ? (chance(rng, 0.85) ? "yes" : "unsure") : "no"], tone: t };
  } else if (pend.kind === "nudge") {
    const moves = menu.options.filter((o) => o.id.startsWith("drop:") || o.id.startsWith("raise:"));
    const give = p.relax && sc.relaxDeclined >= p.resistance ? moves.find((o) => (p.relax!.key === "budget" ? o.id.startsWith("raise:") && (p.relax!.to === undefined || Number(o.id.slice(6)) <= p.relax!.to) : o.id.startsWith("drop:") && o.id.slice(5).split("+").includes(p.relax!.key as string))) : undefined;
    if (give?.id.startsWith("drop:")) {
      mem.wants = { ...mem.wants };
      for (const key of give.id.slice(5).split("+") as (keyof Constraints)[]) {
        delete mem.wants[key];
        mem.conceded.add(key);
      }
    } else if (give?.id.startsWith("raise:")) {
      mem.wants = { ...mem.wants, maxPrice: Number(give.id.slice(6)) };
      mem.conceded.add("maxPrice");
    }
    reply = { picks: [give?.id ?? "keep"], tone: t };
  } else if (pend.kind === "rescue") {
    const see = menu.options.find((o) => o.id.startsWith("demo:") && chance(rng, 0.25));
    reply = { picks: [see?.id ?? "think"], tone: t };
  } else {
    const r = derive(sc).pool[0]!;
    const right = p.target ? r.model === p.target.model && r.memoryGb === p.target.memoryGb && r.storageGb === p.target.storageGb && r.colour === p.target.colour : poolOf(p.wants).some((x) => x.model === r.model && x.storageGb === r.storageGb && x.colour === r.colour);
    reply = { picks: [right ? "yes" : "leave"], tone: t };
  }
  if (!reply.action && menu.throwbacks.length && chance(rng, p.throwbackRate)) {
    const asked = new Set(sc.log.filter((l) => l.who === "customer" && l.throwback).map((l) => l.throwback));
    const after = applyCustomer(sc, reply);
    const left = "error" in after ? null : new Set(derive(after).ranked.map((m) => m.id));
    const ok = menu.throwbacks.filter((t) => !asked.has(t.id) && (!left || (t.id.startsWith("compare:") ? t.id.split(":").slice(1).every((m) => left.has(m)) : t.id.startsWith("attr:") ? left.size >= 2 : true)));
    if (ok.length) reply.throwback = pickOne(rng, ok).id;
  }
  return reply;
}

const fits = (id: string, p: Persona): boolean => poolOf({ ...p.wants, model: id }).length > 0;

export function staffMove(sc: Scene, tr: StaffTraits, rng: Rng): { act: StaffAct; tone: Tone } {
  const acts = staffActs(sc);
  const ctx = derive(sc);
  return coreNpc.staffMove(
    acts,
    sc,
    tr,
    rng,
    ctx.pool.length,
    ctx.ranked.length,
    (qid) => questionById(qid).kind,
    "opening_intent",
    "known_model",
    ["use_case", "budget_ceiling"],
    (qid) => (qid === "storage_tier_for_model" ? 4 : 3),
  );
}

export function randomPersona(rng: Rng, id = "random"): Persona {
  const tones: Tone[] = pickOne(rng, [["friendly", "neutral"], ["neutral"], ["neutral", "impatient"], ["friendly", "unsure"]]) as Tone[];
  const common = { unsure: rng() * 0.35, patience: Math.floor(rng() * 2), resistance: Math.floor(rng() * 3), throwbackRate: rng() * 0.3, tones, signals: pickN(rng, ["office", "creative", "study", "gaming", "dev", "travel", "basics"], 1 + Math.floor(rng() * 3)) };
  if (chance(rng, 0.15)) {
    // A customer whose wants cannot all be met (the laptop equivalent of the
    // phone scene's "fold/tele/gold" impossible-ask personas).
    const kind = pickOne(rng, ["power", "light", "cheap"]);
    const wants: Constraints =
      kind === "power" ? { family: "pro", minThunderboltGen: 5, maxPrice: 3000 } : kind === "light" ? { maxWeightG: 1200, minBattery: 24, maxPrice: 2000 } : { family: "pro", maxPrice: 2500 };
    const relax = chance(rng, 0.5) ? (kind === "power" ? { key: "budget" as const } : kind === "light" ? { key: "maxWeightG" as const } : { key: "family" as const }) : undefined;
    return { id, opening: pickOne(rng, ["help", "browse", "line"] as const), wants, relax, ...common };
  }
  const m = pickOne(rng, MODELS);
  const tier = pickOne(rng, m.tiers);
  const colour = pickOne(rng, m.colours);
  const wants: Constraints = { maxPrice: Math.min(9000, ceil100(tier.price) + 100 * Math.floor(rng() * 4)) };
  if (chance(rng, 0.5)) wants.minStorageGb = tier.storageGb;
  if (chance(rng, 0.3)) wants.colours = [colour];
  if (chance(rng, 0.2)) wants.maxWeightG = m.weightG + 200;
  return {
    id,
    opening: pickOne(rng, ["know", "line", "help", "help", "browse"] as const),
    target: { model: m.id, memoryGb: tier.memoryGb, storageGb: tier.storageGb, colour },
    wants,
    looseFirstCeiling: chance(rng, 0.2) ? Math.min(9000, wants.maxPrice! + 1000) : undefined,
    ...common,
  };
}

const pickN = coreNpc.pickN;

export type RunResult = coreNpc.RunResult<Scene>;

export function runConversation(persona: Persona, staff: StaffTraits, rng: Rng, start: Scene, maxTurns = 80): RunResult {
  const mem: Memory = { wants: persona.wants, conceded: new Set() };
  return coreNpc.runConversation<Scene, StaffAct, CustomerReply>(
    staffActs,
    applyStaff,
    customerMenu,
    applyCustomer,
    (sc, r) => staffMove(sc, staff, r),
    (sc, r) => customerMove(sc, persona, r, mem),
    rng,
    start,
    maxTurns,
  );
}
