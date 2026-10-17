import type { ModelRec } from "./data.ts";
import type { Signals, Sku, Constraints } from "./pool.ts";

// The vocabulary of one phone-specialist conversation: two parties, taking
// turns, every line a pick from a menu. Nothing here knows about a screen or a
// network; the same scene runs in a spec, in an NPC-vs-NPC simulation and in
// the proof-of-concept page.
//
// Tone, Role, Option and Answer are the part of this vocabulary that does not
// depend on the phone pool shape; they live in core/types.ts and every other
// scene (see scenes/laptop/types.ts) reuses them unchanged. Re-exported here
// so every existing import of "./types.ts" keeps working.

export { TONES, TONE_EXPRESSION, type Tone, type Role, type Option, type Answer } from "./core/types.ts";
import type { Tone, Role, Option, Answer } from "./core/types.ts";

// What the customer is being asked right now.
export type Pending =
  | { kind: "question"; qid: string; reopen: boolean }
  | { kind: "offer_demo"; models: string[] }
  | { kind: "demo_reaction"; model: string }
  | { kind: "recommend"; model: string }
  | { kind: "reconfirm" } // do their earlier wishes still stand?
  | { kind: "nudge" }
  | { kind: "rescue" }
  | { kind: "confirm" }
  | { kind: "free" }; // staff only answered a throw-back; the customer may carry on or act

export type StaffAct =
  | { t: "ask"; qid: string; reopen?: boolean }
  | { t: "offer_demo" }
  | { t: "demo"; model: string }
  | { t: "recommend"; model: string } // staff suggest one; the way forward when questions and demos run out
  | { t: "reconfirm" } // check the wishes carried over from the phone they moved away from
  | { t: "nudge" }
  | { t: "rescue" }
  | { t: "confirm" }
  | { t: "answer" }; // answer the owed throw-back and nothing else

// What a customer can do besides answer the question on the table.
export type CustomerAction =
  | { t: "demo"; model: string }
  | { t: "pick"; model: string }
  | { t: "change"; qid: string }
  | { t: "leave" }
  | { t: "ok" };

export interface CustomerReply {
  picks?: string[]; // answers the pending menu
  throwback?: string; // optionally also throws one back (an id from the menu)
  action?: CustomerAction; // or does one of the standing actions instead
  tone: Tone;
}

export interface Snapshot {
  rows: number;
  models: string[]; // ids, in staff ranking order
}

export interface Line {
  turn: number;
  who: Role;
  tone: Tone;
  expression: string; // the face that goes with the tone, for the 3D character
  move: string; // ask, reopen, offer_demo, demo_highlight, nudge_relax, rescue, confirm, answer_throwback; or answer, throwback, action
  qid?: string;
  picks?: string[];
  throwback?: string;
  text: string;
  after: Snapshot;
}

export type Ended = { how: "bought"; sku: Sku } | { how: "left"; why: string };

export interface Scene {
  answers: Record<string, Answer>;
  order: string[]; // question ids in the order they were first answered
  fixed?: string; // the model the customer named or chose
  excluded: string[];
  demoed: string[];
  recommended: string[];
  carried: { colours?: string[]; minGB?: number } | null; // wishes that travelled with them to a new phone, not yet checked
  wantsMore: boolean; // they asked about other phones: staff ask questions again before offering anything
  declinedDemo: string[];
  relaxDeclined: number;
  wanted?: string; // a model the customer asked for that we do not carry
  gift: boolean;
  patience: number; // the customer's; staff tone and question count move it
  turn: number;
  toMove: Role;
  pending: Pending | null;
  owed: string | null; // a throw-back the staff must answer next
  owedPool: string[] | null; // the phones the customer was looking at when they asked it: "of these" means these
  forced: StaffAct | null; // the only thing staff may do next
  ended: Ended | null;
  log: Line[];
}

// A scene as the rules see it: what has been said, boiled down.
export interface Ctx {
  sc: Scene;
  c: Constraints;
  s: Signals;
  pool: Sku[];
  ranked: ModelRec[]; // models in the pool, best first (staff-side)
  model: string | null; // the one model it is down to, or that the customer fixed
}
