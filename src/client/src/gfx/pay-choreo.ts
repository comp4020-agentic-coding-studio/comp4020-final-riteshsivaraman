// The payment beats (issue #42), as a pure function of the server's stored
// state and the server's clock: which beat the checkout is on, the server
// time that beat was reached, and the sale the server stored. Nothing here
// reads Date.now() or keeps its own timer, so every viewer in the room draws
// the same moment of the same beat, and a viewer who joins mid-payment sees
// where it has got to, not a replay from the start.
//
// The beats themselves are #2's (src/server/service.ts, advanceBeat):
// scanned -> total_shown -> tapped, then the order is paid. This module only
// decides how a beat looks at time `now`: the handheld raised or not, which
// way it is turned, the scan beam, the tap ripple, and what its screen says.

export type PayBeat = "scanned" | "total_shown" | "tapped";

// What the server says about a payment in progress (OrderView.pay).
export interface PayBeatState {
  beat: PayBeat;
  beatAt: number; // server ms the current beat was reached
  name: string;
  colour: string;
  storage: string;
  price: number; // the server's stored sale price, never computed here
  paidAt?: number; // server ms the order was paid (stage "paid"), if it has been
}

export type HandheldScreen =
  | { kind: "idle" }
  | { kind: "scan"; item: string }
  | { kind: "scanned"; item: string }
  | { kind: "total"; item: string; detail: string; price: string }
  | { kind: "paid"; price: string };

export interface HandheldPose {
  raise: number; // 0 hanging at the side, 1 up in front of the chest
  aim: number; // 0 screen to the holder (scanning), 1 screen to the customer
  beam: number; // 0..1 brightness of the scan beam
  sweep: number; // 0..1 where the scan line is on the screen, < 0 for none
  ripple: number; // 0..1 how far the tap ripple has spread, < 0 for none
  screen: HandheldScreen;
}

export const REST: HandheldPose = { raise: 0, aim: 0, beam: 0, sweep: -1, ripple: -1, screen: { kind: "idle" } };

// Timings, in ms after the beat's own server time.
export const RAISE_MS = 400; // the handheld comes up
export const SCAN_FROM = 300; // the beam starts once it is up
export const SCAN_MS = 1000; // and sweeps for this long
export const BEEP_AT = SCAN_FROM + SCAN_MS; // the scan beep: the item is read
export const NPC_TOTAL_AT = BEEP_AT + 300; // an NPC turns the total to the customer (see below)
export const TURN_MS = 400; // turning the screen to the customer
export const RIPPLE_MS = 700; // the tap ripple, then the tick
export const PAID_HOLD_MS = 3000; // the tick is held out this long after paying
export const LOWER_MS = 800; // then it goes back down (inside the server's 4 s paid window)

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (v: number): number => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

// Matches the server's own wording of a price (service.ts payTurn), so the
// handheld and the customer's conversation box show the same characters.
export const priceText = (price: number): string => `A$${price.toLocaleString("en-AU")}`;

// `npcStaff`: an NPC specialist never presses "show total" (the server's
// customer tap catches up every beat at once, service.ts handleCheckoutChoice),
// and the server's payment turn already tells the customer the price at the
// scan beat. So for an NPC the screen turns to the customer with the total once
// the scan has finished, still timed off the scan beat's server time.
export function payPose(p: PayBeatState, now: number, npcStaff: boolean): HandheldPose {
  const item = `${p.colour} ${p.name}`;
  const total: HandheldScreen = { kind: "total", item: p.name, detail: `${p.colour}, ${p.storage}`, price: priceText(p.price) };
  if (p.paidAt !== undefined) {
    const t = now - p.paidAt;
    const down = ease((t - PAID_HOLD_MS) / LOWER_MS);
    if (t < RIPPLE_MS) return { raise: 1, aim: 1, beam: 0, sweep: -1, ripple: clamp01(t / RIPPLE_MS), screen: total };
    return { raise: 1 - down, aim: 1 - down, beam: 0, sweep: -1, ripple: -1, screen: { kind: "paid", price: priceText(p.price) } };
  }
  const t = now - p.beatAt;
  if (p.beat === "scanned") {
    const raise = ease(t / RAISE_MS);
    const s = (t - SCAN_FROM) / SCAN_MS;
    const scanning = s >= 0 && s < 1;
    if (npcStaff && t >= NPC_TOTAL_AT) return { raise, aim: ease((t - NPC_TOTAL_AT) / TURN_MS), beam: 0, sweep: -1, ripple: -1, screen: total };
    return {
      raise,
      aim: 0,
      beam: scanning ? 0.6 + 0.4 * Math.abs(Math.sin(s * Math.PI * 3)) : 0,
      sweep: scanning ? s : -1,
      ripple: -1,
      screen: t < BEEP_AT ? { kind: "scan", item } : { kind: "scanned", item },
    };
  }
  if (p.beat === "total_shown") return { raise: 1, aim: ease(t / TURN_MS), beam: 0, sweep: -1, ripple: -1, screen: total };
  // tapped, not yet paid (the server pays in the same request, so this is brief)
  return { raise: 1, aim: 1, beam: 0, sweep: -1, ripple: clamp01(t / RIPPLE_MS), screen: total };
}

// The sound cue a beat earns at `now`, if it has just become due: the scan
// beep when the item is read, the chirp when the customer taps. `since` is the
// last time this was asked for the same payment, so each cue plays once.
export function cueDue(p: PayBeatState, since: number, now: number): "beep" | "chirp" | null {
  if (p.paidAt !== undefined) return since < p.paidAt && now >= p.paidAt ? "chirp" : null;
  if (p.beat === "tapped") return since < p.beatAt && now >= p.beatAt ? "chirp" : null;
  if (p.beat === "scanned") {
    const at = p.beatAt + BEEP_AT;
    return since < at && now >= at ? "beep" : null;
  }
  return null;
}
