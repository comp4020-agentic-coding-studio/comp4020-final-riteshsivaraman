import type { ModelRec } from "./data.ts";
import type { Signals, Sku, Constraints } from "./pool.ts";

// The vocabulary of one phone-specialist conversation: two parties, taking
// turns, every line a pick from a menu. Nothing here knows about a screen or a
// network; the same scene runs in a spec, in an NPC-vs-NPC simulation and in
// the proof-of-concept page.

export type Tone = "friendly" | "neutral" | "impatient" | "unsure";
export const TONES: Tone[] = ["friendly", "neutral", "impatient", "unsure"];

// In the store the tone shows on the speaker's face. These are names from the
// character's own expression set (EXPRESSIONS in src/client/src/gfx/character.ts),
// so the shop reads them off the line without a lookup of its own. There is no
// "annoyed" face yet: focused (brows pulled down, mouth flat) is the nearest to
// impatient, and a proper one would be graphics' to add.
export const TONE_EXPRESSION: Record<Tone, "smile" | "neutral" | "focused" | "worried"> = {
  friendly: "smile",
  neutral: "neutral",
  impatient: "focused",
  unsure: "worried",
};

export type Role = "staff" | "customer";

// A menu item. Most are fixed; `param` makes one take a number the picker
// types in (the "set my own ceiling" option), in which case a pick is
// `prefix + value`.
export interface Option {
  id: string;
  label: string;
  group?: string; // the UI may fold a long group away ("other colours")
  neutral?: boolean; // "Not sure", "none of these": a pick that changes nothing
  param?: { prefix: string; min: number; max: number; step: number };
}

export interface Answer {
  picks: string[];
  turn: number;
}

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
