import { describe, expect, it } from "vitest";
import { BUILD_RANGE, HEIGHT_RANGE, appearanceFor } from "../src/shared/appearance.ts";
import { BODY_RADIUS } from "../src/shared/world.ts";

// Promise: a person keeps their look, people are not clones of each other, and
// no look is wide enough to overlap a neighbour that collision keeps one
// BODY_RADIUS away. Rendering is judged by eye, not here.
const ids = Array.from({ length: 300 }, (_, i) => `visitor-${i}`);
const looks = ids.map(appearanceFor);

describe("appearance", () => {
  it("is the same for the same id, every time", () => {
    expect(appearanceFor("visitor-7")).toEqual(appearanceFor("visitor-7"));
  });

  it("differs between ids", () => {
    expect(appearanceFor("visitor-7")).not.toEqual(appearanceFor("visitor-8"));
  });

  it("stays inside the declared height and build ranges", () => {
    for (const a of looks) {
      expect(a.height).toBeGreaterThanOrEqual(HEIGHT_RANGE[0]);
      expect(a.height).toBeLessThanOrEqual(HEIGHT_RANGE[1]);
      expect(a.build).toBeGreaterThanOrEqual(BUILD_RANGE[0]);
      expect(a.build).toBeLessThanOrEqual(BUILD_RANGE[1]);
    }
  });

  it("never draws a body wider than the collision radius allows", () => {
    const armOuterEdge = 0.272; // arm offset 0.23 plus arm radius 0.042, at build 1
    for (const a of looks) expect(armOuterEdge * a.build).toBeLessThanOrEqual(BODY_RADIUS);
  });

  it("gives a real spread of shapes, hair and faces across a crowd", () => {
    const distinct = (f: (a: (typeof looks)[number]) => unknown) => new Set(looks.map(f)).size;
    expect(distinct((a) => a.hairStyle)).toBe(7);
    expect(distinct((a) => a.hairColour)).toBeGreaterThanOrEqual(7);
    expect(distinct((a) => a.skin)).toBeGreaterThanOrEqual(5);
    expect(distinct((a) => a.eyeColour)).toBeGreaterThanOrEqual(4);
    expect(distinct((a) => a.height.toFixed(2))).toBeGreaterThanOrEqual(15);
    expect(distinct((a) => a.noseSize.toFixed(2))).toBeGreaterThanOrEqual(15);
  });

  it("keeps the face and frame fields inside sensible ranges", () => {
    for (const a of looks) {
      expect(a.faceWidth).toBeGreaterThanOrEqual(0.94);
      expect(a.faceWidth).toBeLessThanOrEqual(1.1);
      expect(a.shoulderHip).toBeGreaterThanOrEqual(0.95);
      expect(a.shoulderHip).toBeLessThanOrEqual(1.45);
      expect(a.eyeSize).toBeGreaterThanOrEqual(0.92);
      expect(a.eyeSize).toBeLessThanOrEqual(1.18);
    }
    expect(new Set(looks.map((a) => a.jaw.toFixed(2))).size).toBeGreaterThan(15);
  });

  it("gives some people facial hair and some none, in every style", () => {
    const styles = new Set(looks.map((a) => a.beard));
    expect(styles.size).toBe(5);
    const none = looks.filter((a) => a.beard === "none").length;
    expect(none).toBeGreaterThan(looks.length * 0.35);
    expect(none).toBeLessThan(looks.length * 0.65);
  });

  it("varies features independently, not as a handful of fixed bundles", () => {
    const combos = new Set(looks.map((a) => `${a.hairStyle}|${a.skin}|${a.eyeColour}|${a.pants}`));
    expect(combos.size).toBeGreaterThan(150);
  });
});
