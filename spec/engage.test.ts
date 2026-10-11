import { describe, expect, it } from "vitest";
import { engagedMoment, rejoinMoment, servicePoint, STAND_OFF } from "../src/shared/engage.ts";
import { lookFor, withLook, validateLook } from "../src/shared/look.ts";
import { headingTo, wrap } from "../src/shared/steering.ts";
import { momentOf } from "../src/shared/storeday.ts";
import { appearanceFor } from "../src/shared/appearance.ts";

// Promise: an NPC that a visitor is talking to walks over, faces them, and when
// let go walks back to where the day has got to, with no jump at either end;
// and a visitor looks the same wherever the look is built.
const T = 5_000_000; // an arbitrary moment of the day
const NPC = "spec-phones";

describe("an NPC being served", () => {
  const visitor = { x: -1.6, z: -1.2 }; // in the lane between two table columns
  const e = { npcId: NPC, visitorId: "v", since: T, at: visitor };

  it("starts exactly where the timetable had it, so there is no jump when it is taken", () => {
    const a = momentOf(NPC, T);
    const b = engagedMoment(NPC, e, T);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.05);
  });

  it("walks over at a walking pace, never faster", () => {
    let prev = engagedMoment(NPC, e, T);
    for (let t = 100; t < 30_000; t += 100) {
      const m = engagedMoment(NPC, e, T + t);
      expect(Math.hypot(m.x - prev.x, m.z - prev.z) / 0.1).toBeLessThan(2.5);
      prev = m;
    }
  });

  it("ends up in front of the visitor, facing them, no longer walking", () => {
    const m = engagedMoment(NPC, e, T + 60_000);
    expect(m.walking).toBe(false);
    expect(Math.hypot(m.x - visitor.x, m.z - visitor.z)).toBeCloseTo(STAND_OFF, 1);
    expect(Math.abs(wrap(headingTo(m.x, m.z, visitor.x, visitor.z) - m.ry))).toBeLessThan(0.05);
    expect(m.mode).toBe("talk");
  });

  it("stands the same way for everyone who computes it", () => {
    expect(engagedMoment(NPC, e, T + 25_000)).toEqual(engagedMoment(NPC, e, T + 25_000));
  });

  it("puts the service point towards where it came from, not behind the visitor", () => {
    const p = servicePoint({ x: -5, z: -1 }, { x: 0, z: -1 });
    expect(p.x).toBeCloseTo(-STAND_OFF);
    expect(p.z).toBeCloseTo(-1);
  });
});

describe("an NPC let go", () => {
  const from = { x: -1.6, z: -2.4 }; // open floor, not inside a table
  const r = { at: T, from };

  it("starts where it stood, and walks back without a jump", () => {
    const m0 = rejoinMoment(NPC, r, T)!;
    expect(Math.hypot(m0.x - from.x, m0.z - from.z)).toBeLessThan(0.05);
    let prev = m0;
    let t = 100;
    for (; t < 90_000; t += 100) {
      const m = rejoinMoment(NPC, r, T + t);
      if (!m) break;
      expect(Math.hypot(m.x - prev.x, m.z - prev.z) / 0.1, `at +${t}`).toBeLessThan(2.5);
      prev = m;
    }
    expect(t).toBeLessThan(60_000); // it does get back
  });

  it("hands over to the timetable exactly where the timetable has it", () => {
    let last = rejoinMoment(NPC, r, T)!;
    let t = 100;
    for (; t < 90_000; t += 100) {
      const m = rejoinMoment(NPC, r, T + t);
      if (!m) break;
      last = m;
    }
    const day = momentOf(NPC, T + t);
    expect(Math.hypot(last.x - day.x, last.z - day.z)).toBeLessThan(0.6);
  });
});

describe("a look", () => {
  it("is built from the seed the visitor chose, so a preview matches what others see", () => {
    const a = lookFor("some-visitor-id", { seed: "abc123", skin: "#8d5a3b" });
    const b = lookFor("a-different-visitor-id", { seed: "abc123", skin: "#8d5a3b" });
    expect(a).toEqual(b);
    expect(a.skin).toBe("#8d5a3b");
    expect(lookFor("x", { seed: "abc123" }).height).toBe(appearanceFor("abc123").height);
  });

  it("uses the id when there is no seed, and leaves the base alone with no choices", () => {
    expect(lookFor("someone", undefined)).toEqual(appearanceFor("someone"));
    expect(withLook(appearanceFor("q"), undefined)).toEqual(appearanceFor("q"));
  });

  it("only accepts a plain seed", () => {
    expect(validateLook({ seed: "abc_DEF-123" }).seed).toBe("abc_DEF-123");
    expect(validateLook({ seed: "x y" }).seed).toBeUndefined();
    expect(validateLook({ seed: "<script>" }).seed).toBeUndefined();
    expect(validateLook({ seed: "x".repeat(40) }).seed).toBeUndefined();
  });
});
