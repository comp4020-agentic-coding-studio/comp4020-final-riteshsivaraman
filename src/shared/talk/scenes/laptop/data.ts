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
  nanoTexture?: boolean; // the Pro's optional anti-glare finish, priced as its own SKU
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
const thunderboltGen = (m: RawModel): 4 | 5 => (/Thunderbolt 5/.test(m.ports.value) ? 5 : 4);

// The Pro's ports/wifi/weight/battery text covers several chip tiers in one
// sentence ("M5: X; M5 Pro: Y; M5 Max: Z"); pick the figure named for this tier.
function perTier(text: string, chip: string): number | null {
  const re = new RegExp(`${chip.replace(/\s+/g, "\\s+")}[^;]*?(\\d+(?:\\.\\d+)?)`, "i");
  const m = re.exec(text);
  return m ? Number(m[1]) : null;
}

function buildModel(m: RawModel, chip: string, cpuCores: number, gpuCores: number, skus: RawSku[]): ModelRec {
  const screenIn = screenInOf(m);
  const size = screenIn < 14 ? "13" : screenIn < 15 ? "14" : screenIn < 16 ? "15" : "16";
  const weightG = perTier(m.weight_g.value, chip) ?? Number(/(\d+)\s*g/.exec(m.weight_g.value)?.[1] ?? NaN);
  const batteryHours = perTier(m.battery_video_playback.value, chip) ?? Number(/Up to (\d+) hours/.exec(m.battery_video_playback.value)?.[1] ?? NaN);
  const colours = [...new Set(skus.map((s) => s.colour))];
  const tiers: Tier[] = skus
    .map((s) => ({ memoryGb: s.memory_gb, storageGb: s.storage_gb, price: s.priceAUD, nanoTexture: s.finish === "nano-texture" || undefined }))
    .filter((t, i, arr) => arr.findIndex((x) => x.memoryGb === t.memoryGb && x.storageGb === t.storageGb && x.price === t.price && !!x.nanoTexture === !!t.nanoTexture) === i)
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
    thunderboltGen: thunderboltGen(m),
    wifi7: /Wi-Fi 7/.test(m.wifi.value),
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
