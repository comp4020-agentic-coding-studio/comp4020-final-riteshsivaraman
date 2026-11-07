import { describe, expect, it } from "vitest";
import { sunStateAt } from "../src/shared/sun.ts";

// Promise (issue #12, spec line): "Sun direction and colour are a pure
// function of server time and are identical for every viewer at the same
// instant." This is the one blocking, fast, deterministic part of the issue
// (acceptance criterion 1, "testable without a renderer"). Soft shadows
// looking good, frame budget and the low-quality fallback (criteria 2-3) are
// a feel-check, not here.
//
// No store timezone is pinned anywhere in SCOPE.md or the ADRs, so this spec
// does not assume which UTC hour is "midday" in the shop (that is the
// builder's call to make and is not this test's business). Instead it sweeps
// a full 24 h in server time and checks the *shape* every implementation of
// a real day/night cycle must have: one bright, overhead-ish peak and one
// dim, near-absent trough, with everything in between actually changing -
// not a constant pasted in to satisfy the type signature.

const HOUR_MS = 3_600_000;
// An arbitrary but fixed UTC day. The server clock is what this is a
// function of (not wall-clock "now"), so any fixed instant does.
const DAY_START = Date.UTC(2026, 5, 15, 0, 0, 0);

const hours = Array.from({ length: 24 }, (_, h) => DAY_START + h * HOUR_MS);

describe("sunStateAt (issue #12)", () => {
  it("exists and returns a direction and a colour for a server timestamp", () => {
    const state = sunStateAt(DAY_START);
    expect(state).toBeTruthy();
    expect(state.direction).toBeTruthy();
    expect(typeof state.direction.x).toBe("number");
    expect(typeof state.direction.y).toBe("number");
    expect(typeof state.direction.z).toBe("number");
    expect(Number.isFinite(state.direction.x)).toBe(true);
    expect(Number.isFinite(state.direction.y)).toBe(true);
    expect(Number.isFinite(state.direction.z)).toBe(true);
    expect(typeof state.colour).toBe("string");
    expect(state.colour.length).toBeGreaterThan(0);
  });

  it("is deterministic: the same server timestamp gives the same answer every time (identical for every viewer at that instant)", () => {
    const a = sunStateAt(DAY_START + 13 * HOUR_MS);
    const b = sunStateAt(DAY_START + 13 * HOUR_MS);
    expect(b).toEqual(a);
    // called a third time, from a fresh call stack position, still identical
    const c = sunStateAt(DAY_START + 13 * HOUR_MS);
    expect(c).toEqual(a);
  });

  it("is not hardcoded to one constant value: two different hours give different direction or colour", () => {
    const noonish = sunStateAt(DAY_START + 12 * HOUR_MS);
    const earlyHours = sunStateAt(DAY_START + 3 * HOUR_MS);
    const differs = noonish.colour !== earlyHours.colour || noonish.direction.x !== earlyHours.direction.x || noonish.direction.y !== earlyHours.direction.y || noonish.direction.z !== earlyHours.direction.z;
    expect(differs).toBe(true);
  });

  it("has a clear overhead, bright peak and a dim, near-absent trough somewhere across 24 h", () => {
    const states = hours.map((ms) => ({ ms, state: sunStateAt(ms) }));

    // "More overhead" = the sun direction's y (up) component is largest.
    const byElevation = [...states].sort((a, b) => b.state.direction.y - a.state.direction.y);
    const brightest = byElevation[0];
    const darkest = byElevation[byElevation.length - 1];

    // Direction: the brightest hour's sun sits meaningfully above the
    // horizon, the darkest hour's sits at or below it (no sun, interior
    // lights implied) - both directions of the claim, not just one.
    expect(brightest.state.direction.y).toBeGreaterThan(0.3);
    expect(darkest.state.direction.y).toBeLessThanOrEqual(0.05);

    // Colour: a daylight hour and a night hour must not render with the
    // same light colour.
    expect(brightest.state.colour).not.toBe(darkest.state.colour);

    // The two ends of the cycle are many hours apart (a real day/night
    // swing, not two adjacent samples that happen to differ by rounding).
    const apartHours = Math.abs(brightest.ms - darkest.ms) / HOUR_MS;
    expect(apartHours).toBeGreaterThanOrEqual(4);
  });

  it("gives a real spread across the day, not just two states (morning/midday/evening/night are each distinct)", () => {
    const states = hours.map((ms) => sunStateAt(ms));
    const distinctElevations = new Set(states.map((s) => s.direction.y.toFixed(3))).size;
    const distinctColours = new Set(states.map((s) => s.colour)).size;
    // A real day/night curve sampled hourly should take on well more than a
    // handful of distinct elevations and colours, not snap between two or
    // three fixed states.
    expect(distinctElevations).toBeGreaterThanOrEqual(8);
    expect(distinctColours).toBeGreaterThanOrEqual(4);
  });
});
