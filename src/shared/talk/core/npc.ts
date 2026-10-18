// Phase 2 step 3 of the core extraction
// (docs/conversation-model/core-extraction-proposal.md). Diffed phone's
// npc.ts against scenes/laptop/npc.ts fresh, post-steps-1/2, rather than
// trusting the proposal's pre-implementation sketch (which turned out right
// in shape, wrong in which functions actually qualify -- see below).
//
// Byte-identical, zero scene-specific fields touched at all: staffMove,
// runConversation, randomStaff, the tone() helper and pickN(). These move
// here as-is (same conservative style as engine.ts's relaxMoves/
// nearestModels: plain function parameters, not one large dependency
// object), generic over whatever Scene/StaffAct/ActView/Tone a scene
// supplies.
//
// NOT moved, and why -- each one reads a field whose *shape* differs per
// scene, not just its name (the same category pool.ts and the bank's
// question content already fall into, correctly scene-owned):
//   - compatible(): reads wholly different Constraints fields per scene
//     (phone: foldable/separateTelephoto/screen; laptop: family/maxWeightG/
//     minThunderboltGen) -- this is pool-logic, not NPC-loop logic.
//   - consistent(), answerQuestion(), customerMove(): each has one or two
//     lines that read Sku/tier fields whose shape differs (phone's
//     `r.storage` vs laptop's `r.memoryGb`/`r.storageGb`), tied to
//     Persona.target's differing shape. A hook here would be built from
//     exactly two data points for a check that's almost entirely about the
//     persona's goal, which is scene content -- the same restraint step 2
//     applied to confirm/reconfirm/keepPreferences.
//   - randomPersona(): entirely scene-specific content (signal lists,
//     impossible-persona archetypes, want shapes) -- correctly scene-owned,
//     same category as pool.ts's own content.
//
// So: the loop mechanics generalized; the persona/goal machinery did not,
// because two purchase scenes don't yet show what the hook should be. A
// genuinely different third scene (device-service, where "the thing the
// customer wants" isn't a model+variant tuple at all) is what should decide
// that, not a guess made here.

import { pickOne, weighted, type Rng } from "./rng.ts";
import type { Line, StaffAct, Tone } from "./types.ts";

export interface StaffTraits {
  thorough: number; // appetite for questions (0.5 to 1.5)
  salesy: number; // appetite for demos (0.5 to 1.5)
  tones: Tone[];
}

export const randomStaff = (rng: Rng): StaffTraits => ({
  thorough: 0.6 + rng(),
  salesy: 0.6 + rng(),
  // Mostly warm; now and then unsure, rarely short.
  tones: ["friendly", "neutral", ...(rng() < 0.25 ? (["unsure"] as Tone[]) : []), ...(rng() < 0.12 ? (["impatient"] as Tone[]) : [])],
});

export function tone(patience: number, personaTones: Tone[], rng: Rng): Tone {
  return patience <= 3 ? "impatient" : pickOne(rng, personaTones);
}

// The staff NPC's legal-move view: what staffActs(sc) already returns for any
// scene (ActView from engine.ts), generic enough that this file doesn't need
// to import any scene's concrete ActView type.
export interface StaffActView {
  act: StaffAct;
  gain: number;
}

