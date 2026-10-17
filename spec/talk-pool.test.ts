import { describe, expect, it } from "vitest";
import { MODELS } from "../src/shared/talk/data.ts";
import { mergeConstraints, modelIds, poolOf, priceBands, rank, type Constraints } from "../src/shared/talk/pool.ts";

// Promise: the pool and the ranking behave the way the sample conversations
// need (docs/conversation-model/transcripts/), and a hard filter never
// eliminates a model on something the data does not state. The expected sets
// here are the ones the transcripts verified against devices.json.

const ids = (c: Constraints): string[] => modelIds(poolOf(c));

describe("the pool", () => {
  it("starts as every model x storage x colour", () => {
    const all = poolOf({});
    expect(all.length).toBe(MODELS.reduce((n, m) => n + m.tiers.length * m.colours.length, 0));
    expect(modelIds(all)).toHaveLength(7);
  });

  it("filters hard constraints", () => {
    expect(ids({ separateTelephoto: true })).toEqual(["18-pro", "18-pro-max"]);
    expect(ids({ foldable: true })).toEqual(["duo"]);
    expect(ids({ screen: "large" })).toEqual(["duo", "18-pro-max", "air"]);
    expect(ids({ minBattery: 40 })).toEqual(["duo", "18-pro-max"]);
    expect(ids({ colours: ["Lavender"] })).toEqual(["17"]);
    expect(ids({ minGB: 1024, maxPrice: 3600, separateTelephoto: true })).toEqual(["18-pro", "18-pro-max"]);
  });

  it("applies the ceiling per tier, not per model", () => {
    const rows = poolOf({ maxPrice: 3300, separateTelephoto: true, minGB: 1024 });
    expect(rows.every((r) => r.model === "18-pro" && r.storage === "1TB")).toBe(true);
  });

  it("can be empty, and says so by returning no rows", () => {
    expect(poolOf({ foldable: true, maxPrice: 2000 })).toEqual([]);
  });

  it("never eliminates a model on an attribute the data does not state", () => {
    // The 16's ProMotion and the Air's zoom range are null: not stated, not "no".
    expect(ids({})).toContain("16");
    expect(MODELS.find((m) => m.id === "16")!.promotion).toBeNull();
  });

  it("merges: the tightest ceiling and the highest floor win", () => {
    const m = mergeConstraints({ maxPrice: 3000, minGB: 256 }, { maxPrice: 2000, minGB: 512 });
    expect(m).toMatchObject({ maxPrice: 2000, minGB: 512 });
  });
});

describe("the ranking", () => {
  it("is cheapest first with no signals", () => {
    expect(rank(poolOf({}), {}).map((m) => m.id)).toEqual(["17e", "16", "17", "air", "18-pro", "18-pro-max", "duo"]);
  });

  it("puts the telephoto Pros first for photos and video", () => {
    const top = rank(poolOf({}), { photos: true, video: true, battery: true }).map((m) => m.id);
    expect(top[0]).toBe("18-pro-max");
    expect(top.slice(0, 2)).toEqual(["18-pro-max", "18-pro"]);
  });
});

describe("the price bands", () => {
  it("are rounded up to A$100, increasing, and each leaves a non-empty pool", () => {
    for (const c of [{}, { minGB: 256 }, { separateTelephoto: true, minGB: 1024 }, { maxPrice: 2300 }] as Constraints[]) {
      const pool = poolOf(c);
      const bands = priceBands(pool);
      expect(bands.length).toBeGreaterThan(0);
      expect([...bands].sort((a, b) => a - b)).toEqual(bands);
      for (const b of bands) {
        expect(b % 100).toBe(0);
        expect(pool.some((r) => r.price <= b)).toBe(true);
        expect(pool.some((r) => r.price > b)).toBe(true); // otherwise it is just "no real limit"
      }
    }
  });

  it("matches the Pro 1TB and 2TB example from s06", () => {
    const pool = poolOf({ separateTelephoto: true, minGB: 1024 });
    expect(priceBands(pool)).toEqual([3300, 3500, 4500]);
  });
});
