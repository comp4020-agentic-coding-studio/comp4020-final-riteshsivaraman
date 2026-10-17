import type { ModelRec } from "./data.ts";
import type { Signals, Sku, Constraints } from "./pool.ts";
import type { Answer, Role, Tone } from "../../core/types.ts";

export { TONES, TONE_EXPRESSION, type Tone, type Role, type Option, type Answer } from "../../core/types.ts";

// The laptop-purchase scene's own vocabulary: same shape as the phone scene's
// types.ts (Scene, Pending, StaffAct, CustomerAction, Line, Ctx), because the
// turn protocol itself is identical -- the engine does not change, only the
// pool shape and the questions over it do. This is the first evidence for
// new-scene-playbook.md's claim that the turn protocol is generic: this file
// is a near-literal copy of ../../types.ts with "phone" words swapped for
// "laptop" ones, not a redesign.

export type Pending =
  | { kind: "question"; qid: string; reopen: boolean }
  | { kind: "offer_demo"; models: string[] }
  | { kind: "demo_reaction"; model: string }
  | { kind: "recommend"; model: string }
  | { kind: "reconfirm" }
  | { kind: "nudge" }
  | { kind: "rescue" }
  | { kind: "confirm" }
  | { kind: "free" };

export type StaffAct =
  | { t: "ask"; qid: string; reopen?: boolean }
  | { t: "offer_demo" }
  | { t: "demo"; model: string }
  | { t: "recommend"; model: string }
  | { t: "reconfirm" }
  | { t: "nudge" }
  | { t: "rescue" }
  | { t: "confirm" }
  | { t: "answer" };

export type CustomerAction =
  | { t: "demo"; model: string }
  | { t: "pick"; model: string }
  | { t: "change"; qid: string }
  | { t: "leave" }
  | { t: "ok" };

export interface CustomerReply {
  picks?: string[];
  throwback?: string;
  action?: CustomerAction;
  tone: Tone;
}

export interface Snapshot {
  rows: number;
  models: string[];
}

export interface Line {
  turn: number;
  who: Role;
  tone: Tone;
  expression: string;
  move: string;
  qid?: string;
  picks?: string[];
  throwback?: string;
  text: string;
  after: Snapshot;
}

export type Ended = { how: "bought"; sku: Sku } | { how: "left"; why: string };

export interface Scene {
  answers: Record<string, Answer>;
  order: string[];
  fixed?: string;
  excluded: string[];
  demoed: string[];
  recommended: string[];
  carried: { colours?: string[]; minMemoryGb?: number; minStorageGb?: number } | null;
  wantsMore: boolean;
  declinedDemo: string[];
  relaxDeclined: number;
  wanted?: string;
  gift: boolean;
  patience: number;
  turn: number;
  toMove: Role;
  pending: Pending | null;
  owed: string | null;
  owedPool: string[] | null;
  forced: StaffAct | null;
  ended: Ended | null;
  log: Line[];
}

export interface Ctx {
  sc: Scene;
  c: Constraints;
  s: Signals;
  pool: Sku[];
  ranked: ModelRec[];
  model: string | null;
}
