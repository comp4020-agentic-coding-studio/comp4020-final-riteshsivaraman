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
  Vector2,
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

// Like roundedShape, but each corner has its own radius: [top-right,
// top-left, bottom-left, bottom-right] in the shape's own x-y. Used where one
// side must be square (a folding phone's hinge side).
function roundedShape4(w: number, h: number, [rTR, rTL, rBL, rBR]: [number, number, number, number]): Shape {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  const c = (r: number) => Math.max(Math.min(r, w / 2, h / 2), 1e-5);
  [rTR, rTL, rBL, rBR] = [c(rTR), c(rTL), c(rBL), c(rBR)];
  s.moveTo(x + rBL, y);
  s.lineTo(x + w - rBR, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rBR);
  s.lineTo(x + w, y + h - rTR);
  s.quadraticCurveTo(x + w, y + h, x + w - rTR, y + h);
  s.lineTo(x + rTL, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rTL);
  s.lineTo(x, y + rBL);
  s.quadraticCurveTo(x, y, x + rBL, y);
  return s;
}

// slab() with per-corner radii (see roundedShape4 for the order).
export function slab4(w: number, h: number, t: number, radii: [number, number, number, number], bevel = Math.min(t * 0.3, 0.002), curve = 5): BufferGeometry {
  const b = Math.min(bevel, t / 2 - 1e-5, w / 4, h / 4);
  const g = new ExtrudeGeometry(roundedShape4(w - 2 * b, h - 2 * b, radii.map((r) => Math.max(r - b, 0.0003)) as [number, number, number, number]), {
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

// "square": a rounded-square plateau (18 Pro). "pill": a stadium, its radius
// half its short side (iPhone 16/17 vertical, iPhone Duo horizontal). "bar":
// runs the full width of the back (iPhone Air). "ring": a small round raised
// module round a single lens, no plateau as such (iPhone 17e).
export type PlateauShape = "square" | "pill" | "bar" | "ring" | "none";

export type ScreenCutout = "island" | "notch" | "punch";

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
    cx?: number; // m, plateau centre from the body centre in local +x (screen-left in the back view); default hugs that edge
    tone?: number; // plateau colour as a multiple of the body colour (default 0.78, the 18 Pro's two-tone back; 1 = same finish)
    lenses: Array<{ pos: [number, number]; r: number }>; // offsets from the plateau centre, m; first lens drawn is the main (largest)
    extras?: Array<{ pos: [number, number]; r: number; colour: string; onBack?: boolean }>; // flash, LiDAR, mic holes etc, offsets from the plateau centre, m; onBack: sits on the back glass beside the plateau, not on it
  };
  lensRing?: boolean; // a bright metal ring round each lens (every model after the 18 Pro pilot)
  buttons: Array<{ side: -1 | 1; y: number; len: number }>; // y: m from body centre, +ve toward the top edge
  topButtons?: Array<{ x: number; len: number }>; // buttons on the top edge; x: m from body centre in local +x (right, seen from the front)
  // A closed book-style folding phone: the body is two halves meeting at a
  // seam, one long side a rounded hinge spine with square corners.
  // `hingeSide` is local x (-1 = left seen from the front).
  fold?: { hingeSide: -1 | 1 };
  // The front screen: size (default 0.86 x 0.9 of the body), its x offset,
  // and the camera cutout drawn on it (default Dynamic Island).
  screen?: { width?: number; height?: number; offsetX?: number; cutout?: ScreenCutout };
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

// ---- the rest of the current iPhone line (references/product-line.md §1) ----
//
// Body dimensions are Apple's own tech-spec numbers (via WebSearch summaries
// of apple.com/<region>/<model>/specs and support.apple.com, 2026-10-12)
// (the Duo's read straight off apple.com/au/iphone-duo/specs). Camera layouts were
// checked by eye against Apple's own AU product photos in a browser on
// 2026-10-12 (apple.com/au/shop/buy-iphone/<model>, apple.com/au/iphone-duo);
// the millimetre sizes and offsets of plateaus, lenses and buttons are read
// off those photos by proportion, so they are close, not measured. Button
// positions along an edge are approximate everywhere (the 18 Pro's too).

// iPhone Duo, closed (book-style foldable): 84.1 x 117.8 x 11.3 mm closed
// (164.6 x 117.8 x 5.2 open), 254 g — Apple's own numbers, confirmed on
// apple.com/au/iphone-duo/specs, 2026-10-12. Seen in Apple's
// photo (apple.com/au/iphone-duo, "Durability" view): a horizontal pill
// plateau top-left of the back (away from the hinge), the same finish as
// the body, two large lenses side by side in bright metal rings, a mic hole
// above the flash to their right. Front ("Closed" view): the outer screen
// fills the face, squared corners on the hinge (left) side, a punch-hole
// camera top-right; two volume buttons on the TOP edge right of centre, the
// side (Touch ID) button on the right edge. All of these buttons sit on the
// CAMERA half of the closed phone, not the outer-screen half or the seam —
// photo-confirmed on the buy page's side-exterior gallery photo
// (apple.com/au/shop/buy-iphone/iphone-duo, 2026-10-12), and Apple's spec
// diagram puts side button and volume on the same half. Camera Control:
// photo-confirmed, apple.com/au/iphone-duo/specs "External Buttons and
// Connectors" diagram, 2026-10-12 — on the right edge (seen from the
// front), about 10.5 mm below centre, under the side button, and FLUSH: the
// diagram draws no bump or outline there, and the gallery photo shows a
// plain edge below the side button. So it is deliberately not drawn (there
// is nothing visible to draw); add it if a closer photo ever shows a mark.
export const IPHONE_DUO: PhoneModelSpec = {
  id: "iphone-duo",
  length: 0.1178,
  width: 0.0841,
  thickness: 0.0113,
  cornerRadius: 0.012,
  plateau: {
    shape: "pill",
    width: 0.05,
    height: 0.0215,
    radius: 0.01075,
    inset: 0.0062,
    thickness: 0.0022,
    cx: 0.0135,
    tone: 1,
    lenses: [
      { pos: [0.01425, 0], r: 0.0076 }, // outer (screen-left in the back view), concentric with the pill's end
      { pos: [-0.00225, 0], r: 0.0076 },
    ],
    extras: [
      { pos: [-0.0162, 0.0042], r: 0.0008, colour: "#1c2430" }, // mic
      { pos: [-0.0162, -0.0044], r: 0.0022, colour: "#eceae2" }, // flash
    ],
  },
  lensRing: true,
  fold: { hingeSide: -1 },
  buttons: [{ side: 1, y: 0.0159, len: 0.0168 }], // side button (Touch ID)
  topButtons: [
    { x: 0.0021, len: 0.0105 }, // volume
    { x: 0.0155, len: 0.0105 }, // volume
  ],
  screen: { width: 0.0841 * 0.9, height: 0.1178 * 0.93, offsetX: 0.0016, cutout: "punch" },
};

// iPhone Air: 156.2 x 74.7 x 5.64 mm, titanium frame. Photo-checked: a
// full-width camera "plateau" bar across the top of the back (reviews call
// it that too: 9to5mac, appleinsider, hothardware), a single lens standing
// proud of it on the screen-left end, the flash at the other end. Buttons
// per support.apple.com: Action + volume on the left, side button + Camera
// Control (lower) on the right.
export const IPHONE_AIR: PhoneModelSpec = {
  id: "iphone-air",
  length: 0.1562,
  width: 0.0747,
  thickness: 0.00564,
  cornerRadius: 0.0118,
  plateau: {
    shape: "bar",
    width: 0.0717,
    height: 0.0245,
    radius: 0.0104,
    inset: 0.0015,
    thickness: 0.0024,
    cx: 0,
    tone: 0.9,
    lenses: [{ pos: [0.0185, 0], r: 0.0074 }],
    extras: [{ pos: [-0.0225, 0.0], r: 0.0022, colour: "#eceae2" }], // flash
  },
  lensRing: true,
  buttons: [
    { side: -1, y: 0.041, len: 0.009 }, // action button
    { side: -1, y: 0.022, len: 0.014 }, // volume up
    { side: -1, y: 0.004, len: 0.014 }, // volume down
    { side: 1, y: 0.014, len: 0.018 }, // side button
    { side: 1, y: -0.022, len: 0.0075 }, // camera control
  ],
};

// iPhone 17: 149.6 x 71.5 x 7.95 mm, aluminium. Photo-checked: a vertical
// pill plateau top-left (back view) with two lenses stacked, a darker
// translucent tone of the body colour (macworld review), the flash on the
// back glass to the right of the pill. Same layout as the iPhone 16 (photo,
// and macrumors/macworld: "virtually identical") — the two differ in size
// and colours, not layout. Action + volume left, side + Camera Control right.
export const IPHONE_17: PhoneModelSpec = {
  id: "iphone-17",
  length: 0.1496,
  width: 0.0715,
  thickness: 0.00795,
  cornerRadius: 0.0108,
  plateau: {
    shape: "pill",
    width: 0.0196,
    height: 0.0398,
    radius: 0.0098,
    inset: 0.0062,
    thickness: 0.0017,
    cx: 0.0199,
    tone: 0.8,
    lenses: [
      { pos: [0, 0.0099], r: 0.0068 }, // main, top
      { pos: [0, -0.0099], r: 0.0068 }, // ultra wide, bottom
    ],
    extras: [{ pos: [-0.0158, 0.0012], r: 0.0021, colour: "#eceae2", onBack: true }], // flash, beside the pill
  },
  lensRing: true,
  buttons: [
    { side: -1, y: 0.04, len: 0.008 }, // action button
    { side: -1, y: 0.022, len: 0.013 }, // volume up
    { side: -1, y: 0.006, len: 0.013 }, // volume down
    { side: 1, y: 0.014, len: 0.017 }, // side button
    { side: 1, y: -0.024, len: 0.0075 }, // camera control
  ],
};

// iPhone 16: 147.6 x 71.6 x 7.80 mm (apple.com/iphone-16/specs). Same
// vertical-pill layout as the iPhone 17 (see there) and the same buttons;
// in the photo its pill is a stronger tint of the body colour. Distinct from
// the 17 in size and in its (more saturated) colours only — that's the real
// product, not something to invent a difference for.
export const IPHONE_16: PhoneModelSpec = {
  id: "iphone-16",
  length: 0.1476,
  width: 0.0716,
  thickness: 0.0078,
  cornerRadius: 0.0106,
  plateau: {
    shape: "pill",
    width: 0.0194,
    height: 0.0394,
    radius: 0.0097,
    inset: 0.006,
    thickness: 0.0017,
    cx: 0.0201,
    tone: 0.72,
    lenses: [
      { pos: [0, 0.0098], r: 0.0067 },
      { pos: [0, -0.0098], r: 0.0067 },
    ],
    extras: [{ pos: [-0.0157, 0.0012], r: 0.0021, colour: "#eceae2", onBack: true }],
  },
  lensRing: true,
  buttons: [
    { side: -1, y: 0.039, len: 0.008 }, // action button
    { side: -1, y: 0.021, len: 0.013 }, // volume up
    { side: -1, y: 0.005, len: 0.013 }, // volume down
    { side: 1, y: 0.013, len: 0.017 }, // side button
    { side: 1, y: -0.024, len: 0.0075 }, // camera control
  ],
};

// iPhone 17e: 146.7 x 71.5 x 7.8 mm (apple.com/iphone-17e/specs, same body
// as the 16e). Photo-checked: one lens in a small round raised ring
// top-left, a mic dot and the flash on the back glass to its right; the
// front has a notch, not a Dynamic Island (product-line.md). Three buttons
// on the left (Action, volume up/down, visible in the photo), side button on
// the right, no Camera Control (product-line.md).
export const IPHONE_17E: PhoneModelSpec = {
  id: "iphone-17e",
  length: 0.1467,
  width: 0.0715,
  thickness: 0.0078,
  cornerRadius: 0.0102,
  plateau: {
    shape: "ring",
    width: 0.0158,
    height: 0.0158,
    radius: 0.0079,
    inset: 0.0056,
    thickness: 0.0012,
    cx: 0.0222,
    tone: 0.95,
    lenses: [{ pos: [0, 0], r: 0.0058 }],
    extras: [
      { pos: [-0.0102, 0.0004], r: 0.0007, colour: "#1c2430", onBack: true }, // mic
      { pos: [-0.0158, 0.0004], r: 0.0021, colour: "#eceae2", onBack: true }, // flash
    ],
  },
  lensRing: true,
  buttons: [
    { side: -1, y: 0.04, len: 0.007 }, // action button
    { side: -1, y: 0.023, len: 0.012 }, // volume up
    { side: -1, y: 0.008, len: 0.012 }, // volume down
    { side: 1, y: 0.015, len: 0.017 }, // side button
  ],
  screen: { cutout: "notch" },
};

export const PHONE_MODELS: Record<string, PhoneModelSpec> = {
  [IPHONE_DUO.id]: IPHONE_DUO,
  [IPHONE_18_PRO.id]: IPHONE_18_PRO,
  [IPHONE_AIR.id]: IPHONE_AIR,
  [IPHONE_17.id]: IPHONE_17,
  [IPHONE_17E.id]: IPHONE_17E,
  [IPHONE_16.id]: IPHONE_16,
};

// Body + camera plateau + lenses + buttons, merged into the three finish
// buckets `Parts` tracks (metal buttons, matte body/plateau, gloss lenses).
// The body is a `slab` facing +z at its front (the screen side); the plateau
// and lenses sit on the back, at -z.
export function buildPhoneBody(spec: PhoneModelSpec, bodyColour: string, plateauColour: string): Record<Finish, BufferGeometry | null> {
  const p = new Parts();
  const { length: L, width: W, thickness: T, cornerRadius: R } = spec;
  if (spec.fold) addFoldedBody(p, spec, bodyColour);
  else p.add("matte", slab(W, L, T, R), bodyColour);
  const pl = spec.plateau;
  const backZ = -(T / 2 + 0.0006);
  if (pl.shape !== "none") {
    const plateauCx = pl.cx ?? W / 2 - pl.width / 2 - (W - pl.width) * 0.07; // hugs screen-left in the back view, a small margin in from that edge
    const plateauCy = L / 2 - pl.inset - pl.height / 2;
    const plateauCz = -(T / 2 + pl.thickness / 2);
    // the plateau is a visibly different finish from the body (two-tone
    // back), not just a darker tint of the same material: glossier and a
    // touch cooler, the way a polished vs bead-blasted aluminium patch reads.
    if (pl.shape === "ring") {
      p.add("gloss", cyl(pl.width / 2, pl.width / 2, pl.thickness, 28), plateauColour, [plateauCx, plateauCy, plateauCz], [Math.PI / 2, 0, 0]);
    } else {
      p.add("gloss", slab(pl.width, pl.height, pl.thickness, pl.radius), plateauColour, [plateauCx, plateauCy, plateauCz]);
    }
    const lensZ = -(T / 2 + pl.thickness + 0.0008);
    for (const l of pl.lenses) {
      if (spec.lensRing) {
        p.add("gloss", cyl(l.r * 1.1, l.r * 1.12, 0.0022, 24), "#dfe2e6", [plateauCx + l.pos[0], plateauCy + l.pos[1], lensZ + 0.0002], [Math.PI / 2, 0, 0]);
      }
      p.add("gloss", cyl(l.r, l.r, 0.0016, 20), "#111318", [plateauCx + l.pos[0], plateauCy + l.pos[1], lensZ - (spec.lensRing ? 0.0004 : 0)], [Math.PI / 2, 0, 0]);
      p.add("gloss", cyl(l.r * 0.52, l.r * 0.52, 0.0018, 16), "#2c3c56", [plateauCx + l.pos[0], plateauCy + l.pos[1], lensZ - 0.0001 - (spec.lensRing ? 0.0004 : 0)], [Math.PI / 2, 0, 0]);
    }
    for (const e of pl.extras ?? []) {
      p.add("gloss", cyl(e.r, e.r, 0.0012, 14), e.colour, [plateauCx + e.pos[0], plateauCy + e.pos[1], e.onBack ? backZ : lensZ], [Math.PI / 2, 0, 0]);
    }
  }
  // A folded phone's buttons sit on its back (camera) half, -z, not on the
  // seam or the outer-screen half (iPhone Duo photo, see its note).
  const buttonZ = spec.fold ? -T / 4 : 0;
  for (const b of spec.buttons) {
    p.add("metal", box(0.0012, b.len, Math.min(0.0038, spec.fold ? T * 0.3 : T * 0.45)), "#d7d9dc", [b.side * (W / 2 + 0.0003), b.y, buttonZ]);
  }
  for (const b of spec.topButtons ?? []) {
    p.add("metal", box(b.len, 0.0012, Math.min(0.0038, T * 0.3)), "#d7d9dc", [b.x, L / 2 + 0.0003, buttonZ]);
  }
  return p.build();
}

// A closed book-style foldable: two halves (each T/2) meeting at a dark seam,
// the long side at `hingeSide` square-cornered and capped by a rounded metal
// hinge spine, the other side's corners rounded like any phone.
function addFoldedBody(p: Parts, spec: PhoneModelSpec, bodyColour: string): void {
  const { length: L, width: W, thickness: T, cornerRadius: R } = spec;
  const s = spec.fold!.hingeSide;
  const spineR = T / 2;
  const bodyW = W - spineR; // the spine supplies the last T/2 of width on the hinge side
  const cx = -s * (spineR / 2);
  const sq = 0.0012;
  // corners [TR, TL, BL, BR] in local x-y: square on the hinge side
  const radii: [number, number, number, number] = s < 0 ? [R, sq, sq, R] : [sq, R, R, sq];
  const frame = `#${new Color(bodyColour).lerp(new Color("#b9bbbe"), 0.45).getHexString()}`;
  for (const z of [T / 4, -T / 4]) p.add("matte", slab4(bodyW, L, T / 2 - 0.0003, radii, 0.0012), bodyColour, [cx, 0, z]);
  // the seam between the halves: a dark line round the edge
  p.add("matte", slab4(bodyW - 0.0004, L - 0.0004, 0.0007, radii, 0.0002), "#17181b", [cx, 0, 0]);
  // hinge spine, full length, titanium
  p.add("gloss", cyl(spineR, spineR, L - 0.0006, 24), frame, [s * (W / 2 - spineR), 0, 0]);
}

// ---------- watches, earbuds, headphones, speakers, trackers ----------
//
// Same pattern as the phones: one spec per real model, one generic builder
// per family. Dimensions are Apple's own tech-spec numbers (via WebSearch
// summaries of apple.com/<region>/<model>/specs and support.apple.com,
// 2026-10-12); looks were checked by eye against Apple's own AU photos
// (apple.com/au/watch/compare, apple.com/au/airpods/compare,
// apple.com/au/homepod) on 2026-10-12. Anything not seen in a photo or
// stated in a spec is marked "guess" at the field.

export interface WatchModelSpec {
  id: string;
  height: number; // case, m
  width: number;
  depth: number;
  cornerRadius: number;
  bezel: number; // m of black border round the screen
  front: "domed" | "flat-rim"; // domed glass edge to edge, or a flat crystal inside a raised metal lip
  crown: { r: number; y: number; accent?: string };
  sideButton: { len: number; y: number };
  crownGuard?: boolean;
  actionButton?: { len: number; y: number; colour: string }; // on the left side
  band: { width: number; thickness: number; style: "sport" | "ocean" };
}

// Apple Watch Series 12, 46 mm aluminium: 46 x 40 x 9.7 mm (support.apple.com
// /148589; 42 mm also sold, ceramic 47 x 41 x 9.85). Photo: rounded-rect
// domed case, thin bezel, crown and flat side button on the right, sport
// band. Bezel width is a guess (macrumors: S12 "has smaller screens").
export const WATCH_SERIES_12: WatchModelSpec = {
  id: "apple-watch-series-12",
  height: 0.046,
  width: 0.04,
  depth: 0.0097,
  cornerRadius: 0.0105,
  bezel: 0.0026,
  front: "domed",
  crown: { r: 0.0034, y: 0.0065 },
  sideButton: { len: 0.0115, y: -0.008 },
  band: { width: 0.024, thickness: 0.0032, style: "sport" }, // band size a guess
};

// Apple Watch Ultra 4, 49 mm titanium: 49 x 44 x 12 mm (apple.com/apple-watch-
// ultra-4/specs). Photo: squarer case, flat crystal in a raised titanium lip,
// crown with an orange ring inside a crown guard, a long side button below,
// Ocean-style ribbed band. Orange Action button on the LEFT side:
// photo-confirmed, apple.com/au/apple-watch-ultra-4/specs ("Hardware and
// Buttons" side-view diagram) and the front photo in the overview page's
// "Readiness and Vitals" tile (apple.com/au/apple-watch-ultra-4), 2026-10-12.
// Both show it a little BELOW centre (toward 6 o'clock), about 13-14 mm
// long; it was previously drawn above centre from memory. The same diagram
// gave the crown (about 6.6 mm above centre) and side button (about 7.7 mm
// below, about 11 mm long) positions, read by proportion.
export const WATCH_ULTRA_4: WatchModelSpec = {
  id: "apple-watch-ultra-4",
  height: 0.049,
  width: 0.044,
  depth: 0.012,
  cornerRadius: 0.0078,
  bezel: 0.0034,
  front: "flat-rim",
  crown: { r: 0.0042, y: 0.0066, accent: "#ff6a13" },
  sideButton: { len: 0.011, y: -0.0078 },
  crownGuard: true,
  actionButton: { len: 0.0135, y: -0.005, colour: "#ff6a13" },
  band: { width: 0.026, thickness: 0.0045, style: "ocean" }, // band size a guess
};

// Apple Watch SE 3, 44 mm aluminium: 44 x 38 x 10.7 mm (support.apple.com
// /125094; 40 mm also sold). Photo: like the Series but a visibly thicker
// black bezel, a silver crown and side button, sport band.
export const WATCH_SE_3: WatchModelSpec = {
  id: "apple-watch-se-3",
  height: 0.044,
  width: 0.038,
  depth: 0.0107,
  cornerRadius: 0.0098,
  bezel: 0.0036,
  front: "domed",
  crown: { r: 0.0033, y: 0.006 },
  sideButton: { len: 0.011, y: -0.0078 },
  band: { width: 0.022, thickness: 0.0032, style: "sport" }, // band size a guess
};

export const WATCH_MODELS: Record<string, WatchModelSpec> = {
  [WATCH_SERIES_12.id]: WATCH_SERIES_12,
  [WATCH_ULTRA_4.id]: WATCH_ULTRA_4,
  [WATCH_SE_3.id]: WATCH_SE_3,
};

// The loop of band a watch stands in on a display puck (the case faces +z at
// the front of the loop), so its geometry starts at y = 0 under the loop.
export const WATCH_LOOP_R = 0.027; // m, roughly a wrist; display choice, not a spec

// The case, crown, buttons and band loop. Origin: the bottom of the loop;
// the case centre is at (0, WATCH_LOOP_R, WATCH_LOOP_R). Returns the screen
// rectangle too so the caller can lay a texture on it.
export function buildWatch(spec: WatchModelSpec, caseColour: string, bandColour: string): { parts: Record<Finish, BufferGeometry | null>; screen: { w: number; h: number; r: number; z: number } } {
  const p = new Parts();
  const { height: H, width: W, depth: D, cornerRadius: R } = spec;
  const Rl = WATCH_LOOP_R;
  const caseZ = Rl;
  let screen = { w: 0, h: 0, r: 0, z: 0 };
  p.within(mat([0, Rl, caseZ]), () => {
    p.add("matte", slab(W, H, D, R, 0.0022), caseColour);
    let frontZ: number;
    if (spec.front === "flat-rim") {
      // raised metal lip, the crystal sitting inside it
      const lip = 0.0016;
      p.add("matte", slab(W, H, 0.0016, R, 0.0005), caseColour, [0, 0, D / 2 + 0.0006]);
      p.add("gloss", slab(W - 2 * lip, H - 2 * lip, 0.0012, Math.max(R - lip, 0.002), 0.0002), "#0b0c0e", [0, 0, D / 2 + 0.0009]);
      frontZ = D / 2 + 0.0016;
    } else {
      p.add("gloss", slab(W - 0.0008, H - 0.0008, 0.0024, R - 0.0004, 0.0011), "#0b0c0e", [0, 0, D / 2 - 0.0002]);
      frontZ = D / 2 + 0.001;
    }
    // back sensor dome
    p.add("gloss", cyl(W * 0.3, W * 0.34, 0.0016, 24), "#202226", [0, 0, -D / 2 - 0.0006], [Math.PI / 2, 0, 0]);
    // crown and side button on the right (+x, seen from the front)
    const c = spec.crown;
    p.add("metal", cyl(c.r, c.r, 0.0034, 20), caseColour, [W / 2 + 0.0017, c.y, 0.0005], [0, 0, Math.PI / 2]);
    if (c.accent) p.add("gloss", cyl(c.r * 1.02, c.r * 1.02, 0.0008, 20), c.accent, [W / 2 + 0.0022, c.y, 0.0005], [0, 0, Math.PI / 2]);
    if (spec.crownGuard) p.add("matte", box(0.0022, c.r * 3.4, D * 0.72), caseColour, [W / 2 + 0.0006, c.y, 0]);
    const b = spec.sideButton;
    p.add("metal", box(0.0012, b.len, D * 0.42), caseColour, [W / 2 + 0.0004, b.y, 0]);
    if (spec.actionButton) {
      const a = spec.actionButton;
      p.add("gloss", box(0.0014, a.len, D * 0.45), a.colour, [-W / 2 - 0.0005, a.y, 0]);
    }
    screen = { w: W - 2 * spec.bezel, h: H - 2 * spec.bezel, r: Math.max(R - spec.bezel, 0.002), z: caseZ + frontZ };
  });
  // the band: a flat loop behind the case, centred on (0, Rl, 0) in the y-z plane
  const bw = spec.band.width;
  const bt = spec.band.thickness;
  p.add("matte", torus(Rl, bt / 2, 8, 40), bandColour, [0, Rl, 0], [0, Math.PI / 2, 0], [1, 1, bw / bt]);
  if (spec.band.style === "ocean") {
    // the ribbed band: a raised rib every few degrees round the loop
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      if (Math.cos(a) > 0.82) continue; // hidden behind the case
      p.add("matte", box(bw * 0.8, 0.003, bt * 1.1), bandColour, [0, Rl + Math.sin(a) * Rl, Math.cos(a) * Rl], [-a, 0, 0]);
    }
  }
  return { parts: p.build(), screen };
}

export interface EarbudModelSpec {
  id: string;
  case: { height: number; width: number; depth: number; radius: number };
  bud: { height: number; width: number; depth: number; stem: number; tip: boolean };
  pose: "upright" | "nested"; // stems down with the heads standing up out of the case, or lying in it
}

// AirPods 5: buds 30.2 x 18.3 x 18.1 mm, case 46.2 x 50.1 x 21.2 mm
// (apple.com/airpods-5/specs). Photo (airpods/compare): a near-square case
// with the lid open, the buds standing upright in it, long stems, no tips.
export const AIRPODS_5: EarbudModelSpec = {
  id: "airpods-5",
  case: { height: 0.0462, width: 0.0501, depth: 0.0212, radius: 0.012 },
  bud: { height: 0.0302, width: 0.0183, depth: 0.0181, stem: 0.017, tip: false },
  pose: "upright",
};

// AirPods Pro 3: buds 30.9 x 19.2 x 27.0 mm, case 47.2 x 62.2 x 21.8 mm
// (apple.com/au/airpods-pro/specs). Photo: a wider, landscape case, the buds
// nested low in it with silicone ear tips showing, shorter stems.
export const AIRPODS_PRO_3: EarbudModelSpec = {
  id: "airpods-pro-3",
  case: { height: 0.0472, width: 0.0622, depth: 0.0218, radius: 0.0105 },
  bud: { height: 0.0309, width: 0.0192, depth: 0.027, stem: 0.013, tip: true },
  pose: "nested",
};

export const EARBUD_MODELS: Record<string, EarbudModelSpec> = {
  [AIRPODS_5.id]: AIRPODS_5,
  [AIRPODS_PRO_3.id]: AIRPODS_PRO_3,
};

// The case standing on its base with the lid tipped open, and the two buds
// in it. Origin: the middle of the case's base.
export function buildEarbuds(spec: EarbudModelSpec, colour: string): Record<Finish, BufferGeometry | null> {
  const p = new Parts();
  const { height: H, width: W, depth: D, radius: R } = spec.case;
  const h0 = H * 0.7; // the base; the lid is the top 30%
  const lidH = H - h0;
  const sq = 0.0015;
  p.add("gloss", slab4(W, h0, D, [sq, sq, R, R], 0.0025), colour, [0, h0 / 2, 0]);
  p.add("matte", slab(W - 0.004, D - 0.004, 0.0006, 0.004), "#2a2c30", [0, h0 + 0.0001, 0], [Math.PI / 2, 0, 0]); // the dark well round the buds
  p.add("gloss", cyl(0.0011, 0.0011, 0.0006, 10), "#7ad48a", [0, h0 * 0.52, D / 2 + 0.0002], [Math.PI / 2, 0, 0]); // status light
  // lid, hinged at the back top edge, tipped back past upright
  p.within(mat([0, h0, -D / 2], [-1.85, 0, 0]), () => {
    p.add("gloss", slab4(W, lidH, D, [R, R, sq, sq], 0.0025), colour, [0, lidH / 2, D / 2]);
  });
  const b = spec.bud;
  const headR = b.width * 0.4;
  for (const s of [-1, 1]) {
    const x = s * W * (spec.pose === "upright" ? 0.2 : 0.23);
    if (spec.pose === "upright") {
      // lifted half out of the case, as the maker's photo shows them: the
      // stem standing in its well, the head on top, the speaker facing in
      const stemTop = h0 + b.stem * 0.55;
      p.add("gloss", cyl(0.0026, 0.0029, b.stem * 0.9, 12), "#f6f6f4", [x, stemTop - b.stem * 0.45, 0]);
      p.add("gloss", sphere(headR, 16, 12), "#f6f6f4", [x - s * headR * 0.15, stemTop + headR * 0.8, 0], [0, 0, 0], [1.05, 1, 0.95]);
      p.add("matte", cyl(headR * 0.4, headR * 0.4, 0.0006, 14), "#3a3d42", [x - s * headR * 1.05, stemTop + headR * 0.9, 0], [0, 0, Math.PI / 2]); // speaker mesh
    } else {
      // nested low in the case: the head just above the rim, the stem lying
      // toward the outside, the ear tip pointing in
      p.add("gloss", sphere(headR, 16, 12), "#f6f6f4", [x, h0 + headR * 0.3, 0], [0, 0, 0], [1, 0.85, 0.95]);
      p.add("gloss", cyl(0.0024, 0.0026, b.stem, 12), "#f6f6f4", [x + s * (headR + b.stem * 0.35), h0 + 0.0008, 0], [0, 0, (s * Math.PI) / 2.3]);
      if (b.tip) {
        p.add("matte", sphere(headR * 0.62, 14, 10), "#e4e5e3", [x - s * headR * 0.95, h0 + headR * 0.4, 0], [0, 0, 0], [0.7, 0.9, 0.9]);
      }
    }
  }
  return p.build();
}

export interface HeadphoneModelSpec {
  id: string;
  height: number; // overall, m
  width: number; // overall, cup to cup
  depth: number; // overall, the cups' front-to-back
  cup: { height: number; thickness: number; radius: number };
  canopyWidth: number; // the mesh band under the steel frame
}

// AirPods Max 2: 187.3 x 168.6 x 83.4 mm, 386.2 g (apple.com/airpods-max/
// specs; same shell as the original Max). Photo: rounded-rect cups,
// stainless arms and frame, a knit-mesh canopy. Cup height/thickness and
// canopy width are GUESSES fitted inside those overall numbers. Controls:
// photo-confirmed 2026-10-12 against support.apple.com/en-au/guide/airpods/
// devb2c431317/web (AirPods Max 2 diagram: the outside of the RIGHT cup,
// Digital Crown top-left = toward the back of the head, listening-mode
// button top-right = toward the face, the arm between them) and the
// "headphone controls" photo on apple.com/au/shop/buy-airpods/airpods-max-2
// (crown and pill button each about 0.22 of the cup's depth either side of
// the arm; crown about 10.5 mm across, button about 12 x 5.5 mm, by
// proportion). The button was previously drawn behind the arm, beside the
// crown; it is in front of the arm.
export const AIRPODS_MAX_2: HeadphoneModelSpec = {
  id: "airpods-max-2",
  height: 0.1873,
  width: 0.1686,
  depth: 0.0834,
  cup: { height: 0.094, thickness: 0.036, radius: 0.026 },
  canopyWidth: 0.04,
};

export const HEADPHONE_MODELS: Record<string, HeadphoneModelSpec> = {
  [AIRPODS_MAX_2.id]: AIRPODS_MAX_2,
};

// Standing on the cups, facing +z (the wearer's face would point +z). Origin:
// on the surface, between the cups.
export function buildHeadphones(spec: HeadphoneModelSpec, colour: string): Record<Finish, BufferGeometry | null> {
  const p = new Parts();
  const { height: H, width: W, depth: D } = spec;
  const c = spec.cup;
  const cupX = W / 2 - c.thickness / 2;
  const cushion = `#${new Color(colour).lerp(new Color("#d8d8d6"), 0.25).getHexString()}`;
  for (const s of [-1, 1]) {
    // the cup: a rounded rect in the y-z plane, its thickness along x
    p.add("matte", slab(D, c.height, c.thickness * 0.62, c.radius, 0.004), colour, [s * (cupX + c.thickness * 0.17), c.height / 2, 0], [0, Math.PI / 2, 0]);
    p.add("matte", slab(D * 0.96, c.height * 0.96, c.thickness * 0.4, c.radius * 0.95, 0.006), cushion, [s * (cupX - c.thickness * 0.33), c.height / 2, 0], [0, Math.PI / 2, 0]);
  }
  // on top of the right cup (-x: the wearer's right), either side of the arm
  // (z = 0): the digital crown behind it (-z), the listening-mode button in
  // front of it (+z, toward the face). Photo-confirmed, see the spec note.
  p.add("metal", cyl(0.0052, 0.0052, 0.006, 18), "#d7d9dc", [-cupX - c.thickness * 0.1, c.height + 0.002, -D * 0.22]);
  p.add("metal", box(0.0055, 0.002, 0.012), "#d7d9dc", [-cupX - c.thickness * 0.1, c.height + 0.0005, D * 0.22]);
  // headband: stainless frame arc over a wide mesh canopy, arms down to the cups
  const tube = 0.0035;
  const Rarc = cupX - 0.004;
  const yc = H - Rarc - tube;
  p.add("metal", torus(Rarc, tube, 8, 36, Math.PI), "#c9ccd0", [0, yc, 0]);
  p.add("matte", torus(Rarc - 0.008, 0.0028, 8, 36, Math.PI), colour, [0, yc, 0], [0, 0, 0], [1, 1, spec.canopyWidth / 2 / 0.0028]);
  for (const s of [-1, 1]) {
    p.add("metal", cyl(0.0022, 0.0022, yc - c.height + 0.004, 10), "#c9ccd0", [s * Rarc, (yc + c.height) / 2, 0]);
  }
  return p.build();
}

export interface SpeakerModelSpec {
  id: string;
  height: number;
  diameter: number;
  shape: "rounded-cylinder" | "truncated-sphere";
  topR: number; // the touch surface on top, m
}

// HomePod: 168 x 142 mm, 2.3 kg (apple.com/au/homepod-2nd-generation/specs).
// Confirmed 2026-10-12 that the "HomePod" sold today (A$549, Midnight/White,
// apple.com/au/shop/buy-homepod/homepod) IS the 2nd generation: the
// apple.com/au/homepod page's HomePod "Learn more" links to
// /au/homepod-2nd-generation/. Photo: a mesh cylinder with well-rounded
// shoulders and a flat touch-surface top.
export const HOMEPOD: SpeakerModelSpec = { id: "homepod", height: 0.168, diameter: 0.142, shape: "rounded-cylinder", topR: 0.04 };

// HomePod mini: 84.3 x 97.9 mm (apple.com/homepod-mini/specs). Photo: a mesh
// sphere with flat top and bottom.
export const HOMEPOD_MINI: SpeakerModelSpec = { id: "homepod-mini", height: 0.0843, diameter: 0.0979, shape: "truncated-sphere", topR: 0.021 };

export const SPEAKER_MODELS: Record<string, SpeakerModelSpec> = {
  [HOMEPOD.id]: HOMEPOD,
  [HOMEPOD_MINI.id]: HOMEPOD_MINI,
};

// The lathe profile (radius, height) of a speaker's mesh body, bottom to top.
export function speakerProfile(spec: SpeakerModelSpec): Vector2[] {
  const pts: Vector2[] = [];
  const r = spec.diameter / 2;
  const H = spec.height;
  if (spec.shape === "rounded-cylinder") {
    const rb = 0.012; // bottom edge rounding (guess)
    const rt = 0.027; // shoulder rounding (from the photo, by eye)
    pts.push(new Vector2(0.0001, 0));
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
      pts.push(new Vector2(r - rb + Math.cos(a) * rb, rb + Math.sin(a) * rb));
    }
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * (Math.PI / 2);
      pts.push(new Vector2(r - rt + Math.cos(a) * rt, H - rt + Math.sin(a) * rt));
    }
    pts.push(new Vector2(0.0001, H));
  } else {
    const h = H / 2;
    const a0 = Math.asin(h / r);
    pts.push(new Vector2(0.0001, 0));
    for (let i = 0; i <= 20; i++) {
      const a = -a0 + (i / 20) * 2 * a0;
      pts.push(new Vector2(Math.cos(a) * r, h + Math.sin(a) * r));
    }
    pts.push(new Vector2(0.0001, H));
  }
  return pts;
}

export interface TrackerModelSpec {
  id: string;
  diameter: number;
  thickness: number;
}

// AirTag (current generation): 31.9 mm across, 8.0 mm thick (support.apple.com
// /126203). A white domed face over a polished steel back.
export const AIRTAG: TrackerModelSpec = { id: "airtag", diameter: 0.0319, thickness: 0.008 };

export const TRACKER_MODELS: Record<string, TrackerModelSpec> = { [AIRTAG.id]: AIRTAG };

// Lying white face up. Origin: on the surface, under the centre.
export function buildTracker(spec: TrackerModelSpec): Record<Finish, BufferGeometry | null> {
  const p = new Parts();
  const r = spec.diameter / 2;
  const T = spec.thickness;
  p.add("metal", sphere(r * 0.98, 24, 10), "#d9dcdf", [0, T * 0.32, 0], [0, 0, 0], [1, (T * 0.32) / r, 1]); // steel back, domed
  p.add("gloss", cyl(r, r, T * 0.36, 32), "#f4f4f2", [0, T * 0.5, 0]);
  p.add("gloss", sphere(r, 24, 10), "#f4f4f2", [0, T * 0.68, 0], [0, 0, 0], [1, (T * 0.32) / r, 1]); // white face, domed
  return p.build();
}
