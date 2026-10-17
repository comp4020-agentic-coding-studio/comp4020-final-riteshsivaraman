import { MODELS, type Family, type ModelRec } from "./data.ts";

// The pool is every model x memory x storage x colour the customer could
// still end up with, given what they have said. Same shape as
// src/shared/talk/pool.ts (phones): hard constraints shrink it, soft signals
// only reorder the models in it. A null attribute never eliminates.

export interface Constraints {
  model?: string; // fixed: the customer named it or chose it
  family?: Family; // "air" or "pro"
  excluded?: string[]; // models the customer turned down
  maxPrice?: number; // AUD ceiling, applied to the tier price
  minMemoryGb?: number;
  minStorageGb?: number;
  storage?: number; // exact tier storage chosen (GB)
  colours?: string[];
  maxWeightG?: number; // "something I can carry around"
  minBattery?: number; // video-streaming hours
  minScreenIn?: number;
  maxScreenIn?: number;
  minThunderboltGen?: 4 | 5;
}

export interface Signals {
  portability?: boolean; // rewards light, smaller screen
  performance?: boolean; // rewards CPU/GPU cores
  battery?: boolean;
  screen?: boolean; // rewards bigger screen
  longevity?: boolean; // rewards the higher chip tier, a proxy for "must last years"
}

export interface Sku {
  model: string;
  memoryGb: number;
  storageGb: number;
  colour: string;
  price: number;
  nanoTexture?: boolean;
}

const keeps = (stated: number | null, ok: (v: number) => boolean): boolean => stated === null || ok(stated);

function modelPasses(m: ModelRec, c: Constraints): boolean {
  if (c.model !== undefined && m.id !== c.model) return false;
  if (c.family && m.family !== c.family) return false;
  if (c.excluded?.includes(m.id)) return false;
  if (c.maxWeightG !== undefined && !keeps(m.weightG, (v) => v <= c.maxWeightG!)) return false;
  if (c.minBattery !== undefined && !keeps(m.batteryHours, (v) => v >= c.minBattery!)) return false;
  if (c.minScreenIn !== undefined && m.screenIn < c.minScreenIn) return false;
  if (c.maxScreenIn !== undefined && m.screenIn > c.maxScreenIn) return false;
  if (c.minThunderboltGen !== undefined && m.thunderboltGen < c.minThunderboltGen) return false;
  return true;
}

export function poolOf(c: Constraints): Sku[] {
  const rows: Sku[] = [];
  for (const m of MODELS) {
    if (!modelPasses(m, c)) continue;
    for (const t of m.tiers) {
      if (c.maxPrice !== undefined && t.price > c.maxPrice) continue;
      if (c.minMemoryGb !== undefined && t.memoryGb < c.minMemoryGb) continue;
      if (c.minStorageGb !== undefined && t.storageGb < c.minStorageGb) continue;
      if (c.storage !== undefined && t.storageGb !== c.storage) continue;
      for (const colour of m.colours) {
        if (c.colours && !c.colours.includes(colour)) continue;
        rows.push({ model: m.id, memoryGb: t.memoryGb, storageGb: t.storageGb, colour, price: t.price, nanoTexture: t.nanoTexture });
      }
    }
  }
  return rows;
}

export const modelIds = (pool: Sku[]): string[] => [...new Set(pool.map((r) => r.model))];
export const cheapest = (pool: Sku[], model: string): number => Math.min(...pool.filter((r) => r.model === model).map((r) => r.price));

