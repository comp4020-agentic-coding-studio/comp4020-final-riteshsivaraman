import { NPCS } from "../../shared/npcs.ts";
import type { OrderView } from "../../shared/protocol.ts";
import { sound } from "./audio.ts";
import { cueDue, payPose, type HandheldPose, type PayBeatState } from "./gfx/pay-choreo.ts";
import { net } from "./net.ts";

// The payment beats (issue #42) as everyone in the room sees them, read from
// the server's OrderView.pay (#49): which beat, the server time it was
// reached, and the stored sale. Called from each staff avatar's frame loop,
// so it is a pure read of net state plus the server clock, nothing kept.

const NPC_IDS = new Set(NPCS.map((n) => n.id));

export function payState(o: OrderView): PayBeatState | undefined {
  if (!o.pay) return undefined;
  return { ...o.pay, ...(o.stage === "paid" && o.paidAt !== undefined ? { paidAt: o.paidAt } : {}) };
}

// The handheld pose for a member of staff right now, or undefined at rest.
export function handheldPoseFor(staffId: string): HandheldPose | undefined {
  const o = net.payingWith(staffId);
  const p = o && payState(o);
  return p ? payPose(p, net.serverNow(), NPC_IDS.has(staffId)) : undefined;
}

// The scan beep and the tap chirp, for the two people in a payment only (the
// cues are not spatialised, audio.ts, so a stranger across the room hearing
// them would be wrong). Each cue plays once, when its server time passes.
let lastAsked = 0;
let lastOrder = "";
export function playPayCues(): void {
  const now = net.serverNow();
  const o = net.myPayingOrder;
  const p = o && payState(o);
  if (!o || !p) {
    lastOrder = "";
    return;
  }
  // a payment first seen now: nothing that already happened plays late
  const since = o.id === lastOrder ? lastAsked : now;
  lastOrder = o.id;
  lastAsked = now;
  const cue = cueDue(p, since, now);
  if (cue === "beep") sound.playScanBeep();
  else if (cue === "chirp") sound.playNfcChirp();
}
