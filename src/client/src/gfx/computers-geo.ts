// Shared geometry and materials for laptops, tablets, monitors and desktops.
//
// Every device is two meshes: a "body" (all the solid parts merged into one
// geometry, built once per model) and a "screen". The body's parts are tinted
// by vertex colour (glass, hinge, stands, folio darker) and the keyboard
// decks, keyboard, vents and lid mark come from one shared atlas texture, so
// one material per finish colour covers every part.
//
// SCOPE D37: one spec per real model, keyed by an id named for the real
// product (references/product-line.md sections 2 to 5). A new model is a new
// spec, not new drawing code. Where a number came from is said beside it:
// "sourced" numbers came from review / spec coverage found by web search on
// 2026-10-12 (URLs in the comments); "estimate" numbers are mine and were not
// checked against a photo. Display bezels are DERIVED, not guessed: the
// active display is resolution / ppi (both sourced), centred in the sourced
// body, so the bezel is whatever is left over.
import {
  BufferAttribute,
  type BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  BoxGeometry,
  ExtrudeGeometry,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const PI = Math.PI;
const IN = 0.0254;

// ---------- the atlas: keyboard decks, keyboards, vents, the mark ----------

const ATLAS = 512;
type Region = readonly [number, number, number, number]; // x, y, w, h in px
const R_PRO: Region = [0, 0, 256, 182];
const R_AIR: Region = [256, 0, 256, 182];
const R_FOLIO: Region = [0, 192, 256, 184];
const R_AIO: Region = [256, 192, 256, 104];
const R_MARK: Region = [256, 304, 64, 64];
const R_NEO: Region = [320, 304, 192, 133];
const R_VENT5: Region = [0, 384, 256, 26];
const R_VENT9: Region = [0, 414, 256, 44];
const WHITE_UV: [number, number] = [300.5 / ATLAS, 1 - 480.5 / ATLAS];

type G = CanvasRenderingContext2D;

// One keyboard: rows of key widths in key units (15 units per row).
const ROWS: number[][] = [
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
  [1.8, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.2],
  [2.35, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.65],
  [1, 1, 1.2, 1.4, 4.8, 1.4, 1.2, 3],
];

function keyboard(g: G, x: number, y: number, w: number, keyCol: string, wellCol: string | null, fnRow = true): number {
  const u = w / 15;
  const gap = u * 0.13;
  const rowHs = ROWS.map((_, i) => (i === 0 ? (fnRow ? u * 0.55 : 0) : u));
  const total = rowHs.reduce((a, b) => a + b, 0) + gap;
  if (wellCol) {
    g.fillStyle = wellCol;
    g.beginPath();
    g.roundRect(x - gap, y - gap, w + gap * 2, total + gap, 2);
    g.fill();
  }
  let yy = y;
  ROWS.forEach((row, i) => {
    const rh = rowHs[i];
    if (rh === 0) return;
    let xx = x;
    row.forEach((kw, k) => {
      g.fillStyle = keyCol;
      const last = i === ROWS.length - 1 && k === row.length - 1;
      if (last) {
        // the arrow keys: half-height up/down in the middle
        const aw = (kw * u - gap * 3) / 3;
        g.fillRect(xx, yy + rh * 0.5, aw, rh * 0.5 - gap);
        g.fillRect(xx + aw + gap, yy, aw, rh * 0.5 - gap * 0.5);
        g.fillRect(xx + aw + gap, yy + rh * 0.5, aw, rh * 0.5 - gap);
        g.fillRect(xx + (aw + gap) * 2, yy + rh * 0.5, aw, rh * 0.5 - gap);
      } else {
        g.beginPath();
        g.roundRect(xx, yy, kw * u - gap, rh - gap, Math.min(2, u * 0.12));
        g.fill();
      }
      xx += kw * u;
    });
    yy += rh;
  });
  return total;
}

function trackpad(g: G, cx: number, y: number, w: number, h: number, fill = "#f4f4f4") {
  g.fillStyle = fill;
  g.strokeStyle = "#a9a9a9";
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(cx - w / 2, y, w, h, 4);
  g.fill();
  g.stroke();
}

function grille(g: G, x: number, y: number, w: number, h: number) {
  g.fillStyle = "#5a5a5a";
  for (let yy = y; yy < y + h; yy += 2.2) for (let xx = x; xx < x + w; xx += 2.2) g.fillRect(xx, yy, 1, 1);
}

function vents(g: G, [x, y, w]: Region, rows: number) {
  g.fillStyle = "#3a3a3a";
  for (let i = 0; i < rows; i++) {
    for (let xx = x + 3; xx < x + w - 2; xx += 4.6) {
      g.beginPath();
      g.arc(xx + (i % 2) * 2.3, y + 3 + i * 4.6, 1.25, 0, PI * 2);
      g.fill();
    }
  }
}

function drawAtlas(g: G) {
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, ATLAS, ATLAS);
  // pro deck: keyboard with a speaker grille strip either side
  {
    const [x, y, w, h] = R_PRO;
    const kw = w * 0.8;
    const kh = keyboard(g, x + (w - kw) / 2, y + 9, kw, "#121214", "#c4c4c6");
    grille(g, x + 8, y + 9, w * 0.065, kh);
    grille(g, x + w - 8 - w * 0.065, y + 9, w * 0.065, kh);
    trackpad(g, x + w / 2, y + 9 + kh + 9, w * 0.44, h - kh - 30);
    g.fillStyle = "#8a8a8a";
    g.fillRect(x + w / 2 - 12, y + h - 2, 24, 2); // the finger notch at the front
  }
  // thin-and-light deck: full-width keyboard, a bigger trackpad
  {
    const [x, y, w, h] = R_AIR;
    const kw = w * 0.88;
    const kh = keyboard(g, x + (w - kw) / 2, y + 8, kw, "#121214", "#c4c4c6");
    trackpad(g, x + w / 2, y + 8 + kh + 8, w * 0.46, h - kh - 26);
    g.fillStyle = "#8a8a8a";
    g.fillRect(x + w / 2 - 12, y + h - 2, 24, 2);
  }
  // entry deck (MacBook Neo): colour-matched keys (sourced: "color-matched
  // Magic Keyboard with no backlight", macrumors.com/roundup/macbook-neo),
  // drawn a shade darker than the deck so the finish tint carries onto them;
  // a smaller mechanical trackpad (its size is an estimate).
  {
    const [x, y, w, h] = R_NEO;
    const kw = w * 0.86;
    const kh = keyboard(g, x + (w - kw) / 2, y + 7, kw, "#cfcfcf", "#e4e4e4");
    trackpad(g, x + w / 2, y + 7 + kh + 8, w * 0.4, h - kh - 22, "#f7f7f7");
  }
  // tablet keyboard folio: keys, a function row, a small trackpad
  {
    const [x, y, w, h] = R_FOLIO;
    const kw = w * 0.92;
    const kh = keyboard(g, x + (w - kw) / 2, y + 10, kw, "#101012", null);
    trackpad(g, x + w / 2, y + 10 + kh + 10, w * 0.38, h - kh - 34);
  }
  // desktop keyboard: light keys on a frame of the finish colour
  {
    const [x, y, w, h] = R_AIO;
    g.fillStyle = "#c9c9c9";
    g.fillRect(x, y, w, h);
    const kw = w * 0.94;
    keyboard(g, x + (w - kw) / 2, y + 6, kw, "#ffffff", null);
  }
  // display back vents: five rows and nine rows (sourced row counts, see DISPLAY specs)
  vents(g, R_VENT5, 5);
  vents(g, R_VENT9, 9);
  // the lid mark: invented ring and dot, a shade darker than the finish
  {
    const [x, y, w] = R_MARK;
    const cx = x + w / 2;
    const cy = y + w / 2;
    g.strokeStyle = "#9c9c9c";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, w * 0.32, 0, PI * 2);
    g.stroke();
    g.fillStyle = "#9c9c9c";
    g.beginPath();
    g.arc(cx + 3, cy - 2, w * 0.12, 0, PI * 2);
    g.fill();
  }
}