// Weights over whatever legal moves staffActs(sc) returned (already generic,
// phase 2 step 2). The three scene-specific facts a question's weight needs
// -- which qid opens the conversation, which qid is "I know the range", which
// qids get asked sooner, and a resolve question's own weight -- are passed
// in rather than looked up, since "what a question is about" is bank
// content, not NPC-loop logic.
export function staffMove(
  acts: StaffActView[],
  sc: { turn: number; log: Line[] },
  tr: StaffTraits,
  rng: Rng,
  poolLen: number,
  modelsLen: number,
  questionKind: (qid: string) => "hard" | "soft" | "route" | "resolve",
  earlyOpeningQid: string,
  earlyKnownQid: string,
  weightedEarlyQids: string[],
  resolveWeight: (qid: string) => number,
): { act: StaffAct; tone: Tone } {
  const lastCustomerTone = [...sc.log].reverse().find((l) => l.who === "customer")?.tone;
  const impatient = lastCustomerTone === "impatient";
  const picked0: Tone = impatient ? weighted(rng, [{ item: "friendly", w: 3 }, { item: "neutral", w: 2 }]) : pickOne(rng, tr.tones);
  // Nobody greets a customer impatiently or unsurely.
  const picked: Tone = picked0 === "impatient" && sc.turn <= 10 ? "neutral" : picked0; // short only after a long chat
  const t: Tone = sc.log.length === 0 && (picked === "impatient" || picked === "unsure") ? "neutral" : picked;
  const weights = acts.map((v) => {
    const a = v.act;
    let w = 0;
    if (acts.length === 1) w = 1;
    else if (a.t === "ask" && a.reopen) w = poolLen === 0 ? 1 : 0; // never for no reason: only when nothing fits
    else if (a.t === "ask") {
      const kind = questionKind(a.qid);
      w = a.qid === earlyOpeningQid && sc.turn === 0 ? 6 : a.qid === earlyKnownQid && sc.turn === 0 ? 2 : 0.2 + v.gain * 3;
      // What it is for and what it should cost come early; storage before colour.
      if (weightedEarlyQids.includes(a.qid)) w += 1.5;
      if (kind === "resolve") w = resolveWeight(a.qid);
      w *= tr.thorough * (impatient ? 0.5 : 1);
    } else if (a.t === "offer_demo") w = (modelsLen <= 4 ? 1 + (5 - modelsLen) * 0.8 : 0.3) * tr.salesy * (impatient ? 2 : 1);
    else if (a.t === "reconfirm") w = 9; // they moved to a new item: check their wishes still stand
    else if (a.t === "recommend") w = (acts.some((x) => x.act.t === "ask" && !x.act.reopen) ? 0.3 : 6) * tr.salesy;
    else if (a.t === "confirm") w = 12;
    else if (a.t === "nudge") w = 10;
    else if (a.t === "rescue") w = 5;
    else if (a.t === "answer") w = 0.5;
    return { item: a, w };
  });
  return { act: weighted(rng, weights), tone: t };
}

export interface RunResult<SC> {
  scene: SC;
  turns: number;
  stuck?: string; // set if the engine ever offered no legal move
}

// Runs a whole NPC-vs-NPC conversation. Generic over a scene's own
// staffActs/applyStaff/customerMenu/applyCustomer (all already generic from
// steps 1-2) and its own customerMove/staffMove (NOT generic -- see file
// header), which the scene passes in bound to its own Persona/StaffTraits.
export function runConversation<SC extends { ended: unknown; turn: number }, Act, Reply>(
  staffActs: (sc: SC) => { act: Act }[],
  applyStaff: (sc: SC, act: Act, tone: Tone) => SC | { error: string },
  customerMenu: (sc: SC) => { options: unknown[]; actions: unknown[] } | null,
  applyCustomer: (sc: SC, reply: Reply) => SC | { error: string },
  staffMoveFn: (sc: SC, rng: Rng) => { act: Act; tone: Tone },
  customerMoveFn: (sc: SC, rng: Rng) => Reply,
  rng: Rng,
  start: SC,
  maxTurns = 80,
): RunResult<SC> {
  let sc = start;
  while (!sc.ended && sc.turn < maxTurns) {
    const sm = staffActs(sc);
    if (sm.length === 0) return { scene: sc, turns: sc.turn, stuck: "no legal staff move" };
    const s = staffMoveFn(sc, rng);
    const a = applyStaff(sc, s.act, s.tone);
    if ("error" in a) return { scene: sc, turns: sc.turn, stuck: `staff: ${a.error}` };
    const menu = customerMenu(a);
    if (!menu || (menu.options.length === 0 && menu.actions.length === 0)) return { scene: a, turns: a.turn, stuck: "no legal customer move" };
    const c = applyCustomer(a, customerMoveFn(a, rng));
    if ("error" in c) return { scene: a, turns: a.turn, stuck: `customer: ${c.error}` };
    sc = c;
  }
  return { scene: sc, turns: sc.turn, stuck: sc.ended ? undefined : "did not finish" };
}

export function pickN<T>(rng: Rng, xs: T[], n: number): T[] {
  const left = [...xs];
  const out: T[] = [];
  while (out.length < n && left.length) out.push(left.splice(Math.floor(rng() * left.length), 1)[0]!);
  return out;
}
