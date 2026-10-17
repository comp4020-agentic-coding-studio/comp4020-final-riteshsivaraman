import raw from "../../../../../docs/conversation-model/laptops.json" with { type: "json" };

// The laptops the scene can talk about, normalised from the sourced scrape
// (docs/conversation-model/laptops.json, Apple AU, fetched 2026-10-18). Mirrors
// src/shared/talk/data.ts's shape and discipline (null = not stated, a filter
// on null never eliminates), with one difference the phone data did not need:
// a MacBook "model" here is one screen size x chip tier (the way Pro and Pro
// Max are already separate phone models), because the chip tier is what a
// customer asks about and what changes CPU/GPU core count, weight and
// battery, not just a price tier the way phone storage is. Only Apple's own
// preconfigured SKUs are modelled (see laptops-v2-notes.md "What is modelled"):
// build-to-order memory/storage combinations beyond those SKUs are out of
// scope tonight, same spirit as a phone attribute the scrape did not state.

export type Family = "air" | "pro";

export interface Tier {
  memoryGb: number;
  storageGb: number;
  price: number; // AUD
}

export interface ModelRec {
  id: string;
  name: string; // "MacBook Pro 14-inch (M5 Pro)"
  family: Family;
  screenIn: number;
  chip: string; // "M5", "M5 Pro", "M5 Max"
  cpuCores: number;
  gpuCores: number;
  weightG: number;
  batteryHours: number; // video streaming
  thunderboltGen: 4 | 5;
  wifi7: boolean;
  colours: string[];
  tiers: Tier[];
}

interface RawSku {
  part_number: string;
  colour: string;
  chip?: string;
  cpu_cores?: number;
  gpu_cores: number;
  memory_gb: number;
  storage_gb: number;
  priceAUD: number;
  finish?: string;
}
interface Field<T> {
  value: T;
}
interface RawModel {
  model: string;
  chip: Field<string>;
  screen_inches: Field<string>;
  weight_g: Field<string>;
  battery_video_playback: Field<string>;
  ports: Field<string>;
  wifi: Field<string>;
  preconfigured_skus: RawSku[];
  chip_tiers?: Field<{ chip: string; cpu_cores: number; gpu_cores: number }[]>;
}

const screenInOf = (m: RawModel): number => parseFloat(/(\d+(?:\.\d+)?)-inch/.exec(m.screen_inches.value)?.[1] ?? "NaN");

// The Pro's ports/wifi/weight/battery text covers several chip tiers in one
// sentence ("M5: X; M5 Pro: Y; M5 Max: Z", or "M5 Pro/Max: Y" covering two at
// once); pick the clause that names this chip, falling back to a clause that
// names it alongside another tier ("M5 Pro/Max"), and only then to a sentence
// with no per-tier breakdown at all (every tier the same).
function clauseFor(text: string, chip: string): string | null {
  for (const clause of text.split(";")) {
    const label = clause.split(":")[0]?.trim() ?? "";
    const tiers = label.split("/").map((t) => t.trim());
    // "M5 Pro/Max" splits to ["M5 Pro", "Max"]; expand "Max" back to "M5 Max".
    const expanded = tiers.map((t, i) => (i > 0 && !/^M\d/.test(t) ? `${tiers[0]!.split(" ")[0]} ${t}` : t));
    if (expanded.includes(chip)) return clause;
  }
  return text.includes(":") ? null : text; // no per-tier breakdown: the whole text applies to every tier
}
function perTier(text: string, chip: string): number | null {
  const clause = clauseFor(text, chip);
  if (clause === null) return null;
  // Skip past "M5 Pro:" etc. before looking for the figure, so the "5" in the
  // chip's own name is never mistaken for the number that follows the colon.
  const afterLabel = clause.includes(":") ? clause.slice(clause.indexOf(":") + 1) : clause;
  const m = /(\d+(?:\.\d+)?)/.exec(afterLabel);
  return m ? Number(m[1]) : null;
}
const thunderboltGen = (m: RawModel, chip: string): 4 | 5 => {
  const clause = clauseFor(m.ports.value, chip) ?? m.ports.value;
  return /Thunderbolt 5/.test(clause) ? 5 : 4;
};
const hasWifi7 = (m: RawModel, chip: string): boolean => {
  const clause = clauseFor(m.wifi.value, chip) ?? m.wifi.value;
  return /Wi-Fi 7/.test(clause);
};

function buildModel(m: RawModel, chip: string, cpuCores: number, gpuCores: number, skus: RawSku[]): ModelRec {
  const screenIn = screenInOf(m);
  const size = screenIn < 14 ? "13" : screenIn < 15 ? "14" : screenIn < 16 ? "15" : "16";
  const weightG = perTier(m.weight_g.value, chip) ?? Number(/(\d+)\s*g/.exec(m.weight_g.value)?.[1] ?? NaN);
  const batteryHours = perTier(m.battery_video_playback.value, chip) ?? Number(/Up to (\d+) hours/.exec(m.battery_video_playback.value)?.[1] ?? NaN);
  // The nano-texture (anti-glare) finish is a separate SKU at the same
  // memory/storage as the standard finish: no bank question distinguishes a
  // display finish, so including both would give two rows the engine could
  // never resolve between (no legal move narrows them, and neither "confirm"
  // nor a reopen can single one out) -- the scene would get stuck forever
  // offering "which colour" on a pool of one colour and two indistinguishable
  // rows. Out of scope tonight, same spirit as build-to-order memory/storage
  // (see laptops-v2-notes.md "What is modelled"): only the standard finish is
  // priced into this catalogue.
  const skusStandard = skus.filter((s) => s.finish !== "nano-texture");
  const colours = [...new Set(skusStandard.map((s) => s.colour))];
  const tiers: Tier[] = skusStandard
    .map((s) => ({ memoryGb: s.memory_gb, storageGb: s.storage_gb, price: s.priceAUD }))
    .filter((t, i, arr) => arr.findIndex((x) => x.memoryGb === t.memoryGb && x.storageGb === t.storageGb && x.price === t.price) === i)
    .sort((a, b) => a.price - b.price);
  const family: Family = /Air/.test(m.model) ? "air" : "pro";
  const id = `${family}-${size}${chip === "M5" && family === "pro" ? "" : chip !== "M5" ? `-${chip.toLowerCase().replace(/\s+/g, "-")}` : ""}`;
  const name = family === "air" ? `MacBook Air ${size}-inch` : `MacBook Pro ${size}-inch (${chip})`;
  return {
    id,
    name,
    family,
    screenIn,
    chip,
    cpuCores,
    gpuCores,
    weightG,
    batteryHours,
    thunderboltGen: thunderboltGen(m, chip),
    wifi7: hasWifi7(m, chip),
    colours,
    tiers,
  };
}

function modelsFrom(m: RawModel): ModelRec[] {
  if (!m.chip_tiers) {
    // Air: one chip ("M5"), GPU core count varies by SKU but is not asked about
    // as a separate "model" the way a phone's storage tier isn't either.
    const gpuCores = Math.max(...m.preconfigured_skus.map((s) => s.gpu_cores));
    return [buildModel(m, "M5", 10, gpuCores, m.preconfigured_skus)];
  }
  // Pro: each chip tier is its own model (see module comment).
  return m.chip_tiers.value.map((t) => buildModel(m, t.chip, t.cpu_cores, t.gpu_cores, m.preconfigured_skus.filter((s) => s.chip === t.chip)));
}

export const MODELS: ModelRec[] = (raw as unknown as RawModel[]).flatMap(modelsFrom);

export const modelById = (id: string): ModelRec => {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`no such laptop model: ${id}`);
  return m;
};
