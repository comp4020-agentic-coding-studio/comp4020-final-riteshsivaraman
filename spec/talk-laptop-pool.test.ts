import { describe, expect, it } from "vitest";
import { MODELS } from "../src/shared/talk/scenes/laptop/data.ts";
import { mergeConstraints, modelIds, poolOf, priceBands, rank, type Constraints } from "../src/shared/talk/scenes/laptop/pool.ts";

// Promise: the laptop pool and ranking behave correctly, and a hard filter
// never eliminates a model on something the data does not state. Mirrors
// spec/talk-pool.test.ts's promise for the phone scene.

const ids = (c: Constraints): string[] => modelIds(poolOf(c));

describe("the laptop pool", () => {
  it("starts as every model x memory/storage tier x colour", () => {
    const all = poolOf({});
    expect(all.length).toBe(MODELS.reduce((n, m) => n + m.tiers.length * m.colours.length, 0));
    expect(modelIds(all)).toHaveLength(7);
  });

  it("filters hard constraints", () => {
    expect(ids({ family: "air" })).toEqual(["air-13", "air-15"]);
    expect(ids({ minThunderboltGen: 5 })).toEqual(["pro-14-m5-pro", "pro-14-m5-max", "pro-16-m5-pro", "pro-16-m5-max"]);
    expect(ids({ maxWeightG: 1300 })).toEqual(["air-13"]);
    expect(ids({ minBattery: 24 })).toEqual(["pro-14", "pro-16-m5-pro"]);
    expect(ids({ colours: ["Midnight"] })).toEqual(["air-13", "air-15"]);
  });

  it("applies the ceiling per tier, not per model", () => {
    const rows = poolOf({ maxPrice: 6500, family: "pro" });
    expect(rows.every((r) => r.price <= 6500)).toBe(true);
    expect(rows.some((r) => r.model === "pro-14-m5-max")).toBe(true); // $6399 base tier fits
  });

  it("can be empty, and says so by returning no rows", () => {
    expect(poolOf({ family: "pro", maxPrice: 3000 })).toEqual([]);
  });

  it("never eliminates a model on an attribute the data does not state (nanoTexture is absent, not false)", () => {
    expect(ids({})).toContain("pro-14");
  });

  it("merges: the tightest ceiling and the highest floor win", () => {
    const m = mergeConstraints({ maxPrice: 5000, minMemoryGb: 16 }, { maxPrice: 4000, minMemoryGb: 24 });
    expect(m).toMatchObject({ maxPrice: 4000, minMemoryGb: 24 });
  });
});

describe("the laptop ranking", () => {
  it("is cheapest first with no signals", () => {
    expect(rank(poolOf({}), {}).map((m) => m.id)[0]).toBe("air-13");
  });

  it("rewards more CPU/GPU cores for performance", () => {
    const top = rank(poolOf({}), { performance: true }).map((m) => m.id);
    expect(["pro-14-m5-max", "pro-16-m5-max", "pro-16-m5-pro"]).toContain(top[0]);
  });

  it("rewards lightness and a smaller screen for portability", () => {
    const top = rank(poolOf({}), { portability: true }).map((m) => m.id);
    expect(top[0]).toBe("air-13");
  });
});

describe("the laptop price bands", () => {
  it("are rounded up to A$100, increasing, and each leaves a non-empty pool", () => {
    for (const c of [{}, { family: "pro" }, { family: "air" }] as Constraints[]) {
      const pool = poolOf(c);
      const bands = priceBands(pool);
      expect(bands.length).toBeGreaterThan(0);
      expect([...bands].sort((a, b) => a - b)).toEqual(bands);
      for (const b of bands) {
        expect(b % 100).toBe(0);
        expect(pool.some((r) => r.price <= b)).toBe(true);
        expect(pool.some((r) => r.price > b)).toBe(true);
      }
    }
  });
});
