import { expect, it } from "vitest";
import { MALL, ROUTES, routePose } from "../src/shared/mall.ts";
import { FLOOR } from "../src/shared/protocol.ts";
import { SOLIDS } from "../src/shared/world.ts";

// Promise: the mall around the store is the same for everyone and the people
// in it behave like people: they never jump, never walk through the furniture
// when they come inside, and they really do go in and out of the store.
// Pure functions of the server clock, so these need no app.

const T0 = 1_800_000_000_000;

it("puts everyone in the same place for the same moment", () => {
  for (const r of ROUTES) expect(routePose(r, T0 + 54_321)).toEqual(routePose(r, T0 + 54_321));
});

it("never jumps: every step is at most walking speed, around the whole loop", () => {
  const dt = 100;
  for (const r of ROUTES) {
    let prev = routePose(r, T0);
    for (let t = dt; t < 400_000; t += dt) {
      const p = routePose(r, T0 + t);
      const speed = Math.hypot(p.x - prev.x, p.z - prev.z) / (dt / 1000);
      expect(speed, `${r.id} at +${t}ms`).toBeLessThanOrEqual(r.speed + 0.05);
      prev = p;
    }
  }
});

it("keeps the concourse people between the shopfronts and on their own level", () => {
  for (const r of ROUTES) {
    for (let t = 0; t < 300_000; t += 1500) {
      const p = routePose(r, T0 + t);
      expect(p.x).toBeGreaterThanOrEqual(MALL.minX);
      expect(p.x).toBeLessThanOrEqual(MALL.maxX);
      if (r.kind === "upper") {
        expect(p.z).toBeGreaterThanOrEqual(MALL.mezzanineZ0);
        expect(p.z).toBeLessThanOrEqual(MALL.mezzanineZ1);
        expect(p.y).toBeGreaterThan(MALL.mezzanineY);
      } else {
        expect(p.z).toBeLessThanOrEqual(FLOOR.maxZ);
        expect(p.y).toBe(0);
      }
    }
  }
});

it("never puts anyone inside a table, bench or the bar", () => {
  for (const r of ROUTES.filter((x) => x.kind === "shopper")) {
    for (let t = 0; t < 400_000; t += 500) {
      const p = routePose(r, T0 + t);
      if (p.z < FLOOR.minZ) continue; // still outside
      for (const b of SOLIDS) {
        const inside =
          p.x > b.x - b.w / 2 - 0.25 && p.x < b.x + b.w / 2 + 0.25 && p.z > b.z - b.d / 2 - 0.25 && p.z < b.z + b.d / 2 + 0.25;
        expect(inside, `${r.id} at +${t}ms is in a solid at (${b.x}, ${b.z})`).toBe(false);
      }
    }
  }
});

it("has shoppers who really come in and leave through the opening", () => {
  for (const r of ROUTES.filter((x) => x.kind === "shopper")) {
    let wasInside = false;
    let wentIn = false;
    let cameOut = false;
    for (let t = 0; t < 600_000; t += 500) {
      const p = routePose(r, T0 + t);
      const inside = p.z > FLOOR.minZ;
      if (inside && !wasInside) wentIn = true;
      if (!inside && wasInside) cameOut = true;
      // crossing the glass line happens through the opening
      if (inside !== wasInside) expect(Math.abs(p.x)).toBeLessThanOrEqual(2.5);
      wasInside = inside;
    }
    expect(wentIn, `${r.id} goes in`).toBe(true);
    expect(cameOut, `${r.id} comes out`).toBe(true);
  }
});

it("has people walking past, shoppers and people upstairs", () => {
  const kinds = new Set(ROUTES.map((r) => r.kind));
  expect(kinds).toEqual(new Set(["passer", "shopper", "upper"]));
  expect(new Set(ROUTES.map((r) => r.id)).size).toBe(ROUTES.length);
});
