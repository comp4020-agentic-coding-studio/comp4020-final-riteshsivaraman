import type { Answer, Line, Option, Role, Tone } from "../../core/types.ts";
import type { Constraints, FaultCandidate, FaultModel, Signals } from "./pool.ts";

// This scene's own Pending/StaffAct/CustomerAction/Outcome, NOT the purchase-
// shaped ones in core/types.ts. The core-extraction proposal's phase-1
// analysis (docs/conversation-model/service-scene-proposal.md) found
// `demo`/`pick`/`recommend`/`{how:"bought"}` were purchase-family vocabulary
// wearing a `core/` address, not pool-shape-generic -- and phase-2 step 1's
// re-verification confirmed core/engine.ts's actual fold (derive/askable/
// gain) never required a scene to use them. So this scene defines its own
// small vocabulary instead of forcing a fit, exactly as the proposal
// recommended.

export { TONE_EXPRESSION, TONES, type Role, type Tone, type Option, type Answer, type Line } from "../../core/types.ts";

export type Pending =
  | { kind: "question"; qid: string; reopen: boolean }
  | { kind: "data_loss_ack" } // the mandatory gate: staff warned, customer must acknowledge before an outcome can be offered
  | { kind: "outcome_choice" } // fixed now / book it / decline, generated from the confirmed fault
  | { kind: "free" };

export type StaffAct =
  | { t: "ask"; qid: string; reopen?: boolean }
  | { t: "run_check" } // deterministic: reads the fault table, writes a fact (pool.ts's confirmedFault), not a dice roll
  | { t: "warn_data_loss" } // the mandatory line; only legal once a destructive fault is confirmed
  | { t: "present_outcome" } // blocked until the data-loss gate has been cleared, when the confirmed fault is destructive
  | { t: "cannot_diagnose" } // no fault in the table matches ("something else", or every candidate was ruled out)
  | { t: "answer" };

export type CustomerAction = { t: "change"; qid: string } | { t: "leave" } | { t: "ok" };

export interface CustomerReply {
  picks?: string[];
  action?: CustomerAction;
  tone: Tone;
}

// fixed_now/booked both mean "fixed"; booked carries where and the (invented,
// [TK]) ETA. cannot_fix is the no-match path; declines is the customer
// turning down the quote; left is leaving mid-conversation.
export type Outcome = { how: "fixed_now" } | { how: "booked"; location: "in_store" | "send_away"; etaDays: number | null } | { how: "cannot_fix" } | { how: "declines" } | { how: "left"; why: string };

export interface Scene {
  answers: Record<string, Answer>;
  order: string[];
  excluded: string[]; // faults ruled out by a "no" answer or a confirmed check
  fixed?: string; // required by core/engine.ts's EngineSceneFields bound; unused in this scene (there is no "fixed item" concept)
  turn: number;
  toMove: Role;
  pending: Pending | null;
  forced: StaffAct | null;
  dataLossWarned: boolean; // the mandatory gate (service-scene-proposal.md finding (c)): set only by warn_data_loss, cleared never
  ended: Outcome | null;
  log: Line[];
}

export interface Ctx {
  sc: Scene;
  c: Constraints;
  s: Signals;
  pool: FaultCandidate[];
  ranked: FaultModel[];
  model: string | null; // the one fault it is down to (core/engine.ts's generic name for this slot)
}
