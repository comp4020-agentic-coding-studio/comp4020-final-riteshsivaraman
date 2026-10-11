import {
  BufferAttribute,
  type BufferGeometry,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Matrix4,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Builds a device out of many small parts merged into a few vertex-coloured
// meshes (one per finish), so a phone with its buttons, lenses and stand is
// two or three draw calls, not twenty. Geometry is cached per kind and colour
// by the caller.

export type Finish = "metal" | "matte" | "gloss";

export class Parts {
  private lists: Record<Finish, BufferGeometry[]> = { metal: [], matte: [], gloss: [] };
  private outer = new Matrix4();

  // parts added inside fn are placed in the frame m (relative to the current one)
  within(m: Matrix4, fn: () => void): this {
    const prev = this.outer;
    this.outer = prev.clone().multiply(m);
    fn();
    this.outer = prev;
    return this;
  }

  // the current frame times a local placement: for meshes drawn outside Parts
  frame(m: Matrix4 = new Matrix4()): Matrix4 {
    return this.outer.clone().multiply(m);
  }

  add(finish: Finish, geo: BufferGeometry, colour: string, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    g.applyMatrix4(mat(pos, rot, scale));
    g.applyMatrix4(this.outer);
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    const n = g.getAttribute("position").count;
    const c = new Color(colour);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new BufferAttribute(arr, 3));
    this.lists[finish].push(g);
    return this;
  }

  // the same parts, each list merged into one geometry (or null when empty)
  build(): Record<Finish, BufferGeometry | null> {
    const out = {} as Record<Finish, BufferGeometry | null>;
    for (const f of ["metal", "matte", "gloss"] as Finish[]) {
      const l = this.lists[f];
      out[f] = l.length ? mergeGeometries(l, false) : null;
      l.forEach((g) => g.dispose());
    }
    return out;
  }
}

export function mat(pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): Matrix4 {
  return new Matrix4().compose(new Vector3(...pos), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...scale));
}

function roundedShape(w: number, h: number, r: number): Shape {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// A slab with rounded corners in x-y and softly rounded edges, t thick along
// z, centred on the origin.
export function slab(w: number, h: number, t: number, r: number, bevel = Math.min(t * 0.3, 0.002), curve = 5): BufferGeometry {
  const b = Math.min(bevel, t / 2 - 1e-5, w / 4, h / 4);
  const g = new ExtrudeGeometry(roundedShape(w - 2 * b, h - 2 * b, Math.max(r - b, 0.0005)), {
    depth: Math.max(t - 2 * b, 1e-5),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: curve,
  });
  g.translate(0, 0, -(t - 2 * b) / 2);
  return g;
}

// A flat rounded rectangle facing +z with UVs 0..1 across it (for screens).
export function roundedPlane(w: number, h: number, r: number): BufferGeometry {
  const g = new ShapeGeometry(roundedShape(w, h, r), 6);
  const p = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return g;
}

export const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 20) => new CylinderGeometry(rt, rb, h, seg);
export const sphere = (r: number, ws = 16, hs = 12) => new SphereGeometry(r, ws, hs);
export const torus = (R: number, t: number, rs = 8, ts = 24, arc = Math.PI * 2) => new TorusGeometry(R, t, rs, ts, arc);

// ---------- per-model phone bodies (SCOPE D37: real models, distinct looks) ----------
//
// One spec per real model, numbers from references/product-line.md (sourced
// from the maker's AU pages, not memory). `buildPhoneBody` is generic across
// every phone model: a camera-plateau shape, its lenses and a button layout
// drive the geometry, so a new model is a new spec, not new drawing code.

export type PlateauShape = "square" | "none";

export interface PhoneModelSpec {
  id: string;
  length: number; // body, m (portrait height)
  width: number; // m
  thickness: number; // body only, m (plateau adds its own thickness on top)
  cornerRadius: number; // m
  plateau: {
    shape: PlateauShape;
    width: number; // m
    height: number; // m
    radius: number; // m, the plateau's own (large, "squircle") corner rounding
    inset: number; // m from the body's top edge to the plateau's top edge
    thickness: number; // m, how far the plateau stands proud of the back
    lenses: Array<{ pos: [number, number]; r: number }>; // offsets from the plateau centre, m; first lens drawn is the main (largest)
    extras?: Array<{ pos: [number, number]; r: number; colour: string }>; // flash, LiDAR, mic holes etc, offsets from the plateau centre, m
  };
  buttons: Array<{ side: -1 | 1; y: number; len: number }>; // y: m from body centre, +ve toward the top edge
}

