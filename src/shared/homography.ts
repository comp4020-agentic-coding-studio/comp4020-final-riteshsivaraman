// Perspective rectification, the maths behind the "scan a document" trick:
// four corners of a rectangle as it appears in a photo (an uneven quadrilateral)
// are mapped back to a true rectangle. Pure functions, no DOM, so they can be
// tested in spec/ and also run in the browser tool (tools/rectify).
//
// Corner order everywhere: top-left, top-right, bottom-right, bottom-left.

export type Pt = readonly [number, number];
export type Quad = readonly [Pt, Pt, Pt, Pt];
export type H = readonly [number, number, number, number, number, number, number, number, number];

// Homography H such that H * dst[i] = src[i] (homogeneous). With dst the
// output rectangle and src the photo's quadrilateral, this is exactly the
// inverse map needed to fill an output image by sampling the photo.
export function solveHomography(dst: Quad, src: Quad): H {
  // 8 unknowns h0..h7 (h8 = 1):
  //   x = (h0 u + h1 v + h2) / (h6 u + h7 v + 1), y = (h3 u + h4 v + h5) / (...)
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = dst[i];
    const [x, y] = src[i];
    A.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
    A.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
  }
  // Gaussian elimination with partial pivoting
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) throw new Error("degenerate quadrilateral");
    for (let r = c + 1; r < 8; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = new Array<number>(8).fill(0);
  for (let r = 7; r >= 0; r--) {
    let s = A[r][8];
    for (let k = r + 1; k < 8; k++) s -= A[r][k] * h[k];
    h[r] = s / A[r][r];
  }
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyH(h: H, u: number, v: number): Pt {
  const w = h[6] * u + h[7] * v + h[8];
  return [(h[0] * u + h[1] * v + h[2]) / w, (h[3] * u + h[4] * v + h[5]) / w];
}

type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface AspectEstimate {
  aspect: number; // true width / height of the rectangle
  focal: number; // focal length in pixels, as implied by the quad
}

// Recovers the true aspect ratio of a rectangle seen in perspective, assuming
// square pixels and the principal point at (cx, cy) (the middle of the image).
// This is Zhang and He's whiteboard-rectification result. It needs a real
// perspective: a quad that is nearly a parallelogram carries no information
// about depth and returns null (then the aspect has to be given by hand).
export function estimateAspect(q: Quad, cx: number, cy: number): AspectEstimate | null {
  const m1: V3 = [q[0][0], q[0][1], 1]; // top-left
  const m2: V3 = [q[1][0], q[1][1], 1]; // top-right
  const m4: V3 = [q[2][0], q[2][1], 1]; // bottom-right
  const m3: V3 = [q[3][0], q[3][1], 1]; // bottom-left
  const c14 = cross(m1, m4);
  const k2d = dot(cross(m2, m4), m3);
  const k3d = dot(cross(m3, m4), m2);
  if (Math.abs(k2d) < 1e-9 || Math.abs(k3d) < 1e-9) return null;
  const k2 = dot(c14, m3) / k2d;
  const k3 = dot(c14, m2) / k3d;
  const n2: V3 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const n3: V3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
  const den = n2[2] * n3[2];
  if (Math.abs(den) < 1e-9) return null;
  const f2 =
    -(
      n2[0] * n3[0] -
      (n2[0] * n3[2] + n2[2] * n3[0]) * cx +
      den * cx * cx +
      (n2[1] * n3[1] - (n2[1] * n3[2] + n2[2] * n3[1]) * cy + den * cy * cy)
    ) / den;
  if (!(f2 > 0) || !Number.isFinite(f2)) return null;
  const f = Math.sqrt(f2);
  const back = (n: V3): V3 => [(n[0] - cx * n[2]) / f, (n[1] - cy * n[2]) / f, n[2]];
  const a2 = back(n2);
  const a3 = back(n3);
  const aspect = Math.sqrt(dot(a2, a2) / dot(a3, a3));
  if (!Number.isFinite(aspect) || aspect <= 0) return null;
  return { aspect, focal: f };
}

// Fills an outW x outH RGBA image by sampling `src` (RGBA, srcW x srcH)
// through the homography, with bilinear filtering. Pixels that fall outside
// the photo are transparent.
export function rectify(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  quad: Quad,
  outW: number,
  outH: number,
): Uint8ClampedArray {
  const dst: Quad = [
    [0, 0],
    [outW, 0],
    [outW, outH],
    [0, outH],
  ];
  const h = solveHomography(dst, quad);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const [x, y] = applyH(h, u + 0.5, v + 0.5);
      const o = (v * outW + u) * 4;
      if (x < 0 || y < 0 || x > srcW - 1 || y > srcH - 1) continue;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const y1 = Math.min(srcH - 1, y0 + 1);
      const fx = x - x0;
      const fy = y - y0;
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * srcW + x0) * 4 + c];
        const b = src[(y0 * srcW + x1) * 4 + c];
        const d = src[(y1 * srcW + x0) * 4 + c];
        const e = src[(y1 * srcW + x1) * 4 + c];
        out[o + c] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + d * (1 - fx) * fy + e * fx * fy;
      }
    }
  }
  return out;
}

