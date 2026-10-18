import { MODELS } from "../../data.ts";
import * as coreNpc from "../../core/npc.ts";
import { chance, pickOne, type Rng } from "../../rng.ts";
import { derive } from "./bank.ts";
import type { Symptom } from "./data.ts";
import { applyCustomer, applyStaff, customerMenu, staffActs } from "./scene.ts";
import type { CustomerReply, Scene, StaffAct, Tone } from "./types.ts";

// core/npc.ts's staffMove, randomStaff and tone() are kept (they pattern-
// match ActView's gain/the act's `t` tag generically via staffActs(sc), which
// is already scene-agnostic) EXCEPT staffMove itself, which the
// core-extraction proposal found is keyed to the purchase StaffAct union
// (`ask`/`offer_demo`/`demo`/`recommend`/`reconfirm`/`nudge`/`rescue`/
// `confirm`/`answer`) -- this scene's acts (`run_check`/`warn_data_loss`/
// `present_outcome`/`cannot_diagnose`) don't exist in that union, so a fresh
// weighting function is needed, same restraint the proposal recommended
// rather than retrofitting core/npc.ts from a third data point.
export const randomStaff = coreNpc.randomStaff;
export type StaffTraits = coreNpc.StaffTraits;

export interface Persona {
  id: string;
  symptom: Symptom;
  wetExposure: boolean;
  dataMatters: boolean;
  priorRepair: boolean;
  wantsRepair: boolean; // false => declines the quote when offered (tests the decline outcome path)
  unsure: number;
  patience: number;
  tones: Tone[];
}

function answerQuestion(p: Persona, qid: string, opts: { id: string }[], rng: Rng): string[] {
  const sure = opts.find((o) => o.id === "notsure");
  if (chance(rng, p.unsure) && sure) return [sure.id];
  if (qid === "symptom") return [`symptom:${p.symptom}`];
  if (qid === "wet_exposure") return [p.wetExposure ? "yes" : "no"];
  if (qid === "data_matters") return [p.dataMatters ? "yes_no_backup" : "no"];
  if (qid === "prior_repair") return [p.priorRepair ? "yes" : "no"];
  return [opts[0]!.id];
}

export function customerMove(sc: Scene, p: Persona, rng: Rng): CustomerReply {
  const menu = customerMenu(sc)!;
  const t = p.tones.length ? pickOne(rng, p.tones) : "neutral";
  const leave: CustomerReply = { action: { t: "leave" }, tone: "impatient" };
  if (sc.turn > 40) return leave; // a stuck conversation is a bug, not a patience model here
  const pend = menu.pending;
  if (pend.kind === "question") {
    const q = pend.qid === "which_model" ? MODELS.map((m) => ({ id: `model:${m.id}` })) : menu.options;
    return { picks: pend.qid === "which_model" ? [pickOne(rng, q).id] : answerQuestion(p, pend.qid, menu.options, rng), tone: t };
  }
  if (pend.kind === "data_loss_ack") return { picks: [p.wantsRepair ? "ack" : "decline"], tone: t };
  if (pend.kind === "outcome_choice") {
    if (!p.wantsRepair) return { picks: ["decline"], tone: t };
    const fixNow = menu.options.find((o) => o.id === "fix_now");
    const book = menu.options.find((o) => o.id === "book");
    return { picks: [fixNow ? fixNow.id : book ? book.id : "decline"], tone: t };
  }
  return { action: { t: "ok" }, tone: t };
}

export function staffMove(sc: Scene, tr: StaffTraits, rng: Rng): { act: StaffAct; tone: Tone } {
  const acts = staffActs(sc);
  const ctx = derive(sc);
  const lastCustomerTone = [...sc.log].reverse().find((l) => l.who === "customer")?.tone;
  const impatient = lastCustomerTone === "impatient";
  const t: Tone = sc.log.length === 0 ? "neutral" : impatient ? pickOne(rng, ["friendly", "neutral"] as Tone[]) : pickOne(rng, tr.tones);
  // v1 has no real branching to weight (at most one open question, one
  // run_check, one warn/present step each), so this is a simple "take the
  // only sensible move" chooser rather than core/npc.ts's weighted table --
  // deliberately not building a weighting scheme this scene's small bank
  // doesn't need (new-scene-playbook.md's "a rule that fits the examples but
  // not the data", in reverse: don't over-build structure two purchase
  // scenes' complexity doesn't justify here either).
  const weights = acts.map((v) => ({ item: v.act, w: acts.length === 1 ? 1 : v.act.t === "ask" && v.act.reopen ? 0 : 1 + v.gain }));
  return { act: weightedPick(rng, weights), tone: t };
}

function weightedPick(rng: Rng, items: { item: StaffAct; w: number }[]): StaffAct {
  const total = items.reduce((a, b) => a + b.w, 0);
  if (total <= 0) return items[0]!.item;
  let r = rng() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.item;
  }
  return items[items.length - 1]!.item;
}

export function randomPersona(rng: Rng, id = "random"): Persona {
  const symptoms: Symptom[] = ["wont_charge", "wont_turn_on", "cracked_screen", "battery_drain"];
  return {
    id,
    symptom: pickOne(rng, symptoms),
    wetExposure: chance(rng, 0.2),
    dataMatters: chance(rng, 0.5),
    priorRepair: chance(rng, 0.1),
    wantsRepair: chance(rng, 0.8),
    unsure: rng() * 0.25,
    patience: 8,
    tones: pickOne(rng, [["friendly", "neutral"], ["neutral"], ["neutral", "impatient"]]) as Tone[],
  };
}

export type RunResult = coreNpc.RunResult<Scene>;

export function runConversation(persona: Persona, staff: StaffTraits, rng: Rng, start: Scene, maxTurns = 40): RunResult {
  return coreNpc.runConversation<Scene, StaffAct, CustomerReply>(staffActs, applyStaff, customerMenu, applyCustomer, (sc, r) => staffMove(sc, staff, r), (sc, r) => customerMove(sc, persona, r), rng, start, maxTurns);
}
