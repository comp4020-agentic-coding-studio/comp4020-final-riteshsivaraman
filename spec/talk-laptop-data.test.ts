import { describe, expect, it } from "vitest";
import { MODELS, modelById } from "../src/shared/talk/scenes/laptop/data.ts";

// Promise: the normalised laptop model records say what laptops.json says,
// and nothing it does not. Golden values read off Apple's pages on
// 2026-10-18 (docs/conversation-model/laptops-v2-notes.md); a parser that
// drifts, or a re-scrape that changes a figure, turns this red on purpose.
// Mirrors spec/talk-data.test.ts's promise for the phone scene.

describe("the laptop model records", () => {
  it("has the seven models, ids stable", () => {
    expect(MODELS.map((m) => m.id)).toEqual(["air-13", "air-15", "pro-14", "pro-14-m5-pro", "pro-14-m5-max", "pro-16-m5-pro", "pro-16-m5-max"]);
  });

  it("parses the preconfigured tiers and prices", () => {
    expect(modelById("air-13").tiers).toEqual([{ memoryGb: 16, storageGb: 512, price: 2099 }]);
    expect(modelById("air-15").tiers).toEqual([{ memoryGb: 16, storageGb: 1024, price: 2499 }]);
    // The nano-texture (anti-glare) finish SKU is excluded: same memory/storage
    // as the standard finish, and no bank question distinguishes a display
    // finish (see data.ts's comment on skusStandard).
    expect(modelById("pro-14").tiers).toEqual([{ memoryGb: 16, storageGb: 1024, price: 3199 }]);
    expect(modelById("pro-16-m5-max").tiers).toEqual([
      { memoryGb: 36, storageGb: 2048, price: 6999 },
      { memoryGb: 48, storageGb: 2048, price: 7999 },
    ]);
  });

  it("keeps chip, core counts and family apart per model", () => {
    expect(modelById("pro-14").chip).toBe("M5");
    expect(modelById("pro-14-m5-pro").chip).toBe("M5 Pro");
    expect(modelById("pro-14-m5-max").chip).toBe("M5 Max");
    expect(modelById("pro-14-m5-pro").cpuCores).toBe(15);
    expect(modelById("pro-16-m5-pro").cpuCores).toBe(18);
    expect(MODELS.filter((m) => m.family === "air")).toHaveLength(2);
    expect(MODELS.filter((m) => m.family === "pro")).toHaveLength(5);
  });

  it("parses screen size, weight, battery and thunderbolt generation", () => {
    expect(modelById("air-13").screenIn).toBe(13.6);
    expect(modelById("air-15").screenIn).toBe(15.3);
    expect(modelById("pro-14").screenIn).toBe(14.2);
    expect(modelById("pro-16-m5-pro").screenIn).toBe(16.2);
    expect(modelById("air-13").weightG).toBe(1230);
    expect(modelById("pro-16-m5-max").weightG).toBe(2150);
    expect(modelById("pro-14").batteryHours).toBe(24); // M5 tier figure, not Pro/Max
    expect(modelById("pro-14-m5-max").batteryHours).toBe(20);
    expect(modelById("air-13").thunderboltGen).toBe(4);
    expect(modelById("pro-14-m5-pro").thunderboltGen).toBe(5);
  });

  it("lists the colours each model actually ships in", () => {
    expect(modelById("air-13").colours.sort()).toEqual(["Midnight", "Silver", "Sky Blue", "Starlight"]);
    expect(modelById("pro-14").colours.sort()).toEqual(["Silver", "Space Black"]);
  });
});
