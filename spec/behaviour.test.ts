import { describe, expect, it } from "vitest";
import { BEHAVIOURS, DURATION, MOODS, WEIGHTS, avoidanceTurn, durationFor, pickBehaviour, pickMood } from "../src/shared/behaviour.ts";

// Promise: a crowd of people each choosing for themselves is varied, nobody
// repeats the same thing back to back, and every behaviour has a mood and a
// duration that make sense. How a behaviour is drawn is judged by eye.
const EXPRESSION_NAMES = ["neutral", "smile", "curious", "focused", "surprised", "worried"];

describe("behaviour", () => {
  it("picks every behaviour over a full sweep of random numbers", () => {
    const seen = new Set(Array.from({ length: 1000 }, (_, i) => pickBehaviour(i / 1000)));
    const solo = BEHAVIOURS.filter((b) => WEIGHTS[b] > 0);
    expect([...seen].sort()).toEqual([...solo].sort());
    // and none that only make sense with a partner
    for (const b of ["listen", "handshake", "clap", "bow"] as const) expect(seen.has(b)).toBe(false);
  });

  it("never repeats the one it was asked to skip", () => {
    for (const b of BEHAVIOURS) {
      for (let i = 0; i < 200; i++) expect(pickBehaviour(i / 200, b)).not.toBe(b);
    }
  });

  it("picks in proportion to the weights", () => {
    const n = 20000;
    const count = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const b = pickBehaviour(i / n);
      count.set(b, (count.get(b) ?? 0) + 1);
    }
    const total = BEHAVIOURS.reduce((a, b) => a + WEIGHTS[b], 0);
    for (const b of BEHAVIOURS) expect((count.get(b) ?? 0) / n).toBeCloseTo(WEIGHTS[b] / total, 1);
    expect(count.get("clap") ?? 0).toBe(0);
  });

  it("only offers moods that exist, and at least one per behaviour", () => {
    for (const b of BEHAVIOURS) {
      expect(MOODS[b].length).toBeGreaterThan(0);
      for (const m of MOODS[b]) expect(EXPRESSION_NAMES).toContain(m);
      for (let i = 0; i < 20; i++) expect(EXPRESSION_NAMES).toContain(pickMood(b, i / 20));
    }
  });

  it("gives every behaviour a sensible duration range", () => {
    for (const b of BEHAVIOURS) {
      const [lo, hi] = DURATION[b];
      expect(lo).toBeGreaterThan(0);
      expect(hi).toBeGreaterThan(lo);
      expect(durationFor(b, 0)).toBeCloseTo(lo);
      expect(durationFor(b, 1)).toBeCloseTo(hi);
    }
  });

  describe("avoidance", () => {
    // heading 0 faces -z
    it("does not turn when nobody is in the way", () => {
      expect(avoidanceTurn(0, 0, 0, [])).toBe(0);
      expect(avoidanceTurn(0, 0, 0, [{ x: 0, z: 5 }])).toBe(0); // far away
      expect(avoidanceTurn(0, 0, 0, [{ x: 0, z: 0.8 }])).toBe(0); // behind
      expect(avoidanceTurn(0, 0, 0, [{ x: 3, z: -0.3 }])).toBe(0); // beside, too far
    });

    it("turns away from someone close and ahead, towards the open side", () => {
      // someone ahead and a little to +x: a positive turn swings away from +x
      expect(avoidanceTurn(0, 0, 0, [{ x: 0.3, z: -0.8 }])).toBeGreaterThan(0);
      // the same on the -x side turns the other way
      expect(avoidanceTurn(0, 0, 0, [{ x: -0.3, z: -0.8 }])).toBeLessThan(0);
    });

    it("turns harder the closer they are", () => {
      const near = avoidanceTurn(0, 0, 0, [{ x: 0.2, z: -0.4 }]);
      const far = avoidanceTurn(0, 0, 0, [{ x: 0.2, z: -1.0 }]);
      expect(near).toBeGreaterThan(far);
      expect(far).toBeGreaterThan(0);
    });

    it("stays within -1 to 1 however many are in the way", () => {
      const crowd = Array.from({ length: 12 }, (_, i) => ({ x: 0.05 * i, z: -0.5 }));
      const t = avoidanceTurn(0, 0, 0, crowd);
      expect(t).toBeLessThanOrEqual(1);
      expect(t).toBeGreaterThanOrEqual(-1);
    });
  });
});
