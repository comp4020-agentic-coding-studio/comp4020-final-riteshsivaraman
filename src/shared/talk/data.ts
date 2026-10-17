import raw from "../../../docs/conversation-model/devices.json" with { type: "json" };

// The phones the scene can talk about, normalised from the sourced scrape
// (docs/conversation-model/devices.json, Apple AU, fetched 2026-10-17). Every
// field is copied or parsed from a stated value; where the page says nothing
// the field is null, and nothing downstream may treat null as "no" (a filter
// on a null attribute keeps the model).

export type Tri = boolean | null;

export interface Tier {
  storage: string; // "256GB", as Apple lists it
  gb: number;
  price: number; // AUD
}

export interface ModelRec {
  id: string;
  name: string;
  line: "18" | "17" | "air" | "16" | "duo"; // derived from the name; the scrape has no family field
  foldable: boolean;
  screenIn: number; // largest screen (the Duo's inner display)
  outerIn: number | null; // the foldable's outer display
  weightG: number | null;
  lenses: number; // rear camera lines listed
  separateTelephoto: boolean; // a lens line named "Telephoto" of its own, not the 2x crop most models advertise
  maxZoomX: number | null; // furthest optical(-quality) zoom in; null when no range line
  batteryHours: number | null; // first "Up to N hours" video-playback figure
  batteryOuter: boolean; // that figure is for the outer display (the Duo's)
  promotion: Tri;
  dynamicIsland: Tri;
  cameraControl: Tri;
  fourK120: Tri;
  prores: Tri;
  frame: "titanium" | "aluminium" | null;
  colours: string[];
  tiers: Tier[];
}

interface Field<T> {
  value: T;
}
type RawModel = Record<string, unknown> & { model: string; storage_tiers: { storage: string; priceAUD: number }[] };

const val = (m: RawModel, key: string): unknown => {
  const f = m[key];
  if (f === null || f === undefined) return null;
  if (typeof f === "object" && !Array.isArray(f) && "value" in (f as Field<unknown>)) return (f as Field<unknown>).value;
  return f;
};
const text = (m: RawModel, key: string): string | null => {
  const v = val(m, key);
  return typeof v === "string" ? v : null;
};
const lines = (m: RawModel, key: string): string[] => {
  const v = val(m, key);
  return Array.isArray(v) ? v.map(String) : [];
};

const gbOf = (storage: string): number => (storage.endsWith("TB") ? parseInt(storage, 10) * 1024 : parseInt(storage, 10));

// "Yes" when the text names the feature, "no" when it is listed as absent, null when nothing is said.
const feature = (s: string | null, name: RegExp, absent: RegExp): Tri => (s === null ? null : absent.test(s) ? false : name.test(s) ? true : null);

function normalise(m: RawModel): ModelRec {
  const screen = val(m, "screen_inches");
  const inner = typeof screen === "object" && screen !== null ? (screen as { inner: string }).inner : (screen as string);
  const rear = lines(m, "rear_cameras");
  const video = lines(m, "video_recording");
  const zoom = text(m, "optical_zoom");
  const dims = val(m, "dimensions_mm");
  const frameText = (text(m, "materials_frame") ?? "").toLowerCase();
  const name = m.model;
  return {
    id: name.toLowerCase().replace(/^iphone /, "").replace(/\s+/g, "-"),
    name,
    line: /Pro|18/.test(name) ? "18" : /Air/.test(name) ? "air" : /Duo/.test(name) ? "duo" : /17/.test(name) ? "17" : "16",
    foldable: typeof dims === "object" && dims !== null && !Array.isArray(dims),
    screenIn: parseFloat(/(\d+(?:\.\d+)?)-inch/.exec(inner)?.[1] ?? "NaN"),
    outerIn: typeof screen === "object" && screen !== null ? Number(/(\d+(?:\.\d+)?)-inch/.exec((screen as { outer: string }).outer)?.[1] ?? NaN) || null : null,
    weightG: Number(/(\d+) grams/.exec(text(m, "weight_g") ?? "")?.[1] ?? NaN) || null,
    lenses: rear.length,
    separateTelephoto: rear.some((l) => /Fusion Telephoto/.test(l)),
    maxZoomX: Number(/(\d+)x optical(?:-quality)? zoom in/.exec(zoom ?? "")?.[1] ?? NaN) || null,
    batteryHours: Number(/Up to (\d+) hours/.exec(text(m, "battery_video_playback") ?? "")?.[1] ?? NaN) || null,
    batteryOuter: /outer display/.test(text(m, "battery_video_playback") ?? ""),
    promotion: feature(text(m, "refresh_rate_promotion"), /ProMotion/, /No ProMotion/),
    dynamicIsland: feature(text(m, "dynamic_island"), /Dynamic Island/, /No Dynamic Island/),
    cameraControl: feature(text(m, "camera_control"), /Camera Control/, /No Camera Control/),
    fourK120: video.length === 0 ? null : video.some((l) => /4K.*120 fps/.test(l)),
    prores: video.length === 0 ? null : video.some((l) => /ProRes/.test(l)),
    frame: frameText.includes("titanium") ? "titanium" : frameText.includes("aluminium") ? "aluminium" : null,
    colours: lines(m, "colours"),
    tiers: m.storage_tiers.map((t) => ({ storage: t.storage, gb: gbOf(t.storage), price: t.priceAUD })),
  };
}

export const MODELS: ModelRec[] = (raw as unknown as RawModel[]).map(normalise);

export const modelById = (id: string): ModelRec => {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`no such model: ${id}`);
  return m;
};
