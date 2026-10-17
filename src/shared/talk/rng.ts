// A small seeded generator (mulberry32), so a simulated conversation can be
// replayed exactly from its seed.
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const chance = (rng: Rng, p: number): boolean => rng() < p;
export const pickOne = <T>(rng: Rng, xs: T[]): T => xs[Math.floor(rng() * xs.length)]!;

// Weighted choice; a weight of 0 is never chosen.
export function weighted<T>(rng: Rng, items: { item: T; w: number }[]): T {
  const total = items.reduce((n, i) => n + Math.max(0, i.w), 0);
  let r = rng() * total;
  for (const i of items) {
    r -= Math.max(0, i.w);
    if (r < 0) return i.item;
  }
  return items[items.length - 1]!.item;
}
