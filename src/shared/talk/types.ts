import type { ModelRec } from "./data.ts";
import type { Signals, Sku, Constraints } from "./pool.ts";

// The vocabulary of one phone-specialist conversation: two parties, taking
// turns, every line a pick from a menu. Nothing here knows about a screen or a
// network; the same scene runs in a spec, in an NPC-vs-NPC simulation and in
// the proof-of-concept page.
//
// Tone, Role, Option, Answer, Pending, StaffAct, CustomerAction,
// CustomerReply, Snapshot and Line are the part of this vocabulary that does
// not depend on the phone pool shape (phase 2 step 2 of the core extraction,
// docs/conversation-model/core-extraction-proposal.md: diffed byte-identical
// against scenes/laptop/types.ts); they live in core/types.ts and every scene
// reuses them unchanged. Re-exported here so every existing import of
// "./types.ts" keeps working. Ended is generic over Sku, since what a
// customer "buys" differs per scene.

export {
  TONES,
  TONE_EXPRESSION,
  type Tone,
  type Role,
  type Option,
  type Answer,
  type Pending,
  type StaffAct,
  type CustomerAction,
  type CustomerReply,
  type Snapshot,
  type Line,
} from "./core/types.ts";
import type { Answer, CustomerAction, Ended as CoreEnded, Line, Pending, Role, StaffAct } from "./core/types.ts";

export type Ended = CoreEnded<Sku>;

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
