import type { ModelRec } from "./data.ts";
import type { Signals, Sku, Constraints } from "./pool.ts";
import type { Answer, CustomerAction, Ended as CoreEnded, Line, Pending, Role, StaffAct } from "../../core/types.ts";

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
} from "../../core/types.ts";

// The laptop-purchase scene's own vocabulary: same shape as the phone scene's
// types.ts (Scene, Ctx), because the turn protocol itself is identical -- the
// engine does not change, only the pool shape and the questions over it do.
// Pending, StaffAct, CustomerAction, CustomerReply, Snapshot and Line moved to
// core/types.ts in phase 2 step 2 of the core extraction
// (docs/conversation-model/core-extraction-proposal.md), once the diff
// against ../../types.ts showed them byte-identical -- confirming
// new-scene-playbook.md's claim that the turn protocol is generic, not just
// similar. Ended is generic over Sku, since what a customer "buys" differs
// per scene.

export type Ended = CoreEnded<Sku>;

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
