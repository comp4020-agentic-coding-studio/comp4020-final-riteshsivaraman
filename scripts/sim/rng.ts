// A tiny seeded PRNG (mulberry32), so a run can be replayed with --seed=N --
// same habit this codebase already uses for storeday.ts's timetable (D32).
// Not cryptographic; good enough for "roll the dice" flavour.
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const roll = (rng: Rng, probability: number): boolean => rng() < probability;
export const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
