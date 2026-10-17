import { MODELS, type ModelRec } from "./data.ts";

// The pool is every model x storage x colour the customer could still end up
// with, given what they have said. Hard constraints shrink it; soft signals
// never do, they only reorder the models in it (the staff-side ranking, which
// the customer never sees). Everything here is a pure function of the
// constraints and the sourced data, so any reopened answer is just a
// recomputation, with no stale effects to undo.

export type ScreenBand = "compact" | "medium" | "large";

export interface Constraints {
  model?: string; // fixed: the customer named it or chose it
  lines?: string[]; // allowed model lines ("18", "17", "air", "16", "duo")
  excluded?: string[]; // models the customer turned down
  maxPrice?: number; // AUD ceiling, applied to the tier price of each row
  minGB?: number; // storage floor
  storage?: string; // exact tier chosen
  colours?: string[]; // any of these
  foldable?: boolean;
  screen?: ScreenBand;
  maxScreenIn?: number; // "something smaller" than the one just shown
  separateTelephoto?: boolean;
  minBattery?: number; // video-playback hours
  features?: ("cameraControl" | "dynamicIsland" | "promotion")[]; // things they said they need; a phone listed without one is out
}

export interface Signals {
  photos?: boolean;
  video?: boolean;
  battery?: boolean;
  bigScreen?: boolean;
  light?: boolean;
  features?: ("cameraControl" | "dynamicIsland" | "promotion")[];
}

export interface Sku {
  model: string;
  storage: string;
  gb: number;
  colour: string;
  price: number;
}

export const screenBand = (inches: number): ScreenBand => (inches < 6.2 ? "compact" : inches < 6.5 ? "medium" : "large");

// A null attribute is "not stated", never "no": it cannot eliminate a model.
const keeps = (stated: boolean | number | null, ok: (v: number | boolean) => boolean): boolean => stated === null || ok(stated);

function modelPasses(m: ModelRec, c: Constraints): boolean {
  if (c.model !== undefined && m.id !== c.model) return false;
  if (c.lines && !c.lines.includes(m.line)) return false;
  if (c.excluded?.includes(m.id)) return false;
  if (c.foldable !== undefined && m.foldable !== c.foldable) return false;
  if (c.screen && screenBand(m.screenIn) !== c.screen) return false;
  if (c.maxScreenIn !== undefined && m.screenIn > c.maxScreenIn) return false;
  if (c.separateTelephoto && !m.separateTelephoto) return false;
  if (c.features?.some((f) => m[f] === false)) return false; // not stated is not "no"
  if (c.minBattery !== undefined && !keeps(m.batteryHours, (v) => (v as number) >= c.minBattery!)) return false;
  return true;
}

export function poolOf(c: Constraints): Sku[] {
  const rows: Sku[] = [];
  for (const m of MODELS) {
    if (!modelPasses(m, c)) continue;
    for (const t of m.tiers) {
      if (c.maxPrice !== undefined && t.price > c.maxPrice) continue;
      if (c.minGB !== undefined && t.gb < c.minGB) continue;
      if (c.storage !== undefined && t.storage !== c.storage) continue;
      for (const colour of m.colours) {
        if (c.colours && !c.colours.includes(colour)) continue;
        rows.push({ model: m.id, storage: t.storage, gb: t.gb, colour, price: t.price });
      }
    }
  }
  return rows;
}

export const modelIds = (pool: Sku[]): string[] => [...new Set(pool.map((r) => r.model))];
export const cheapest = (pool: Sku[], model: string): number => Math.min(...pool.filter((r) => r.model === model).map((r) => r.price));

