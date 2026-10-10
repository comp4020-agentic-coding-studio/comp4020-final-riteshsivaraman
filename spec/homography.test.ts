import { expect, it } from "vitest";
import { applyH, estimateAspect, rectify, solveHomography, type Quad } from "../src/shared/homography.ts";

// Promise: the rectification maths behind tools/rectify is right, checked
// against a synthetic pinhole camera where the true answer is known.

// A w x h metre rectangle in the plane z = d from the camera, tilted about
// the vertical axis by `yaw` and about the horizontal axis by `pitch`.
function project(w: number, h: number, yaw: number, pitch: number, f: number, cx: number, cy: number): Quad {
  const corners: Array<[number, number]> = [
    [-w / 2, h / 2],
    [w / 2, h / 2],
    [w / 2, -h / 2],
    [-w / 2, -h / 2],
  ];
  const pts = corners.map(([x, y]) => {
    // rotate about y (yaw), then about x (pitch), then push away from the camera
    let X = x * Math.cos(yaw);
    let Z = -x * Math.sin(yaw);
    let Y = y;
    const Y2 = Y * Math.cos(pitch) - Z * Math.sin(pitch);
    const Z2 = Y * Math.sin(pitch) + Z * Math.cos(pitch);
    Y = Y2;
    Z = Z2 + 6;
    X = X + 0.4;
    return [cx + (f * X) / Z, cy - (f * Y) / Z] as const;
  });
  return [pts[0], pts[1], pts[2], pts[3]];
}

it("maps the output rectangle back onto the photo's corners", () => {
  const quad: Quad = [
    [120, 80],
    [610, 130],
    [560, 420],
    [90, 380],
  ];
  const dst: Quad = [
    [0, 0],
    [400, 0],
    [400, 300],
    [0, 300],
  ];
  const h = solveHomography(dst, quad);
  dst.forEach((p, i) => {
    const [x, y] = applyH(h, p[0], p[1]);
    expect(x).toBeCloseTo(quad[i][0], 6);
    expect(y).toBeCloseTo(quad[i][1], 6);
  });
});

it("recovers the true aspect ratio of a rectangle seen at an angle", () => {
  for (const [w, h] of [
    [4, 3],
    [15.9, 3.8],
    [2, 2.4],
  ]) {
    const q = project(w, h, 0.5, 0.15, 900, 640, 360);
    const est = estimateAspect(q, 640, 360);
    expect(est, `${w}x${h}`).not.toBeNull();
    expect(est!.aspect / (w / h)).toBeGreaterThan(0.97);
    expect(est!.aspect / (w / h)).toBeLessThan(1.03);
    expect(est!.focal / 900).toBeGreaterThan(0.9);
    expect(est!.focal / 900).toBeLessThan(1.1);
  }
});

it("declines to guess when there is no perspective to read", () => {
  const flat: Quad = [
    [100, 100],
    [500, 100],
    [500, 400],
    [100, 400],
  ];
  expect(estimateAspect(flat, 320, 240)).toBeNull();
});

it("rectifies a photo: a tilted bright square becomes an upright one", () => {
  // 100 x 100 photo, a white quad on black
  const W = 100;
  const H = 100;
  const src = new Uint8ClampedArray(W * H * 4);
  const quad: Quad = [
    [20, 20],
    [80, 30],
    [75, 85],
    [15, 70],
  ];
  const inside = (x: number, y: number): boolean => {
    // point-in-quad by winding
    let s = 0;
    for (let i = 0; i < 4; i++) {
      const a = quad[i];
      const b = quad[(i + 1) % 4];
      const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      s += c >= 0 ? 1 : -1;
    }
    return Math.abs(s) === 4;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = inside(x, y) ? 255 : 0;
    const o = (y * W + x) * 4;
    src[o] = src[o + 1] = src[o + 2] = v;
    src[o + 3] = 255;
  }
  const out = rectify(src, W, H, quad, 50, 50);
  // the interior of the output should be white (it is entirely the quad);
  // the outermost pixels sit on the edge and are legitimately blended with
  // the black background, so they are left out
  let minV = 255;
  for (let y = 3; y < 47; y++) for (let x = 3; x < 47; x++) minV = Math.min(minV, out[(y * 50 + x) * 4]);
  expect(minV).toBeGreaterThan(240);
});