// iPhone 18 Pro (6.3"): 150.0 x 71.9 x 8.75 mm, aluminium unibody. Corrected
// 2026-10-12 against a real marketing photo Ritesh supplied (not a web
// fetch — no URL to cite, flagged for the catalogue doc): the plateau is a
// large rounded SQUARE in the top-left, not a full-width bar (that was a
// pre-launch leak, apparently wrong, from macrumors.com/2025/02/13/
// iphone-17-pro-camera-design-leak — keep for history, don't reuse). Lenses
// sit in an L: a smaller ultra-wide top-left, the larger main lens
// bottom-left, telephoto to its right at mid-height; flash top-right of the
// cluster, a sensor dot below it. Pricing/screen size/materials still from
// apple.com/au/iphone-18-pro/specs and apple.com/au/shop/buy-iphone/
// iphone-18-pro, fetched 2026-10-12.
export const IPHONE_18_PRO: PhoneModelSpec = {
  id: "iphone-18-pro",
  length: 0.15,
  width: 0.0719,
  thickness: 0.00875,
  cornerRadius: 0.011,
  plateau: {
    shape: "square",
    width: 0.0618,
    height: 0.057,
    radius: 0.018,
    inset: 0.0045,
    thickness: 0.0027,
    // x signs here are chosen so the plateau reads correctly in a straight-on
    // view of the BACK (DeviceStage's default) — that view mirrors left/right
    // relative to the body's own +x (verified empirically: a positive local x
    // lands on screen-left when looking at -z). Matched against Ritesh's
    // reference photo of the real back, 2026-10-12.
    lenses: [
      { pos: [0.0198, 0.0143], r: 0.0048 }, // ultra wide, top-left in the photo
      { pos: [0.0124, -0.0096], r: 0.0068 }, // main, bottom-left (largest)
      { pos: [-0.0074, 0.0029], r: 0.0052 }, // telephoto, right-mid
    ],
    extras: [
      { pos: [-0.0186, 0.0199], r: 0.0024, colour: "#eceae2" }, // flash
      { pos: [-0.0186, 0.0103], r: 0.0013, colour: "#1c2430" }, // sensor
    ],
  },
  buttons: [
    { side: -1, y: 0.038, len: 0.01 }, // action button
    { side: -1, y: 0.018, len: 0.014 }, // volume up
    { side: -1, y: 0.0, len: 0.014 }, // volume down
    { side: 1, y: 0.01, len: 0.016 }, // side button
    { side: 1, y: -0.016, len: 0.007 }, // camera control
  ],
};

export const PHONE_MODELS: Record<string, PhoneModelSpec> = {
  [IPHONE_18_PRO.id]: IPHONE_18_PRO,
};

// Body + camera plateau + lenses + buttons, merged into the three finish
// buckets `Parts` tracks (metal buttons, matte body/plateau, gloss lenses).
// The body is a `slab` facing +z at its front (the screen side); the plateau
// and lenses sit on the back, at -z.
export function buildPhoneBody(spec: PhoneModelSpec, bodyColour: string, plateauColour: string): Record<Finish, BufferGeometry | null> {
  const p = new Parts();
  const { length: L, width: W, thickness: T, cornerRadius: R } = spec;
  p.add("matte", slab(W, L, T, R), bodyColour);
  const pl = spec.plateau;
  if (pl.shape !== "none") {
    const plateauCx = W / 2 - pl.width / 2 - (W - pl.width) * 0.07; // hugs screen-left in the back view, a small margin in from that edge
    const plateauCy = L / 2 - pl.inset - pl.height / 2;
    const plateauCz = -(T / 2 + pl.thickness / 2);
    // the plateau is a visibly different finish from the body (two-tone
    // back), not just a darker tint of the same material: glossier and a
    // touch cooler, the way a polished vs bead-blasted aluminium patch reads.
    p.add("gloss", slab(pl.width, pl.height, pl.thickness, pl.radius), plateauColour, [plateauCx, plateauCy, plateauCz]);
    const lensZ = -(T / 2 + pl.thickness + 0.0008);
    for (const l of pl.lenses) {
      p.add("gloss", cyl(l.r, l.r, 0.0016, 20), "#111318", [plateauCx + l.pos[0], plateauCy + l.pos[1], lensZ], [Math.PI / 2, 0, 0]);
      p.add("gloss", cyl(l.r * 0.52, l.r * 0.52, 0.0018, 16), "#2c3c56", [plateauCx + l.pos[0], plateauCy + l.pos[1], lensZ - 0.0001], [Math.PI / 2, 0, 0]);
    }
    for (const e of pl.extras ?? []) {
      p.add("gloss", cyl(e.r, e.r, 0.0012, 14), e.colour, [plateauCx + e.pos[0], plateauCy + e.pos[1], lensZ], [Math.PI / 2, 0, 0]);
    }
  }
  for (const b of spec.buttons) {
    p.add("metal", box(0.0012, b.len, 0.0038), "#d7d9dc", [b.side * (W / 2 + 0.0003), b.y, 0]);
  }
  return p.build();
}
