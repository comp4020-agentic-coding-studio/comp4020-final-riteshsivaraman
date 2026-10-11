import { describe, expect, it } from "vitest";
import { EYE_HEIGHT, MAX_DOWN, MAX_UP, MAX_YAW, gazeAt } from "../src/shared/gaze.ts";

// Promise: a head looks at a point on two axes at once, and the signs follow
// the rig: heading 0 faces -z, a positive heading turns towards -x, a positive
// pitch looks down.

const at = { x: 0, z: 0, ry: 0 };

describe("gazeAt", () => {
  it("looks straight ahead at something at eye level in front", () => {
    const g = gazeAt(at, { x: 0, y: EYE_HEIGHT, z: -2 });
    expect(g.yaw).toBeCloseTo(0, 6);
    expect(g.pitch).toBeCloseTo(0, 6);
  });

  it("turns left (-x is left of a body facing -z) with a positive yaw, right with a negative one", () => {
    expect(gazeAt(at, { x: -2, y: EYE_HEIGHT, z: -2 }).yaw).toBeGreaterThan(0.5);
    expect(gazeAt(at, { x: 2, y: EYE_HEIGHT, z: -2 }).yaw).toBeLessThan(-0.5);
  });

  it("tips down for something low and up for something high, by how steeply", () => {
    const low = gazeAt(at, { x: 0, y: 0.85, z: -1 });
    const high = gazeAt(at, { x: 0, y: 2.4, z: -1 });
    expect(low.pitch).toBeGreaterThan(0.3);
    expect(high.pitch).toBeLessThan(-0.3);
    // the same height difference is a shallower angle from further away
    expect(gazeAt(at, { x: 0, y: 0.85, z: -3 }).pitch).toBeLessThan(low.pitch);
  });

  it("combines both axes: up and to the right at once", () => {
    const g = gazeAt(at, { x: 1.5, y: 2.3, z: -1.5 });
    expect(g.yaw).toBeLessThan(-0.5);
    expect(g.pitch).toBeLessThan(-0.2);
  });

  it("is relative to where the body faces", () => {
    // facing +x (heading -pi/2), a point at -z is to the left of the body;
    // facing -x (heading +pi/2) it is to the right
    expect(gazeAt({ x: 0, z: 0, ry: -Math.PI / 2 }, { x: 0, y: EYE_HEIGHT, z: -2 }).yaw).toBeGreaterThan(1);
    expect(gazeAt({ x: 0, z: 0, ry: Math.PI / 2 }, { x: 0, y: EYE_HEIGHT, z: -2 }).yaw).toBeLessThan(-1);
  });

  it("never turns the head further than a head can go", () => {
    const behind = gazeAt(at, { x: 0, y: EYE_HEIGHT, z: 3 });
    expect(Math.abs(behind.yaw)).toBeLessThanOrEqual(MAX_YAW + 1e-9);
    expect(gazeAt(at, { x: 0, y: 9, z: -0.1 }).pitch).toBeGreaterThanOrEqual(-MAX_UP);
    expect(gazeAt(at, { x: 0, y: -9, z: -0.1 }).pitch).toBeLessThanOrEqual(MAX_DOWN);
  });
});