// Later answers win for "last said" keys; the tightest wins for ceilings and floors.
export function mergeConstraints(a: Constraints, b: Constraints): Constraints {
  const out: Constraints = { ...a, ...b };
  if (a.maxPrice !== undefined && b.maxPrice !== undefined) out.maxPrice = Math.min(a.maxPrice, b.maxPrice);
  if (a.minGB !== undefined && b.minGB !== undefined) out.minGB = Math.max(a.minGB, b.minGB);
  if (a.minBattery !== undefined && b.minBattery !== undefined) out.minBattery = Math.max(a.minBattery, b.minBattery);
  if (a.maxScreenIn !== undefined && b.maxScreenIn !== undefined) out.maxScreenIn = Math.min(a.maxScreenIn, b.maxScreenIn);
  if (a.lines && b.lines) out.lines = a.lines.filter((l) => b.lines!.includes(l));
  if (a.colours && b.colours) out.colours = a.colours.filter((x) => b.colours!.includes(x));
  if (a.features || b.features) out.features = [...new Set([...(a.features ?? []), ...(b.features ?? [])])];
  if (a.excluded || b.excluded) out.excluded = [...new Set([...(a.excluded ?? []), ...(b.excluded ?? [])])];
  return out;
}

export function mergeSignals(a: Signals, b: Signals): Signals {
  return { ...a, ...b, features: [...new Set([...(a.features ?? []), ...(b.features ?? [])])] };
}

// ---- ranking: the staff-side order of the models in the pool ----
//
// A starting rule Ritesh accepted on 2026-10-17, to be tuned: with no signals,
// cheapest first. Photos rewards rear lens lines (+1 for a separate
// telephoto); video rewards 4K at 120 fps and ProRes; battery rewards video
// hours (40+ is 2 points, 30 to 39 is 1); each wanted feature the model has is
// 1; a big screen is 1; light rewards the lightest. Ties go to the cheaper.

const batteryPoints = (h: number | null): number => (h === null ? 0 : h >= 40 ? 2 : h >= 30 ? 1 : 0);
const lightPoints = (w: number | null): number => (w === null ? 0 : Math.max(0, Math.min(2, (180 - w) / 30)));

export function score(m: ModelRec, s: Signals): number {
  let n = 0;
  if (s.photos) n += m.lenses + (m.separateTelephoto ? 1 : 0);
  if (s.video) n += (m.fourK120 ? 1 : 0) + (m.prores ? 1 : 0);
  if (s.battery) n += batteryPoints(m.batteryHours);
  for (const f of s.features ?? []) if (m[f] === true) n += 1;
  // Among the large screens the bigger one leads: a flat point would tie them all.
  if (s.bigScreen && screenBand(m.screenIn) === "large") n += 1 + (m.screenIn - 6.5) / 10;
  if (s.light) n += lightPoints(m.weightG);
  return n;
}

export function rank(pool: Sku[], s: Signals): ModelRec[] {
  return modelIds(pool)
    .map((id) => MODELS.find((m) => m.id === id)!)
    .sort((a, b) => score(b, s) - score(a, s) || cheapest(pool, a.id) - cheapest(pool, b.id) || MODELS.indexOf(a) - MODELS.indexOf(b));
}

// ---- budget bands ----
//
// Breakpoints are the distinct tier prices in the pool, rounded up to the
// next A$100. They are thinned to at most `max` bands, always keeping the
// lowest and the one that first keeps half the models, so every band leaves a
// non-empty pool and the bands differ from each other. A "set my own ceiling"
// option sits beside them in the bank, so a ceiling below the cheapest row
// (an empty pool) is still reachable. The thinning is a rule of ours, tunable.

export const ceil100 = (n: number): number => Math.ceil(n / 100) * 100;

export function priceBands(pool: Sku[], max = 3): number[] {
  const points = [...new Set(pool.map((r) => ceil100(r.price)))].sort((a, b) => a - b);
  // The pool is over rows (model x storage x colour), so a band is worth
  // offering when it changes which rows are left, even if the models are the same.
  const rowsUnder = (b: number): number => pool.filter((r) => r.price <= b).length;
  // The top breakpoint would leave everything: that is "No real limit", offered separately.
  const bands = points.filter((b) => rowsUnder(b) < pool.length);
  if (bands.length <= max) return bands;
  const half = bands.find((b) => rowsUnder(b) >= pool.length / 2) ?? bands[Math.floor(bands.length / 2)]!;
  const last = bands[bands.length - 1]!;
  return [...new Set([bands[0]!, half, last])].sort((a, b) => a - b).slice(0, max);
}
