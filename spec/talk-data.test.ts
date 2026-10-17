import { describe, expect, it } from "vitest";
import { MODELS, modelById } from "../src/shared/talk/data.ts";

// Promise: the normalised model records say what the sourced scrape says
// (docs/conversation-model/devices.json), and say nothing it does not. These
// are golden values read off Apple's pages on 2026-10-17; a parser that
// drifts, or a re-scrape that changes a figure, turns this red on purpose.

describe("the model records", () => {
  it("has the seven models, ids stable", () => {
    expect(MODELS.map((m) => m.id)).toEqual(["duo", "18-pro", "18-pro-max", "air", "17", "17e", "16"]);
  });

  it("parses prices and tiers", () => {
    expect(modelById("18-pro-max").tiers.map((t) => [t.storage, t.gb, t.price])).toEqual([
      ["256GB", 256, 2299],
      ["512GB", 512, 2699],
      ["1TB", 1024, 3499],
      ["2TB", 2048, 4699],
    ]);
    expect(modelById("16").tiers).toEqual([{ storage: "128GB", gb: 128, price: 1349 }]);
  });

  it("tells a separate telephoto lens from the 2x crop", () => {
    const withLens = MODELS.filter((m) => m.separateTelephoto).map((m) => m.id);
    expect(withLens).toEqual(["18-pro", "18-pro-max"]);
  });

  it("parses screens, weight, battery and lens counts", () => {
    const g = (id: string) => modelById(id);
    expect([g("duo").screenIn, g("18-pro").screenIn, g("18-pro-max").screenIn, g("air").screenIn, g("17").screenIn, g("17e").screenIn]).toEqual([7.6, 6.3, 6.9, 6.5, 6.3, 6.1]);
    expect(g("air").weightG).toBe(165);
    expect(g("duo").weightG).toBe(254);
    expect(MODELS.map((m) => m.batteryHours)).toEqual([44, 34, 43, 27, 30, 26, 22]);
    expect(MODELS.map((m) => m.lenses)).toEqual([2, 3, 3, 1, 2, 1, 2]);
    expect(modelById("duo").foldable).toBe(true);
    expect(MODELS.filter((m) => m.foldable)).toHaveLength(1);
  });

  it("keeps not-stated as null and absent as false", () => {
    expect(modelById("16").promotion).toBeNull(); // the page says nothing
    expect(modelById("17e").promotion).toBe(false); // the page says "No ProMotion"
    expect(modelById("17e").cameraControl).toBe(false);
    expect(modelById("duo").dynamicIsland).toBe(true);
  });

  it("reads zoom range only where a range line exists", () => {
    expect(modelById("18-pro").maxZoomX).toBe(8);
    expect(modelById("17").maxZoomX).toBe(2);
    expect(modelById("air").maxZoomX).toBeNull();
    expect(modelById("17e").maxZoomX).toBeNull();
  });
});