// The true width / height of a rectangle seen as `q`, given the camera's focal
// length (pixels) and principal point. Unlike estimateAspect this needs no
// second vanishing point, so it works for a wall seen straight on from a level
// camera (vertical edges parallel), which is the usual case for a shopfront.
// Returns null if the quad cannot be a rectangle in front of the camera.
export function aspectFromFocal(q: Quad, focal: number, cx: number, cy: number): number | null {
  if (!(focal > 0)) return null;
  const unit: Quad = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  let h: H;
  try {
    h = solveHomography(unit, q);
  } catch {
    return null;
  }
  // columns of H for u and v, mapped through the inverse camera matrix
  const col = (a: number, b: number, c: number): V3 => [(a - cx * c) / focal, (b - cy * c) / focal, c];
  const c1 = col(h[0], h[3], h[6]);
  const c2 = col(h[1], h[4], h[7]);
  const n2 = Math.hypot(c2[0], c2[1], c2[2]);
  if (n2 < 1e-12) return null;
  const a = Math.hypot(c1[0], c1[1], c1[2]) / n2;
  return Number.isFinite(a) && a > 0 ? a : null;
}

// One focal length for several quads taken from the same photograph: the
// median of every quad that gives a usable estimate, or null if none does.
export function sharedFocal(quads: readonly Quad[], cx: number, cy: number): number | null {
  const fs: number[] = [];
  for (const q of quads) {
    const e = estimateAspect(q, cx, cy);
    // a plausible lens: roughly 14 to 125 degrees across the photo
    if (e && e.focal > 0.3 * (2 * cx) && e.focal < 4 * (2 * cx)) fs.push(e.focal);
  }
  if (!fs.length) return null;
  fs.sort((a, b) => a - b);
  return fs[Math.floor(fs.length / 2)];
}

// The focal length (pixels) at which the quad reads as a rectangle of the
// given true width / height: how you calibrate the camera from one wall whose
// real size you know. Scans log-spaced candidates and keeps the best; returns
// null when nothing comes within 5 percent (the corners cannot be that shape).
export function solveFocal(q: Quad, ratio: number, cx: number, cy: number): number | null {
  if (!(ratio > 0)) return null;
  let best: number | null = null;
  let bestErr = Infinity;
  // plausible lenses only: from about 120 degrees across the photo down to
  // about 14 degrees. Beyond that the formula stops meaning anything physical.
  const width = 2 * cx;
  const lo = 0.3 * width;
  const hi = 4 * width;
  for (let i = 0; i <= 800; i++) {
    const f = lo * Math.pow(hi / lo, i / 800);
    const a = aspectFromFocal(q, f, cx, cy);
    if (a === null) continue;
    const err = Math.abs(Math.log(a / ratio));
    if (err < bestErr) {
      bestErr = err;
      best = f;
    }
  }
  return best !== null && bestErr < 0.05 ? best : null;
}
