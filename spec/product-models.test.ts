import { describe, expect, it } from "vitest";
import { PRODUCTS } from "../src/shared/catalogue.ts";
import {
  buildEarbuds,
  buildHeadphones,
  buildPhoneBody,
  buildTracker,
  buildWatch,
  EARBUD_MODELS,
  HEADPHONE_MODELS,
  PHONE_MODELS,
  SPEAKER_MODELS,
  speakerProfile,
  TRACKER_MODELS,
  WATCH_MODELS,
} from "../src/client/src/gfx/phones-geo.ts";

// Promise (SCOPE D37): every real model the shop draws is its own model, not
// a reskin of another. Two specs can't share their identifying parameters —
// body size, and the camera / button layout that drives the geometry — and
// every phone the catalogue sells has a body to draw. Whether the models
// *look* right is a human check against the maker's photos (advisory, not
// here); this only catches a copy-paste between specs.
//
// The iPhone 16 and 17 genuinely share one camera and button layout (the
// maker's photos, and reviews: "virtually identical"), so layout alone is
// not required to be unique; size is, and so is size + layout together.

const round = (n: number) => Math.round(n * 1e5) / 1e5; // to 0.01 mm

const families = {
  phone: PHONE_MODELS,
  watch: WATCH_MODELS,
  earbuds: EARBUD_MODELS,
  headphones: HEADPHONE_MODELS,
  speaker: SPEAKER_MODELS,
  tracker: TRACKER_MODELS,
} as const;

// a model's size, whatever its family calls the axes
function size(m: object): number[] {
  const s = m as Record<string, unknown>;
  if ("length" in s) return [s.length, s.width, s.thickness].map((v) => round(v as number));
  if ("case" in s && typeof s.case === "object") {
    const c = s.case as Record<string, number>;
    return [c.height, c.width, c.depth].map(round);
  }
  if ("diameter" in s && "thickness" in s) return [s.diameter, s.thickness].map((v) => round(v as number));
  if ("diameter" in s) return [s.height, s.diameter].map((v) => round(v as number));
  return [s.height, s.width, s.depth].map((v) => round(v as number));
}

const signature = (m: object) => JSON.stringify(m, (k, v) => (k === "id" ? undefined : typeof v === "number" ? round(v) : v));

const all = Object.values(families).flatMap((f) => Object.values(f) as object[]);

describe("product models (SCOPE D37: every model is different)", () => {
  it("files every model under its own id", () => {
    for (const [family, reg] of Object.entries(families)) {
      for (const [key, m] of Object.entries(reg)) expect((m as { id: string }).id, family).toBe(key);
    }
    const ids = all.map((m) => (m as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives no two models in a family the same size", () => {
    for (const [family, reg] of Object.entries(families)) {
      const sizes = Object.values(reg).map((m) => JSON.stringify(size(m as object)));
      expect(new Set(sizes).size, family).toBe(sizes.length);
    }
  });

  it("gives no two models the same full spec (size, layout, buttons) once the id is set aside", () => {
    const sigs = all.map(signature);
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it("gives no two phones the same camera layout and size together", () => {
    const layouts = Object.values(PHONE_MODELS).map((p) =>
      JSON.stringify([size(p), p.plateau.shape, p.plateau.lenses.length, p.plateau.lenses.map((l) => l.pos.map(round)), p.buttons.length, p.topButtons?.length ?? 0, p.fold ?? null]),
    );
    expect(new Set(layouts).size).toBe(layouts.length);
  });

  it("has a body for every phone the catalogue sells", () => {
    for (const p of PRODUCTS) expect(PHONE_MODELS[p.id], p.id).toBeDefined();
  });

  it("keeps every lens on its plateau", () => {
    for (const p of Object.values(PHONE_MODELS)) {
      const pl = p.plateau;
      for (const l of pl.lenses) {
        expect(Math.abs(l.pos[0]) + l.r, `${p.id} lens x`).toBeLessThanOrEqual(pl.width / 2 + 1e-6);
        expect(Math.abs(l.pos[1]) + l.r, `${p.id} lens y`).toBeLessThanOrEqual(pl.height / 2 + 1e-6);
      }
    }
  });

  it("builds every model's geometry without throwing, in any colour", () => {
    for (const colour of ["#2b2f36", "#f4f4f2"]) {
      for (const p of Object.values(PHONE_MODELS)) expect(buildPhoneBody(p, colour, colour).matte, p.id).not.toBeNull();
      for (const w of Object.values(WATCH_MODELS)) expect(buildWatch(w, colour, colour).parts.matte, w.id).not.toBeNull();
      for (const e of Object.values(EARBUD_MODELS)) expect(buildEarbuds(e, colour).gloss, e.id).not.toBeNull();
      for (const h of Object.values(HEADPHONE_MODELS)) expect(buildHeadphones(h, colour).matte, h.id).not.toBeNull();
    }
    for (const s of Object.values(SPEAKER_MODELS)) {
      const top = Math.max(...speakerProfile(s).map((v) => v.y));
      expect(round(top), s.id).toBe(round(s.height));
    }
    for (const t of Object.values(TRACKER_MODELS)) expect(buildTracker(t).gloss, t.id).not.toBeNull();
  });
});