let atlasTex: CanvasTexture | null = null;
function atlas(): CanvasTexture {
  if (atlasTex) return atlasTex;
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  drawAtlas(canvas.getContext("2d")!);
  atlasTex = new CanvasTexture(canvas);
  atlasTex.colorSpace = SRGBColorSpace;
  atlasTex.anisotropy = 8;
  return atlasTex;
}

// One body material per finish: brushed metal, fairly glossy.
const bodyMats = new Map<string, MeshStandardMaterial>();
export function bodyMaterial(colour: string): MeshStandardMaterial {
  let m = bodyMats.get(colour);
  if (m) return m;
  m = new MeshStandardMaterial({
    color: new Color(colour),
    map: atlas(),
    vertexColors: true,
    metalness: 0.6,
    roughness: 0.3,
  });
  bodyMats.set(colour, m);
  return m;
}

// ---------- geometry helpers ----------

function rrShape(w: number, h: number, r: number): Shape {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  r = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, PI / 2, PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, PI, 1.5 * PI, false);
  return s;
}

// A rounded-corner slab lying flat: w (x) by d (z), h tall from y = 0, with
// softly bevelled edges.
function slab(w: number, d: number, h: number, r: number, bevel = 0.001): BufferGeometry {
  const b = Math.min(bevel, h / 2.5);
  const geo = new ExtrudeGeometry(rrShape(w - 2 * b, d - 2 * b, Math.max(0.0008, r - b)), {
    depth: Math.max(0.0001, h - 2 * b),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 5,
  });
  geo.rotateX(-PI / 2);
  geo.translate(0, b, 0);
  return geo;
}

// The same slab standing up: w wide, hgt tall from y = 0, its front face at
// z = t facing +z and its back at z = 0.
function panel(w: number, hgt: number, t: number, r: number, bevel = 0.001): BufferGeometry {
  const geo = slab(w, hgt, t, r, bevel);
  geo.rotateX(PI / 2);
  geo.translate(0, hgt / 2, 0);
  return geo;
}

// A flat rounded rectangle facing +z, from y = 0 up, uv 0..1 over it.
function screenShape(w: number, h: number, r: number): BufferGeometry {
  const geo = new ShapeGeometry(rrShape(w, h, r), 6);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  geo.translate(0, h / 2, 0);
  return geo;
}

const lin = (s: number) => Math.pow(s, 2.2);

// Normalise one part for merging: non-indexed, a uv (into the atlas region,
// or the white texel) and a vertex colour shade (sRGB 0..1).
function part(geo: BufferGeometry, m: Matrix4 | null, shade = 1, region?: Region): BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.clearGroups();
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const uv = g.attributes.uv as BufferAttribute;
  for (let i = 0; i < n; i++) {
    if (region) {
      const [rx, ry, rw, rh] = region;
      uv.setXY(i, (rx + uv.getX(i) * rw) / ATLAS, 1 - (ry + (1 - uv.getY(i)) * rh) / ATLAS);
    } else uv.setXY(i, WHITE_UV[0], WHITE_UV[1]);
  }
  const c = lin(shade);
  const col = new Float32Array(n * 3).fill(c);
  g.setAttribute("color", new BufferAttribute(col, 3));
  for (const name of Object.keys(g.attributes)) {
    if (!["position", "normal", "uv", "color"].includes(name)) g.deleteAttribute(name);
  }
  g = g as BufferGeometry;
  return g;
}

const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
const RX = (a: number) => new Matrix4().makeRotationX(a);
const RY = (a: number) => new Matrix4().makeRotationY(a);
const RZ = (a: number) => new Matrix4().makeRotationZ(a);
const mul = (...ms: Matrix4[]) => ms.reduce((a, b) => a.clone().multiply(b));

