import { applyCustomer, customerMenu } from "../shared/talk/scene.ts";
import { customerMove, randomPersona, type Memory, type Persona } from "../shared/talk/npc.ts";
import { makeRng, pickOne, type Rng } from "../shared/talk/rng.ts";
import type { Constraints } from "../shared/talk/pool.ts";
import type { CustomerReply, Scene } from "../shared/talk/types.ts";
import type { Purpose } from "../shared/storeday.ts";

// ---- how a promoted timetable customer answers (issue #39, SCOPE D55, ADR 10) ----
//
// A timetable customer a real staff user has claimed (issues #20/#41) is in the
// same phones conversation as a real visitor, answering from the same customer
// menu (shared/talk/scene.ts customerMenu). What a human picks with a click, it
// picks by rule: the engine's own NPC customer model (shared/talk/npc.ts
// customerMove), the one the stand-in and the simulator already use, which
// holds a hidden goal and never contradicts it. Nothing here is random in the
// Math.random sense: the persona is seeded from the customer's id and the day of
// its visit, and each answer from that seed plus the turn, so the same customer
// on the same day, asked the same things, answers the same way. Its intent comes
// from its timetable purpose (storeday.ts CAST): someone who came in for a phone
// shops for one; someone who came in for a laptop, a tablet or audio says it is
// here about something else, which ends the phones chat honestly.
//
// Every conversation ends: the scene's own patience walks it out on a tiresome
// specialist, and past MAX_CPU_REPLIES answers it leaves whatever is going on, so
// a specialist who only ever keeps asking cannot hold it for good.

export const MAX_CPU_REPLIES = 24; // a real phones chat that sells runs well under this
export const CPU_PAY_MS = 1500; // it taps this long after being shown the total

// On unless CPU_CUSTOMERS_LIVE=0 (issue #39 turned the default on).
export const cpuCustomersLive = (env: Record<string, string | undefined>): boolean => env.CPU_CUSTOMERS_LIVE !== "0";

// What a CPU customer carries through one conversation (kept in the
// conversation's data): its seed, its purpose, and what it still insists on,
// since giving up a want to a nudge is remembered for the rest of the chat.
export interface CpuTalk {
  seed: string;
  purpose: Purpose | null;
  wants: Constraints;
  conceded: string[];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const rngOf = (seed: string, n: number): Rng => makeRng((hash(seed) + Math.imul(n + 1, 0x9e3779b1)) >>> 0);

function personaOf(t: Pick<CpuTalk, "seed" | "purpose">): Persona {
  const p = randomPersona(rngOf(t.seed, -1), t.seed);
  return t.purpose === "browse" ? { ...p, opening: "browse" } : p;
}

const shops = (purpose: Purpose | null): boolean => purpose === "phone" || purpose === "browse";

export function startCpuTalk(customerId: string, visit: number, purpose: Purpose | null): CpuTalk {
  const seed = `${customerId}:${visit}`;
  return { seed, purpose, wants: personaOf({ seed, purpose }).wants, conceded: [] };
}

const LEAVE: CustomerReply = { action: { t: "leave" }, tone: "neutral" };

const describe = (r: CustomerReply): string => (r.action ? `action:${r.action.t}${"model" in r.action ? `:${r.action.model}` : ""}` : (r.picks ?? []).join("+")) + (r.throwback ? `+ask:${r.throwback}` : "");

// The reply the rules give now, applied to the scene. Null when it is not the
// customer's turn (nothing to answer).
export function cpuReply(sc: Scene, t: CpuTalk): { scene: Scene; talk: CpuTalk; choice: string } | null {
  const menu = customerMenu(sc);
  if (!menu) return null;
  const said = sc.log.filter((l) => l.who === "customer").length;
  let reply: CustomerReply = LEAVE;
  let talk = t;
  if (said >= MAX_CPU_REPLIES - 1) {
    reply = LEAVE; // the bound: never a conversation without end
  } else if (!shops(t.purpose)) {
    // not here for a phone: says so if asked, and otherwise does not stay for a phones chat
    reply = menu.pending.kind === "question" && menu.pending.qid === "opening_intent" ? { picks: ["other"], tone: "friendly" } : LEAVE;
  } else {
    const mem: Memory = { wants: t.wants, conceded: new Set(t.conceded) };
    try {
      reply = customerMove(sc, personaOf(t), rngOf(t.seed, sc.turn), mem);
      talk = { ...t, wants: mem.wants, conceded: [...mem.conceded] };
    } catch {
      reply = LEAVE; // a menu the model cannot read: it leaves rather than says something odd
    }
  }
  let next = applyCustomer(sc, reply);
  if ("error" in next) {
    reply = LEAVE;
    talk = t;
    next = applyCustomer(sc, LEAVE);
    if ("error" in next) return null;
  }
  return { scene: next, talk, choice: describe(reply) };
}

// How it pays, once it has seen the total: card or phone, fixed per visit.
export const cpuPayChoice = (customerId: string, visit: number): "pay:card" | "pay:phone" => pickOne(rngOf(`${customerId}:${visit}`, 9999), ["pay:card", "pay:phone"] as const);