export function mergeConstraints(a: Constraints, b: Constraints): Constraints {
  const out: Constraints = { ...a, ...b };
  if (a.maxPrice !== undefined && b.maxPrice !== undefined) out.maxPrice = Math.min(a.maxPrice, b.maxPrice);
  if (a.minMemoryGb !== undefined && b.minMemoryGb !== undefined) out.minMemoryGb = Math.max(a.minMemoryGb, b.minMemoryGb);
  if (a.minStorageGb !== undefined && b.minStorageGb !== undefined) out.minStorageGb = Math.max(a.minStorageGb, b.minStorageGb);
  if (a.minBattery !== undefined && b.minBattery !== undefined) out.minBattery = Math.max(a.minBattery, b.minBattery);
  if (a.maxWeightG !== undefined && b.maxWeightG !== undefined) out.maxWeightG = Math.min(a.maxWeightG, b.maxWeightG);
  if (a.minScreenIn !== undefined && b.minScreenIn !== undefined) out.minScreenIn = Math.max(a.minScreenIn, b.minScreenIn);
  if (a.maxScreenIn !== undefined && b.maxScreenIn !== undefined) out.maxScreenIn = Math.min(a.maxScreenIn, b.maxScreenIn);
  if (a.minThunderboltGen !== undefined && b.minThunderboltGen !== undefined) out.minThunderboltGen = Math.max(a.minThunderboltGen, b.minThunderboltGen) as 4 | 5;
  if (a.colours && b.colours) out.colours = a.colours.filter((x) => b.colours!.includes(x));
  if (a.excluded || b.excluded) out.excluded = [...new Set([...(a.excluded ?? []), ...(b.excluded ?? [])])];
  return out;
}

export function mergeSignals(a: Signals, b: Signals): Signals {
  return { ...a, ...b };
}

// ---- ranking: the staff-side order of the models in the pool ----
//
// Mirrors the starting-rule spirit of the phone scene's rank() (cheapest
// first with no signals; soft signals add points). Portability rewards light
// weight and a smaller screen; performance and longevity reward more
// CPU/GPU cores (a chip tier proxy); battery rewards hours; screen rewards
// a bigger display. Ties go to the cheaper. A starting rule, not a considered
// one -- same caveat as the phone scene's.

const lightPoints = (w: number): number => Math.max(0, Math.min(2, (2200 - w) / 400));
const batteryPoints = (h: number): number => (h >= 24 ? 2 : h >= 20 ? 1 : 0);
const corePoints = (m: ModelRec): number => (m.cpuCores >= 18 ? 2 : m.cpuCores >= 15 ? 1 : 0);

export function score(m: ModelRec, s: Signals): number {
  let n = 0;
  if (s.portability) n += lightPoints(m.weightG) + (m.screenIn <= 14 ? 1 : 0);
  if (s.performance) n += corePoints(m);
  if (s.longevity) n += corePoints(m);
  if (s.battery) n += batteryPoints(m.batteryHours);
  if (s.screen) n += m.screenIn >= 16 ? 2 : m.screenIn >= 15 ? 1 : 0;
  return n;
}

export function rank(pool: Sku[], s: Signals): ModelRec[] {
  return modelIds(pool)
    .map((id) => MODELS.find((m) => m.id === id)!)
    .sort((a, b) => score(b, s) - score(a, s) || cheapest(pool, a.id) - cheapest(pool, b.id) || MODELS.indexOf(a) - MODELS.indexOf(b));
}

// ---- budget bands ----
// Same thinning rule as the phone scene's priceBands (pool.ts): distinct tier
// prices rounded up to the next A$100, thinned to at most `max` bands.

export const ceil100 = (n: number): number => Math.ceil(n / 100) * 100;

export function priceBands(pool: Sku[], max = 3): number[] {
  const points = [...new Set(pool.map((r) => ceil100(r.price)))].sort((a, b) => a - b);
  const rowsUnder = (b: number): number => pool.filter((r) => r.price <= b).length;
  const bands = points.filter((b) => rowsUnder(b) < pool.length);
  if (bands.length <= max) return bands;
  const half = bands.find((b) => rowsUnder(b) >= pool.length / 2) ?? bands[Math.floor(bands.length / 2)]!;
  const last = bands[bands.length - 1]!;
  return [...new Set([bands[0]!, half, last])].sort((a, b) => a - b).slice(0, max);
}