// A flat strut of width w and thickness t from point a to point b (in the yz plane).
function strut(a: Vector3, b: Vector3, w: number, t: number): BufferGeometry {
  const d = b.clone().sub(a);
  const L = d.length();
  const geo = new BoxGeometry(w, L, t);
  geo.applyMatrix4(mul(T((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), RX(Math.atan2(d.z, d.y))));
  return geo;
}

function markDisc(radius: number, m: Matrix4): BufferGeometry {
  return part(new CircleGeometry(radius, 24), mul(m, RY(PI)), 1, R_MARK);
}

// A small dark disc facing +z (camera, lens, port hole).
function dot(r: number, m: Matrix4, shade = 0.08): BufferGeometry {
  return part(new CircleGeometry(r, 14), m, shade);
}

// ---------- screens ----------
//
// The screen art comes from computers-screens.ts, which bakes a bezel into
// each format's texture. Here the bezel is real geometry (derived per model),
// so the screen mesh covers only the active display and its UVs are cropped
// to the texture's inner area. These numbers mirror computers-screens.ts's
// FORMATS table (not exported there); keep them in step if it changes.
export type ScreenFormat = "laptop" | "tablet" | "monitor" | "aio";
const FMT: Record<ScreenFormat, { w: number; h: number; side: number; top: number; bottom: number }> = {
  laptop: { w: 256, h: 181, side: 5, top: 8, bottom: 15 },
  tablet: { w: 256, h: 182, side: 8, top: 8, bottom: 8 },
  monitor: { w: 256, h: 149, side: 5, top: 5, bottom: 5 },
  aio: { w: 256, h: 148, side: 6, top: 7, bottom: 6 },
};

function activeScreen(w: number, h: number, r: number, format: ScreenFormat, crop = true): BufferGeometry {
  const geo = screenShape(w, h, r);
  if (!crop) return geo;
  const f = FMT[format];
  const u0 = f.side / f.w;
  const u1 = 1 - f.side / f.w;
  const v0 = f.bottom / f.h;
  const v1 = 1 - f.top / f.h;
  const uv = geo.attributes.uv as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return geo;
}

// The active display in metres from a sourced resolution and pixel density.
export function displaySize(res: readonly [number, number], ppi: number): [number, number] {
  return [(res[0] / ppi) * IN, (res[1] / ppi) * IN];
}

export type DeviceGeo = { body: BufferGeometry; screen: BufferGeometry | null; format: ScreenFormat };

const geoCache = new Map<string, DeviceGeo>();
function cached(key: string, build: () => DeviceGeo): DeviceGeo {
  let g = geoCache.get(key);
  if (!g) {
    g = build();
    geoCache.set(key, g);
  }
  return g;
}

// ---------- laptops ----------

export type PortType = "usbc" | "magsafe" | "hdmi" | "sd" | "jack";
// z: m from the BACK edge toward the front (estimate: no photo checked)
export type Port = { type: PortType; z: number };
const PORT_SIZE: Record<PortType, [number, number]> = {
  usbc: [0.0084, 0.0026],
  magsafe: [0.0125, 0.0032],
  hdmi: [0.014, 0.0045],
  sd: [0.024, 0.0022],
  jack: [0.0035, 0.0035],
};

export type LaptopDeck = "pro" | "air" | "neo";
export interface LaptopSpec {
  id: string;
  name: string; // the real product name (references/product-line.md section 3)
  W: number; // width, m (sourced)
  D: number; // depth, m (sourced)
  T: number; // closed thickness, m (sourced)
  Hb: number; // base share of T, m (estimate: the split is not published)
  r: number; // footprint corner radius, m (estimate)
  res: readonly [number, number]; // native resolution (sourced)
  ppi: number; // (sourced)
  notch: { w: number; h: number } | null; // camera housing cut into the display (w, h estimates)
  deck: LaptopDeck;
  ports: { left: Port[]; right: Port[] };
}

// MacBook Neo: 297.4 x 206.4 x 12.7 mm, 13-inch 2408 x 1506 at 219 ppi,
// "thicker bezels all around", no notch, two USB-C on the left and a
// headphone jack on the right, colour-matched keyboard, mechanical trackpad.
// Sources: en.wikipedia.org/wiki/MacBook_Neo, macrumors.com/roundup/macbook-neo
// (review coverage, March 2026). Searched 2026-10-12.
export const MACBOOK_NEO: LaptopSpec = {
  id: "macbook-neo",
  name: "MacBook Neo",
  W: 0.2974,
  D: 0.2064,
  T: 0.0127,
  Hb: 0.0081,
  r: 0.012,
  res: [2408, 1506],
  ppi: 219,
  notch: null,
  deck: "neo",
  ports: { left: [{ type: "usbc", z: 0.03 }, { type: "usbc", z: 0.045 }], right: [{ type: "jack", z: 0.04 }] },
};

// MacBook Air (M5): same chassis as M4 (appleinsider.com M5 MacBook Air review,
// 2026-03-30; rtings.com). 13": 304.1 x 215 x 11.3 mm, 2560 x 1664 at 224 ppi;
// 15": 340.4 x 237.6 x 11.5 mm, 2880 x 1864 at 224 ppi (pixelmeasures.com).
// Uniform thickness, not a wedge, since the M2 redesign (expertreviews.co.uk).
// Ports MagSafe + two Thunderbolt left, jack right (references/products-computers.md).
const airPorts = {
  left: [{ type: "magsafe" as const, z: 0.026 }, { type: "usbc" as const, z: 0.045 }, { type: "usbc" as const, z: 0.059 }],
  right: [{ type: "jack" as const, z: 0.04 }],
};
export const MACBOOK_AIR_13: LaptopSpec = {
  id: "macbook-air-13",
  name: "MacBook Air 13-inch",
  W: 0.3041,
  D: 0.215,
  T: 0.0113,
  Hb: 0.0068,
  r: 0.011,
  res: [2560, 1664],
  ppi: 224,
  notch: { w: 0.03, h: 0.0065 },
  deck: "air",
  ports: airPorts,
};
export const MACBOOK_AIR_15: LaptopSpec = {
  ...MACBOOK_AIR_13,
  id: "macbook-air-15",
  name: "MacBook Air 15-inch",
  W: 0.3404,
  D: 0.2376,
  T: 0.0115,
  Hb: 0.0069,
  r: 0.0115,
  res: [2880, 1864],
  ppi: 224,
  ports: { left: airPorts.left.map((p) => ({ ...p, z: p.z + 0.004 })), right: [{ type: "jack", z: 0.044 }] },
};

// MacBook Pro (M5 / M5 Pro / M5 Max): chassis, ports and notch unchanged from
// M4 (bgr.com M5 Max review; appleinsider.com 16-inch M5 Max review, 2026-03).
// 14": 312.6 x 221.2 x 15.5 mm, 3024 x 1964 at 254 ppi; 16": 355.7 x 248.1 x
// 16.8 mm, 3456 x 2234 at 254 ppi. Ports: MagSafe, two Thunderbolt, jack on
// the left; Thunderbolt, HDMI, SDXC on the right (bgr.com lists the set; the
// side each sits on is from references/products-computers.md).
const proPorts = {
  left: [{ type: "magsafe" as const, z: 0.03 }, { type: "usbc" as const, z: 0.05 }, { type: "usbc" as const, z: 0.064 }, { type: "jack" as const, z: 0.15 }],
  right: [{ type: "sd" as const, z: 0.05 }, { type: "hdmi" as const, z: 0.12 }, { type: "usbc" as const, z: 0.15 }],
};
export const MACBOOK_PRO_14: LaptopSpec = {
  id: "macbook-pro-14",
  name: "MacBook Pro 14-inch",
  W: 0.3126,
  D: 0.2212,
  T: 0.0155,
  Hb: 0.01,
  r: 0.012,
  res: [3024, 1964],
  ppi: 254,
  notch: { w: 0.032, h: 0.0072 },
  deck: "pro",
  ports: proPorts,
};
export const MACBOOK_PRO_16: LaptopSpec = {
  id: "macbook-pro-16",
  name: "MacBook Pro 16-inch",
  W: 0.3557,
  D: 0.2481,
  T: 0.0168,
  Hb: 0.011,
  r: 0.013,
  res: [3456, 2234],
  ppi: 254,
  notch: { w: 0.032, h: 0.0072 },
  deck: "pro",
  ports: { left: proPorts.left.map((p) => ({ ...p, z: p.z * 1.1 })), right: proPorts.right.map((p) => ({ ...p, z: p.z * 1.1 })) },
};

export const LAPTOP_MODELS: Record<string, LaptopSpec> = Object.fromEntries(
  [MACBOOK_NEO, MACBOOK_AIR_13, MACBOOK_AIR_15, MACBOOK_PRO_14, MACBOOK_PRO_16].map((s) => [s.id, s]),
);

// Side/top bezel and bottom bezel (lid face between the hinge and the
// display), derived from the sourced body and display sizes. The top bezel is
// taken equal to the side bezel (estimate); the bottom is what remains.
export function laptopBezels(s: LaptopSpec): { side: number; bottom: number; dw: number; dh: number } {
  const [dw, dh] = displaySize(s.res, s.ppi);
  const side = (s.W - dw) / 2;
  return { side, bottom: s.D - side - dh, dw, dh };
}

const LID_TILT = (15 * PI) / 180; // open 105 degrees
const DECK: Record<LaptopDeck, Region> = { pro: R_PRO, air: R_AIR, neo: R_NEO };

export function laptopGeo(s: LaptopSpec): DeviceGeo {
  return cached(`laptop:${s.id}`, () => {
    const { W, D, Hb, r } = s;
    const Hl = s.T - Hb;
    const { side, bottom, dw, dh } = laptopBezels(s);
    const deck = new PlaneGeometry(W - 0.014, D - 0.01);
    deck.rotateX(-PI / 2);
    const hinge = new CylinderGeometry(0.0034, 0.0034, W - 0.07, 12);
    hinge.rotateZ(PI / 2);
    const lidM = mul(T(0, Hb, -D / 2 + 0.002), RX(-LID_TILT));
    const parts: BufferGeometry[] = [
      part(slab(W, D, Hb, r, 0.0014), null),
      part(deck, T(0, Hb + 0.0004, 0.001), 1, DECK[s.deck]),
      part(hinge, T(0, Hb + 0.0012, -D / 2 + 0.0045), 0.2),
      part(panel(W, D, Hl, r, 0.0012), lidM),
      markDisc(0.012, mul(lidM, T(0, D * 0.52, -0.0003))),
      // the glass: the whole lid face, near black (the bezel is what shows of it)
      part(screenShape(W - 0.002, D - 0.002, r - 0.001), mul(lidM, T(0, 0.001, Hl + 0.0002)), 0.03),
    ];
    const top = D - side;
    if (s.notch) {
      const n = new PlaneGeometry(s.notch.w, s.notch.h + 0.001);
      parts.push(part(n, mul(lidM, T(0, top - s.notch.h / 2 + 0.0005, Hl + 0.0006)), 0.02));
      parts.push(dot(0.0012, mul(lidM, T(0, top - s.notch.h / 2, Hl + 0.0007)), 0.12));
    } else {
      parts.push(dot(0.0012, mul(lidM, T(0, top + side / 2, Hl + 0.0004)), 0.12));
    }
    // ports: dark slots on the base's sides
    for (const [sgn, list] of [[-1, s.ports.left], [1, s.ports.right]] as const) {
      for (const p of list) {
        const [pw, ph] = PORT_SIZE[p.type];
        const geo = p.type === "jack" ? new CylinderGeometry(ph / 2, ph / 2, 0.0008, 10) : new BoxGeometry(0.0008, ph, pw);
        if (p.type === "jack") geo.rotateZ(PI / 2);
        parts.push(part(geo, T(sgn * (W / 2 - 0.0002), Hb / 2, -D / 2 + p.z + pw / 2), 0.05));
      }
    }
    const body = mergeGeometries(parts)!;
    const screen = activeScreen(dw, dh, 0.004, "laptop");
    screen.applyMatrix4(mul(lidM, T(0, bottom, Hl + 0.0004)));
    return { body, screen, format: "laptop" };
  });
}

// ---------- tablets ----------
//
// Tablets stand in landscape. Local frame: x along the long edge, y up the
// short edge, the screen facing +z. "Portrait top" is drawn on the LEFT short
// edge (an estimate of how the real one turns for landscape use).

export type TabletRear =
  | { kind: "bump" } // iPad Pro: square bump, wide lens, LiDAR, flash, mic / light-sensor dots
  | { kind: "lens"; r: number; flash: boolean }; // a single lens ring proud of the back, no bump
export type TabletButton = { edge: "top" | "left"; at: number; len: number }; // at: m from the edge's centre, +ve toward +x (top) or +y (left)

export interface TabletSpec {
  id: string;
  name: string; // the real product name (references/product-line.md section 2)
  W: number; // long edge, m (sourced)
  H: number; // short edge, m (sourced)
  t: number; // thickness, m (sourced)
  r: number; // corner radius, m (estimate)
  res: readonly [number, number]; // landscape resolution (sourced)
  ppi: number; // (sourced)
  frontCam: "long" | "short"; // which edge the front camera sits on, in landscape
  rear: TabletRear;
  buttons: TabletButton[]; // estimate: placements not checked against a photo
  keyboard: "cantilever" | "folio" | null; // which keyboard the store shows it with
}

// iPad Pro (M5): same form factor as M4 (en.wikipedia.org/wiki/IPad_Pro_(M5),
// techradar.com, gizmodo.com reviews). 11": 249.7 x 177.5 x 5.3 mm, 2420 x
// 1668; 13": 281.6 x 215.5 x 5.1 mm, 2752 x 2064; both 264 ppi
// (support.apple.com/en-us/125406, 125407). Front camera on the landscape
// edge (techcrunch.com 2024-05-07). Rear: one wide lens, LiDAR, adaptive
// flash, a mic and an ambient-light sensor in a small square bump
// (9to5mac.com 2024-05-21) — the arrangement inside the bump is a best guess.
// Keyboard: the cantilever Magic Keyboard (references/products-computers.md).
export const IPAD_PRO_11: TabletSpec = {
  id: "ipad-pro-11",
  name: "iPad Pro 11-inch",
  W: 0.2497,
  H: 0.1775,
  t: 0.0053,
  r: 0.011,
  res: [2420, 1668],
  ppi: 264,
  frontCam: "long",
  rear: { kind: "bump" },
  buttons: [
    { edge: "left", at: 0.05, len: 0.018 },
    { edge: "top", at: -0.07, len: 0.012 },
    { edge: "top", at: -0.052, len: 0.012 },
  ],
  keyboard: "cantilever",
};
export const IPAD_PRO_13: TabletSpec = {
  ...IPAD_PRO_11,
  id: "ipad-pro-13",
  name: "iPad Pro 13-inch",
  W: 0.2816,
  H: 0.2155,
  t: 0.0051,
  r: 0.012,
  res: [2752, 2064],
  buttons: [
    { edge: "left", at: 0.065, len: 0.018 },
    { edge: "top", at: -0.085, len: 0.012 },
    { edge: "top", at: -0.067, len: 0.012 },
  ],
};

// iPad Air (M4): identical to M3 (techadvisor.com, tomsguide.com M4 reviews).
// 11": 247.6 x 178.5 x 6.1 mm, 2360 x 1640; 13": 280.6 x 214.9 x 6.1 mm,
// 2732 x 2048; 264 ppi. Touch ID in the top button. Rear: a single lens, no
// square bump and no flash (best guess, not checked against a photo).
export const IPAD_AIR_11: TabletSpec = {
  id: "ipad-air-11",
  name: "iPad Air 11-inch",
  W: 0.2476,
  H: 0.1785,
  t: 0.0061,
  r: 0.0105,
  res: [2360, 1640],
  ppi: 264,
  frontCam: "long",
  rear: { kind: "lens", r: 0.0042, flash: false },
  buttons: [
    { edge: "left", at: 0.05, len: 0.02 },
    { edge: "top", at: -0.072, len: 0.013 },
    { edge: "top", at: -0.053, len: 0.013 },
  ],
  keyboard: "cantilever",
};
export const IPAD_AIR_13: TabletSpec = {
  ...IPAD_AIR_11,
  id: "ipad-air-13",
  name: "iPad Air 13-inch",
  W: 0.2806,
  H: 0.2149,
  r: 0.0115,
  res: [2732, 2048],
  buttons: [
    { edge: "left", at: 0.065, len: 0.02 },
    { edge: "top", at: -0.087, len: 0.013 },
    { edge: "top", at: -0.068, len: 0.013 },
  ],
};

// iPad (A16): 248.6 x 179.5 x 7.0 mm, same design as the 10th generation,
// Touch ID in the top button, no home button (en.wikipedia.org/wiki/
// IPad_(11th_generation), apple.com/ipad-11/specs via search). 2360 x 1640 at
// 264 ppi is NOT confirmed by a search result this session (same panel as the
// 11" Air is my assumption). Shown with the two-piece Magic Keyboard Folio
// (product-line.md section 10 lists it), not the cantilever.
export const IPAD: TabletSpec = {
  id: "ipad",
  name: "iPad",
  W: 0.2486,
  H: 0.1795,
  t: 0.007,
  r: 0.0105,
  res: [2360, 1640],
  ppi: 264,
  frontCam: "long",
  rear: { kind: "lens", r: 0.004, flash: false },
  buttons: [
    { edge: "left", at: 0.05, len: 0.02 },
    { edge: "left", at: 0.022, len: 0.012 },
    { edge: "left", at: 0.006, len: 0.012 },
  ],
  keyboard: "folio",
};

// iPad mini (A17 Pro): 195.4 x 134.8 x 6.3 mm, 8.3" 2266 x 1488 at 326 ppi
// (support.apple.com/en-au/121456). Front camera, volume buttons and top
// button all on the portrait TOP (short) edge (support.apple.com iPad mini
// user guide, via search). Rear: 12MP wide with True Tone flash (same
// source). No keyboard sold for it.
export const IPAD_MINI: TabletSpec = {
  id: "ipad-mini",
  name: "iPad mini",
  W: 0.1954,
  H: 0.1348,
  t: 0.0063,
  r: 0.0095,
  res: [2266, 1488],
  ppi: 326,
  frontCam: "short",
  rear: { kind: "lens", r: 0.0038, flash: true },
  buttons: [
    { edge: "left", at: 0.04, len: 0.016 },
    { edge: "left", at: -0.035, len: 0.01 },
    { edge: "left", at: -0.049, len: 0.01 },
  ],
  keyboard: null,
};

export const TABLET_MODELS: Record<string, TabletSpec> = Object.fromEntries(
  [IPAD_PRO_11, IPAD_PRO_13, IPAD_AIR_11, IPAD_AIR_13, IPAD, IPAD_MINI].map((s) => [s.id, s]),
);

export function tabletBezel(s: TabletSpec): { x: number; y: number; dw: number; dh: number } {
  const [dw, dh] = displaySize(s.res, s.ppi);
  return { x: (s.W - dw) / 2, y: (s.H - dh) / 2, dw, dh };
}

function tabletParts(s: TabletSpec, M: Matrix4, back: boolean): BufferGeometry[] {
  const { W, H, t, r } = s;
  const bz = tabletBezel(s);
  const parts = [
    part(panel(W, H, t, r, 0.0009), M),
    part(screenShape(W - 0.0016, H - 0.0016, r - 0.0008), mul(M, T(0, 0.0008, t + 0.0002)), 0.03),
  ];
  // front camera, centred in its bezel
  const cam = s.frontCam === "long" ? T(0, H - bz.y / 2, t + 0.0004) : T(-W / 2 + bz.x / 2, H / 2, t + 0.0004);
  parts.push(dot(0.0011, mul(M, cam), 0.14));
  for (const b of s.buttons) {
    const geo = b.edge === "top" ? new BoxGeometry(b.len, 0.0014, 0.0026) : new BoxGeometry(0.0014, b.len, 0.0026);
    const pos = b.edge === "top" ? T(b.at, H + 0.0004, t / 2) : T(-W / 2 - 0.0004, H / 2 + b.at, t / 2);
    parts.push(part(geo, mul(M, pos), 0.85));
  }
  if (back) {
    // rear camera in the top-left corner seen from the FRONT (top-right seen
    // from behind) — best guess, see the spec comments
    const cx = -W / 2 + 0.02;
    const cy = H - 0.02;
    const behind = (x: number, y: number, z: number) => mul(M, T(x, y, z), RY(PI));
    if (s.rear.kind === "bump") {
      const bump = slab(0.026, 0.026, 0.0013, 0.007, 0.0004);
      bump.rotateX(-PI / 2);
      parts.push(part(bump, mul(M, T(cx - 0.002, cy - 0.002, 0)), 0.8));
      // seen from behind: the wide lens upper left of the bump, LiDAR below
      // it, flash and two small sensor dots on the other side (best guess)
      parts.push(dot(0.0047, behind(cx + 0.003, cy + 0.003, -0.0014), 0.05));
      parts.push(dot(0.0024, behind(cx + 0.003, cy + 0.003, -0.0015), 0.18));
      parts.push(dot(0.0036, behind(cx + 0.003, cy - 0.0075, -0.0014), 0.1));
      parts.push(dot(0.0019, behind(cx - 0.0075, cy + 0.004, -0.0014), 0.95));
      parts.push(dot(0.0008, behind(cx - 0.0075, cy - 0.0035, -0.0014), 0.1));
      parts.push(dot(0.0008, behind(cx - 0.0075, cy - 0.0085, -0.0014), 0.1));
    } else {
      const ring = new CylinderGeometry(s.rear.r + 0.0008, s.rear.r + 0.0008, 0.0012, 20);
      ring.rotateX(PI / 2);
      parts.push(part(ring, mul(M, T(cx, cy, -0.0006)), 0.7));
      parts.push(dot(s.rear.r, behind(cx, cy, -0.00125), 0.05));
      parts.push(dot(s.rear.r * 0.5, behind(cx, cy, -0.0013), 0.2));
      if (s.rear.flash) parts.push(dot(0.0017, behind(cx + 0.011, cy, -0.0002), 0.95));
    }
    parts.push(markDisc(0.013 * (W / 0.25), mul(M, T(0, H / 2, -0.0003))));
  }
  return parts;
}

function tabletScreen(s: TabletSpec, M: Matrix4): BufferGeometry {
  const bz = tabletBezel(s);
  const geo = activeScreen(bz.dw, bz.dh, Math.max(0.002, s.r - bz.x), "tablet");
  geo.applyMatrix4(mul(M, T(0, bz.y, s.t + 0.0004)));
  return geo;
}

// A tablet leaning back 20 degrees on a small graphite display stand.
export function tabletGeo(s: TabletSpec): DeviceGeo {
  return cached(`tablet:${s.id}`, () => {
    const M = mul(T(0, 0.02, 0.004), RX(-0.35));
    const STAND = 0.14;
    const sw = Math.min(0.15, s.W * 0.6);
    const top = new Vector3(0, Math.min(0.09, s.H * 0.6), -0.003).applyMatrix4(M);
    const body = mergeGeometries([
      ...tabletParts(s, M, true),
      part(slab(sw, 0.1, 0.005, 0.012, 0.0012), T(0, 0, -0.02), STAND),
      part(new BoxGeometry(sw * 0.73, 0.019, 0.006), T(0, 0.0145, 0.0125), STAND),
      part(strut(new Vector3(0, 0.005, -0.064), top, sw * 0.33, 0.005), null, STAND),
    ])!;
    return { body, screen: tabletScreen(s, M), format: "tablet" };
  });
}

// iPad Pro / Air: the tablet floating on its keyboard's cantilever arm, the
// keyboard on a low graphite wedge (a store display stand, invented).
// iPad (A16): the two-piece Magic Keyboard Folio — a flat keyboard and the
// tablet leaning back on its own kickstand behind it.
// iPad mini has no keyboard: it falls back to the plain stand.
export function tabletKbGeo(s: TabletSpec): DeviceGeo {
  if (!s.keyboard) return tabletGeo(s);
  return cached(`tabletKb:${s.id}`, () => (s.keyboard === "folio" ? folioGeo(s) : cantileverGeo(s)));
}

function cantileverGeo(m: TabletSpec): DeviceGeo {
  const FOLIO = 0.42;
  const Wk = m.W + 0.002;
  const Dk = m.H + 0.012;
  const tk = 0.0065;
  const hf = 0.004;
  const hb = 0.022;
  const th = Math.atan((hb - hf) / Dk);
  const kbM = mul(T(0, hf, Dk / 2), RX(th), T(0, 0, -Dk / 2));
  const deck = new PlaneGeometry(Wk - 0.012, Dk - 0.012);
  deck.rotateX(-PI / 2);
  const armL = 0.1;
  const armM = mul(kbM, T(0, tk - 0.001, -Dk / 2 + 0.004), RX(-0.26));
  const tabM = mul(armM, T(0, armL, 0.0075), RX(-0.09), T(0, -m.H / 2, 0));
  // the wedge, drawn in (z, y) and extruded across x
  const ws = new Shape();
  ws.moveTo(-(Dk / 2 + 0.006), 0);
  ws.lineTo(-(Dk / 2 + 0.006), hf);
  ws.lineTo(Dk / 2 + 0.002, hb + 0.001);
  ws.lineTo(Dk / 2 + 0.002, 0);
  ws.closePath();
  const wedge = new ExtrudeGeometry(ws, { depth: Wk + 0.014, bevelEnabled: false });
  wedge.rotateY(PI / 2);
  wedge.translate(-(Wk + 0.014) / 2, 0, 0);
  const body = mergeGeometries([
    part(wedge, null, 0.1),
    part(slab(Wk, Dk, tk, 0.01, 0.0012), kbM, FOLIO),
    part(deck, mul(kbM, T(0, tk + 0.0004, 0.002)), FOLIO, R_FOLIO),
    part(panel(Wk - 0.004, armL, 0.004, 0.008, 0.0008), armM, FOLIO),
    part(panel(m.W + 0.002, m.H + 0.002, 0.0032, m.r + 0.001, 0.0008), mul(tabM, T(0, -0.001, -0.0032)), FOLIO),
    ...tabletParts(m, tabM, false),
  ])!;
  return { body, screen: tabletScreen(m, tabM), format: "tablet" };
}

function folioGeo(m: TabletSpec): DeviceGeo {
  const FOLIO = 0.62; // a lighter folio than the Pro/Air keyboard (finish an estimate)
  const Wk = m.W + 0.002;
  const Dk = m.H * 0.72; // the folio's keyboard half (proportion an estimate)
  const tk = 0.006;
  const deck = new PlaneGeometry(Wk - 0.012, Dk - 0.01);
  deck.rotateX(-PI / 2);
  const back = -Dk / 2 - 0.012;
  const tabM = mul(T(0, 0.002, back), RX(-0.36)); // leaning back about 20 degrees
  const standTop = new Vector3(0, m.H * 0.55, -0.0035).applyMatrix4(tabM);
  const body = mergeGeometries([
    part(slab(Wk, Dk, tk, 0.009, 0.0012), T(0, 0, 0.01), FOLIO),
    part(deck, T(0, tk + 0.0004, 0.01), FOLIO, R_FOLIO),
    // the back panel the tablet sits in, and its kickstand
    part(panel(m.W + 0.003, m.H + 0.003, 0.003, m.r + 0.001, 0.0008), mul(tabM, T(0, -0.0015, -0.003)), FOLIO),
    part(strut(new Vector3(0, 0.002, back - 0.08), standTop, m.W * 0.9, 0.003), null, FOLIO),
    ...tabletParts(m, tabM, false),
  ])!;
  return { body, screen: tabletScreen(m, tabM), format: "tablet" };
}

// ---------- standalone displays ----------

export interface DisplaySpec {
  id: string;
  name: string; // the real product name (references/product-line.md section 5)
  W: number; // m (sourced)
  Hh: number; // housing height, m (derived: display height + a bezel equal to the side bezel)
  t: number; // housing depth, m (estimate)
  res: readonly [number, number]; // (sourced)
  ppi: number; // (sourced)
  stand: "tilt" | "tiltHeight";
  ventRows: number; // rows of holes across the back (sourced count; their placement is a best guess)
}

// Studio Display (2nd gen, March 2026) and Studio Display XDR (replaced the
// discontinued 32-inch Pro Display XDR; it is a new 27-inch model, NOT a
// rename). Both 27-inch 5120 x 2880 at 218 ppi, the same housing as the
// first-generation Studio Display, 623 mm wide, 478 mm tall in the stand's
// bottom position. The base Studio Display ships with a tilt stand; the XDR
// ships with the tilt-and-height stand ("articulating arm at the top"). The
// Studio Display has five rows of vent holes on the back, the XDR nine rows
// "that nearly stretch across the back". Sources: 9to5mac.com 2026-03-03
// (new-studio-display-vs-studio-display-xdr), macrumors.com buyer's guide,
// apple.com/studio-display-xdr/specs and forums.appleinsider.com XDR review,
// all via search 2026-10-12.
export const STUDIO_DISPLAY: DisplaySpec = {
  id: "studio-display",
  name: "Studio Display",
  W: 0.623,
  Hh: 0.362,
  t: 0.02,
  res: [5120, 2880],
  ppi: 218,
  stand: "tilt",
  ventRows: 5,
};
export const STUDIO_DISPLAY_XDR: DisplaySpec = {
  ...STUDIO_DISPLAY,
  id: "studio-display-xdr",
  name: "Studio Display XDR",
  stand: "tiltHeight",
  ventRows: 9,
};

export const DISPLAY_MODELS: Record<string, DisplaySpec> = Object.fromEntries(
  [STUDIO_DISPLAY, STUDIO_DISPLAY_XDR].map((s) => [s.id, s]),
);

export function displayGeo(s: DisplaySpec): DeviceGeo {
  return cached(`display:${s.id}`, () => {
    const { W, Hh, t } = s;
    const [dw, dh] = displaySize(s.res, s.ppi);
    const bx = (W - dw) / 2;
    const by = (Hh - dh) / 2;
    const M = mul(T(0, 0.116, -0.05), RX(-0.03));
    const parts: BufferGeometry[] = [
      part(panel(W, Hh, t, 0.008, 0.002), M),
      part(screenShape(W - 0.002, Hh - 0.002, 0.007), mul(M, T(0, 0.001, t + 0.0002)), 0.03),
      dot(0.0016, mul(M, T(0, Hh - by / 2, t + 0.0004)), 0.14),
      markDisc(0.022, mul(M, T(0, Hh * 0.55, -0.0003))),
    ];
    // vents: a band of rows across the top of the back (placement a best guess)
    const rowPitch = 0.0045;
    const vh = s.ventRows * rowPitch + 0.002;
    const vent = new PlaneGeometry(W * (s.ventRows > 5 ? 0.9 : 0.62), vh);
    parts.push(part(vent, mul(M, T(0, Hh - 0.03 - vh / 2, -0.0004), RY(PI)), 1, s.ventRows > 5 ? R_VENT9 : R_VENT5));
    parts.push(part(slab(0.2, 0.168, 0.006, 0.02, 0.0015), T(0, 0, -0.03)));
    if (s.stand === "tilt") {
      // one bent plate from the foot's back edge up to the display's back
      const top = new Vector3(0, 0.2, -0.003).applyMatrix4(M);
      parts.push(part(strut(new Vector3(0, 0.006, -0.106), top, 0.16, 0.006), null));
    } else {
      // tilt-and-height: an upright on the foot, a hinge, and a short arm up
      // to the display's back (best guess at the arm's shape: no photo checked)
      const hingeY = 0.17;
      const hz = -0.1;
      parts.push(part(new BoxGeometry(0.14, hingeY, 0.012), T(0, 0.006 + hingeY / 2, hz)));
      const hinge = new CylinderGeometry(0.011, 0.011, 0.15, 16);
      hinge.rotateZ(PI / 2);
      parts.push(part(hinge, T(0, hingeY + 0.006, hz), 0.75));
      const top = new Vector3(0, 0.24, -0.003).applyMatrix4(M);
      parts.push(part(strut(new Vector3(0, hingeY + 0.006, hz), top, 0.12, 0.01), null));
    }
    const body = mergeGeometries(parts)!;
    const screen = activeScreen(dw, dh, 0.002, "monitor");
    screen.applyMatrix4(mul(M, T(0, by, t + 0.0004)));
    return { body, screen, format: "monitor" };
  });
}

// ---------- desktops ----------

// iMac (M4, 24-inch): 547 x 461 mm with the stand, stand 147 mm deep x 130 mm
// wide (support.apple.com/en-us/121556, 121557 via search); housing about
// 11.5 mm thick (widely quoted, not on Apple's page: estimate); 4480 x 2520 at
// 218 ppi (NOT confirmed by a search result this session). White glass bezel
// and a colour-matched chin. Housing height 390 mm is my estimate; the chin is
// what remains under the display and its bezel.
export interface AllInOneSpec {
  id: string;
  name: string;
  kind: "allInOne";
  W: number;
  Hh: number;
  t: number;
  overallH: number;
  standW: number;
  standD: number;
  res: readonly [number, number];
  ppi: number;
}
export const IMAC: AllInOneSpec = {
  id: "imac",
  name: "iMac",
  kind: "allInOne",
  W: 0.547,
  Hh: 0.39,
  t: 0.0115,
  overallH: 0.461,
  standW: 0.13,
  standD: 0.147,
  res: [4480, 2520],
  ppi: 218,
};

// Mac mini (M6): unchanged from M4, 127 x 127 x 50 mm, two USB-C and a
// headphone jack on the front, three Thunderbolt on the back (petapixel.com
// 2026-09-21, tomshardware.com late-2026 review). Mac Studio (M5 Max / Ultra):
// unchanged, 197 x 197 x 95 mm, front ports (petapixel.com M6 mini review
// says both have front ports; Mac Studio's two USB-C + SD card slot is from
// memory of the previous generation: a best guess). Corner radii and the
// base ring are estimates.
export interface BoxSpec {
  id: string;
  name: string;
  kind: "box";
  W: number; // square footprint, m (sourced)
  H: number; // m (sourced)
  r: number; // m (estimate)
  baseH: number; // dark recessed base / vent ring, m (estimate)
  front: Array<{ type: PortType; x: number }>; // x: m from the front face's centre (estimate)
  back: Array<{ type: PortType; x: number }>;
}
export const MAC_MINI: BoxSpec = {
  id: "mac-mini",
  name: "Mac mini",
  kind: "box",
  W: 0.127,
  H: 0.05,
  r: 0.022,
  baseH: 0.004,
  front: [{ type: "usbc", x: -0.034 }, { type: "usbc", x: -0.022 }, { type: "jack", x: 0.026 }],
  back: [{ type: "usbc", x: -0.01 }, { type: "usbc", x: 0.003 }, { type: "usbc", x: 0.016 }, { type: "hdmi", x: 0.035 }],
};
export const MAC_STUDIO: BoxSpec = {
  id: "mac-studio",
  name: "Mac Studio",
  kind: "box",
  W: 0.197,
  H: 0.095,
  r: 0.03,
  baseH: 0.008,
  front: [{ type: "usbc", x: -0.06 }, { type: "usbc", x: -0.045 }, { type: "sd", x: 0.05 }],
  back: [-0.06, -0.045, -0.03, -0.015].map((x) => ({ type: "usbc" as const, x })).concat([{ type: "usbc", x: 0.03 }, { type: "usbc", x: 0.045 }]),
};

export type DesktopSpec = AllInOneSpec | BoxSpec;
export const DESKTOP_MODELS: Record<string, DesktopSpec> = Object.fromEntries(
  [IMAC as DesktopSpec, MAC_MINI, MAC_STUDIO].map((s) => [s.id, s]),
);

export function desktopGeo(s: DesktopSpec): DeviceGeo {
  return s.kind === "box" ? boxGeo(s) : allInOneGeo(s);
}

function allInOneGeo(s: AllInOneSpec): DeviceGeo {
  return cached(`aio:${s.id}`, () => {
    const { W, Hh, t } = s;
    const [, dh] = displaySize(s.res, s.ppi);
    const bezel = FMT.aio.side / FMT.aio.w * W; // the white bezel baked into the aio art
    const upper = dh + 2 * bezel;
    const chin = Hh - upper;
    const lift = s.overallH - Hh; // housing bottom above the desk
    const M = mul(T(0, lift, -0.1), RX(-0.06));
    const top = new Vector3(0, Hh * 0.44, -0.003).applyMatrix4(M);
    const kbDeck = new PlaneGeometry(0.27, 0.106);
    kbDeck.rotateX(-PI / 2);
    const mouse = new SphereGeometry(1, 20, 10);
    mouse.scale(0.03, 0.012, 0.056);
    const body = mergeGeometries([
      part(panel(W, Hh, t, 0.011, 0.0015), M),
      markDisc(0.024, mul(M, T(0, Hh * 0.55, -0.0003))),
      part(slab(s.standW, s.standD, 0.005, 0.012, 0.0012), T(0, 0, -0.1 - s.standD / 2 + 0.055)),
      part(strut(new Vector3(0, 0.005, -0.1 - s.standD + 0.06), top, s.standW * 0.85, 0.005), null),
      part(slab(0.278, 0.114, 0.0065, 0.007, 0.0012), T(0, 0, 0.13)),
      part(kbDeck, T(0, 0.0069, 0.13), 1, R_AIO),
      part(mouse, T(0.22, 0, 0.13)),
    ])!;
    // the aio art includes its white bezel and camera dot: no crop
    const screen = activeScreen(W - 0.002, upper - 0.001, 0.009, "aio", false);
    screen.applyMatrix4(mul(M, T(0, chin, t + 0.0003)));
    return { body, screen, format: "aio" };
  });
}

function boxGeo(s: BoxSpec): DeviceGeo {
  return cached(`box:${s.id}`, () => {
    const { W, H, r, baseH } = s;
    const base = new CylinderGeometry(W * 0.4, W * 0.4, baseH, 40);
    const parts: BufferGeometry[] = [
      part(base, T(0, baseH / 2, 0), 0.12),
      part(slab(W, W, H - baseH, r, 0.003), T(0, baseH, 0)),
      // the mark on top, facing up
      part(new CircleGeometry(W * 0.12, 24), mul(T(0, H + 0.0003, 0), RX(-PI / 2), RZ(PI)), 1, R_MARK),
    ];
    const portY = baseH + (H - baseH) * 0.45;
    for (const [face, list] of [[1, s.front], [-1, s.back]] as const) {
      for (const p of list) {
        const [pw, ph] = PORT_SIZE[p.type];
        const geo = p.type === "jack" ? new CylinderGeometry(ph / 2, ph / 2, 0.0008, 10) : new BoxGeometry(pw, ph, 0.0008);
        if (p.type === "jack") geo.rotateX(PI / 2);
        parts.push(part(geo, T(face * p.x, portY, face * (W / 2 - 0.0002)), 0.05));
      }
    }
    // a status light on the front, right of centre (estimate)
    parts.push(dot(0.0006, T(W * 0.36, portY, W / 2 + 0.0002), 0.9));
    return { body: mergeGeometries(parts)!, screen: null, format: "monitor" };
  });
}

// Every model this module draws, for the spec (SCOPE D37 "every model is different").
export const ALL_COMPUTER_MODEL_IDS = [
  ...Object.keys(LAPTOP_MODELS),
  ...Object.keys(TABLET_MODELS),
  ...Object.keys(DISPLAY_MODELS),
  ...Object.keys(DESKTOP_MODELS),
];
