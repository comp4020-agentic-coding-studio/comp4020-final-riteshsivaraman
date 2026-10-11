// What a person is doing, as a small set of behaviours with a weight (how
// often), a duration range (how long) and the moods that fit it. The choice is
// pure: it takes a random number, so each person can run their own clock and
// no two people move or look in step. How a behaviour is posed is the
// client's business (gfx/character.ts); this only decides which, and when.

export type Behaviour =
  | "idle"
  | "walk"
  | "observe" // leaning over a product, a hand at the chin
  | "work" // both hands busy at a bench
  | "wave"
  | "talk"
  | "think"
  | "phone"
  | "crossed" // arms folded
  | "laugh"
  | "point"
  // only ever chosen as part of an interaction (see shared/interaction.ts)
  | "listen"
  | "handshake"
  | "clap"
  | "bow";

export const BEHAVIOURS: Behaviour[] = ["idle", "walk", "observe", "work", "wave", "talk", "think", "phone", "crossed", "laugh", "point", "listen", "handshake", "clap", "bow"];

// How often each is picked, relative to the others.
export const WEIGHTS: Record<Behaviour, number> = {
  idle: 5,
  walk: 3,
  observe: 2,
  work: 1,
  wave: 1,
  talk: 3,
  think: 1.5,
  phone: 2,
  crossed: 1.5,
  laugh: 1,
  point: 1,
  // part of an interaction only: never picked on their own
  listen: 0,
  handshake: 0,
  clap: 0,
  bow: 0,
};

// Seconds, [min, max].
export const DURATION: Record<Behaviour, [number, number]> = {
  idle: [3, 8],
  walk: [4, 10],
  observe: [4, 9],
  work: [6, 12],
  wave: [2, 3.5],
  talk: [4, 9],
  think: [3, 6],
  phone: [4, 9],
  crossed: [3, 8],
  laugh: [2, 4],
  point: [2, 4],
  listen: [3, 8],
  handshake: [2, 4],
  clap: [2, 5],
  bow: [1.5, 3],
};

// Expression names (see EXPRESSIONS in gfx/character.ts) that fit each.
export const MOODS: Record<Behaviour, string[]> = {
  idle: ["neutral", "neutral", "smile"],
  walk: ["neutral", "smile", "curious"],
  observe: ["curious", "focused", "smile"],
  work: ["focused", "neutral"],
  wave: ["smile"],
  talk: ["smile", "neutral", "curious", "surprised"],
  think: ["curious", "focused", "worried"],
  phone: ["neutral", "focused", "smile"],
  crossed: ["neutral", "worried", "focused"],
  laugh: ["smile"],
  point: ["curious", "neutral", "surprised"],
  listen: ["neutral", "smile", "curious"],
  handshake: ["smile"],
  clap: ["smile"],
  bow: ["smile", "neutral"],
};

// What a person does on their own when the crowd is "interactions only": they
// stand about and wander between conversations, with no gestures to nobody.
export const BETWEEN_INTERACTIONS: Behaviour[] = ["idle", "walk"];

// Picks one by weight from r in [0, 1). `only`, if given, limits the choice.
// `not` is skipped, so a person never
// repeats the same thing back to back. Weight 0 is never picked: those are only
// ever part of an interaction.
export function pickBehaviour(r: number, not?: Behaviour, only?: ReadonlyArray<Behaviour>): Behaviour {
  const pool = BEHAVIOURS.filter((b) => b !== not && WEIGHTS[b] > 0 && (!only || only.includes(b)));
  if (pool.length === 0) return only?.[0] ?? "idle";
  const total = pool.reduce((a, b) => a + WEIGHTS[b], 0);
  let x = Math.min(0.999999, Math.max(0, r)) * total;
  for (const b of pool) {
    x -= WEIGHTS[b];
    if (x < 0) return b;
  }
  return pool[pool.length - 1];
}

export function pickMood(b: Behaviour, r: number): string {
  const list = MOODS[b];
  return list[Math.min(list.length - 1, Math.floor(r * list.length))];
}

export function durationFor(b: Behaviour, r: number): number {
  const [lo, hi] = DURATION[b];
  return lo + (hi - lo) * r;
}

// How much to turn to keep from walking into someone, from -1 to 1 (positive
// is a heading increase, which swings the walker away from a person on that
// side). Zero when nobody is close, ahead and roughly in the way. Pure, so a
// crowd of walkers steers the same way for the same positions.
export function avoidanceTurn(
  x: number,
  z: number,
  heading: number,
  others: ReadonlyArray<{ x: number; z: number }>,
  lookAhead = 1.2,
  halfAngle = 0.9,
): number {
  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  const cosLimit = Math.cos(halfAngle);
  let turn = 0;
  for (const o of others) {
    const dx = o.x - x;
    const dz = o.z - z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6 || d > lookAhead) continue;
    if ((dx * fx + dz * fz) / d < cosLimit) continue;
    const cross = fx * dz - fz * dx;
    turn += (cross >= 0 ? 1 : -1) * (1 - d / lookAhead);
  }
  return Math.max(-1, Math.min(1, turn));
}
