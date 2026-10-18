// Step 4 of docs/prompts/product-line-session.md: which real model (phones-geo.ts
// / computers-geo.ts ids) stands on which table, side, and wall slot. Pure
// data, draws on shared/layout.json, world.ts and plan.ts without moving
// anything in them. This is a proposal: Ritesh corrects it.
//
// Finish/colour is still the old DEVICE_COLOURS cycling, not a real Apple
// colour name — no hex value has been sourced for a name like "Burgundy" or
// "Space Black" (the product-line build passes deliberately didn't invent
// one), so picking a specific real colour per unit is left to whichever
// session wires the catalogue's real colour names to a finish. A slot's
// stable id (SCOPE D28) is derived from this data, not stored separately:
// `${tableId}:${side}:${indexInRow}` for a table, `${kind}:${side}:${index}`
// for a wall feature.

export type Side = "-x" | "+x";

// Table id -> side -> model id. A table/side not listed here keeps the old
// generic placeholder body. Two models per phone/tablet/watch table (one per
// side) rather than a different model for every unit in the row — real Apple
// tables usually repeat one model in several colours along a row (see
// docs/prompts/product-line-session.md's Apple-store-layout appendix), and a
// per-unit colour needs the real-colour mapping above before it means
// anything.
export const TABLE_ASSIGNMENTS: Record<string, Partial<Record<Side, string>>> = {
  // phone tables (T1, T2, T8, T9, T10, T11 in layout.json)
  T1: { "-x": "iphone-duo", "+x": "iphone-18-pro" }, // nearest the door: the foldable and the flagship
  T2: { "-x": "iphone-air", "+x": "iphone-17" },
  T8: { "-x": "iphone-17e", "+x": "iphone-16" },
  T9: { "-x": "iphone-18-pro-max", "+x": "iphone-17" }, // the biggest flagship (an estimated body, see phones-geo.ts)
  T10: { "-x": "iphone-air", "+x": "iphone-duo" },
  T11: { "-x": "iphone-16", "+x": "iphone-17e" },
  // tablet tables
  T3: { "-x": "ipad-pro-11", "+x": "ipad-pro-13" }, // Pro, two sizes side by side for comparison
  T4: { "-x": "ipad-air-11", "+x": "ipad" }, // Air and the base model; ipad-mini and ipad-air-13 have no table yet
  // watch / earbuds table (T5 is watch-only in layout.json, T6 is watch+earbuds)
  T5: { "-x": "apple-watch-series-12", "+x": "apple-watch-ultra-4" }, // Watch SE 3 has no table yet
  T6: { "-x": "apple-watch-se-3", "+x": "airpods-pro-3" }, // AirPods 5 has no table yet
  // laptop table
  T7: { "-x": "macbook-air-13", "+x": "macbook-pro-14" }, // MacBook Neo, Pro 16 and Air 15 have no table yet
};

// The -x wall bench's 5 desktop slots (plan.ts SIDE_WALL). The iMac is built
// true-to-size (547mm) against a 0.5m slot pitch, so five in a row would
// overlap — Ritesh, 2026-10-12: fewer iMacs, not a wider bench or a scaled
// model. Mostly Mac mini / Mac Studio, the iMac as the occasional one.
export const DESKTOP_WALL_MODELS: readonly string[] = ["mac-mini", "mac-studio", "imac", "mac-mini", "mac-studio"];

// The +x wall bench's 2 monitor slots.
export const MONITOR_WALL_MODELS: readonly string[] = ["studio-display", "studio-display-xdr"];

// The -x wall bench's 3 headphone slots: AirPods Max 2 is the only over-ear model.
export const HEADPHONES_WALL_MODEL = "airpods-max-2";

// One item per bay ledge (plan.ts BAY_LEDGES), by the ledge's declared kind.
export const BAY_LEDGE_MODELS: Record<Side, Partial<Record<string, string>>> = {
  "+x": {
    phone: "iphone-17",
    tablet: "ipad-mini",
    watch: "apple-watch-se-3",
  },
  "-x": {
    laptop: "macbook-pro-16",
    headphones: "airpods-max-2",
    speaker: "homepod",
  },
};
