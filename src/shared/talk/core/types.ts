// The vocabulary shared by every scene on this engine: two parties taking
// turns, every line tagged with a tone that shows on the speaker's face.
// Nothing here knows about phones, laptops or any specific pool shape -- a
// scene's own types.ts (see scenes/phone/types.ts) adds Scene, Pending,
// StaffAct and the rest, which do depend on that scene's pool.

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
// types in (e.g. "set my own ceiling"), in which case a pick is
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

// Phase 2 step 2 of the core extraction
// (docs/conversation-model/core-extraction-proposal.md): Pending, StaffAct,
// CustomerAction, CustomerReply, Snapshot and Line turned out to be
// byte-identical between the phone and laptop scenes' types.ts -- neither
// references a phone- or laptop-specific field, only question ids (plain
// strings) and model ids (plain strings). Ended is the one with a real
// difference (what `sku` looks like when the customer buys), so it is generic
// over Sku. Each scene's own types.ts re-exports these instantiated with its
// own Sku, instead of redeclaring the same union by hand.

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
  | { t: "reconfirm" } // check the wishes carried over from the item they moved away from
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

export type Ended<Sku> = { how: "bought"; sku: Sku } | { how: "left"; why: string };
