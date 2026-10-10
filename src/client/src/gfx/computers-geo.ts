// Shared geometry and materials for laptops, tablets, monitors and desktops.
//
// Every device is two meshes: a "body" (all the solid parts merged into one
// geometry, built once per model at module level) and a "screen". The body's
// parts are tinted by vertex colour (hinge, stands, folio darker) and the
// keyboard decks, keyboard and lid mark come from one shared atlas texture,
// so one material per finish colour covers every part. Dimensions are from
// references/products-computers.md.
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

// ---------- the atlas: keyboard decks, keyboards, the mark ----------

const ATLAS = 512;
type Region = readonly [number, number, number, number]; // x, y, w, h in px
const R_PRO: Region = [0, 0, 256, 182];
const R_AIR: Region = [256, 0, 256, 182];
const R_FOLIO: Region = [0, 192, 256, 184];
const R_AIO: Region = [256, 192, 256, 104];
const R_MARK: Region = [256, 304, 64, 64];
const WHITE_UV: [number, number] = [480.5 / ATLAS, 1 - 480.5 / ATLAS];

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

function trackpad(g: G, cx: number, y: number, w: number, h: number) {
  g.fillStyle = "#f4f4f4";
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

export type DeviceGeo = { body: BufferGeometry; screen: BufferGeometry };

// ---------- laptops ----------

type LaptopModel = { W: number; D: number; Hb: number; Hl: number; r: number; deck: Region };
export const LAPTOP_PRO: LaptopModel = { W: 0.3126, D: 0.2212, Hb: 0.01, Hl: 0.0055, r: 0.012, deck: R_PRO };
export const LAPTOP_AIR: LaptopModel = { W: 0.3041, D: 0.215, Hb: 0.0068, Hl: 0.0045, r: 0.011, deck: R_AIR };
const LID_TILT = (15 * PI) / 180; // open 105 degrees

const geoCache = new Map<string, DeviceGeo>();
function cached(key: string, build: () => DeviceGeo): DeviceGeo {
  let g = geoCache.get(key);
  if (!g) {
    g = build();
    geoCache.set(key, g);
  }
  return g;
}

export function laptopGeo(m: LaptopModel): DeviceGeo {
  return cached(`laptop:${m.W}`, () => {
    const { W, D, Hb, Hl, r } = m;
    const deck = new PlaneGeometry(W - 0.014, D - 0.01);
    deck.rotateX(-PI / 2);
    const hinge = new CylinderGeometry(0.0034, 0.0034, W - 0.07, 12);
    hinge.rotateZ(PI / 2);
    const lidM = mul(T(0, Hb, -D / 2 + 0.002), RX(-LID_TILT));
    const body = mergeGeometries([
      part(slab(W, D, Hb, r, 0.0014), null),
      part(deck, T(0, Hb + 0.0004, 0.001), 1, m.deck),
      part(hinge, T(0, Hb + 0.0012, -D / 2 + 0.0045), 0.2),
      part(panel(W, D, Hl, r, 0.0012), lidM),
      markDisc(0.012, mul(lidM, T(0, D * 0.52, -0.0003))),
    ])!;
    const screen = screenShape(W - 0.002, D - 0.002, r - 0.001);
    screen.applyMatrix4(mul(lidM, T(0, 0.001, Hl + 0.0003)));
    return { body, screen };
  });
}

// ---------- tablets ----------

type TabletModel = { W: number; H: number; t: number; r: number };
export const TABLET_11: TabletModel = { W: 0.2497, H: 0.1775, t: 0.0053, r: 0.011 };
export const TABLET_13: TabletModel = { W: 0.2816, H: 0.2155, t: 0.0051, r: 0.012 };

function tabletParts(m: TabletModel, M: Matrix4, back: boolean): BufferGeometry[] {
  const { W, H, t, r } = m;
  const parts = [part(panel(W, H, t, r, 0.0009), M)];
  const btn = (w: number, h: number, x: number, y: number) =>
    part(new BoxGeometry(w, h, 0.0026), mul(M, T(x, y, t / 2)), 0.85);
  parts.push(btn(0.018, 0.0014, W / 2 - 0.04, H + 0.0004));
  parts.push(btn(0.0014, 0.012, W / 2 + 0.0004, H - 0.03));
  parts.push(btn(0.0014, 0.012, W / 2 + 0.0004, H - 0.047));
  if (back) {
    // camera bump in the back corner (top-left seen from behind), dark lenses
    const bump = slab(0.026, 0.026, 0.0013, 0.007, 0.0004);
    bump.rotateX(-PI / 2);
    parts.push(part(bump, mul(M, T(W / 2 - 0.022, H - 0.022, 0)), 0.8));
    parts.push(part(new CircleGeometry(0.0045, 16), mul(M, T(W / 2 - 0.0165, H - 0.0165, -0.0014), RY(PI)), 0.06));
    parts.push(part(new CircleGeometry(0.0045, 16), mul(M, T(W / 2 - 0.0275, H - 0.0275, -0.0014), RY(PI)), 0.06));
    parts.push(markDisc(0.013, mul(M, T(0, H / 2, -0.0003))));
  }
  return parts;
}

function tabletScreen(m: TabletModel, M: Matrix4): BufferGeometry {
  const s = screenShape(m.W - 0.0016, m.H - 0.0016, m.r - 0.0008);
  s.applyMatrix4(mul(M, T(0, 0.0008, m.t + 0.0003)));
  return s;
}

// A tablet leaning back 20 degrees on a small graphite display stand.
export function tabletGeo(m: TabletModel): DeviceGeo {
  return cached(`tablet:${m.W}`, () => {
    const M = mul(T(0, 0.02, 0.004), RX(-0.35));
    const STAND = 0.14;
    const top = new Vector3(0, 0.09, -0.003).applyMatrix4(M);
    const body = mergeGeometries([
      ...tabletParts(m, M, true),
      part(slab(0.15, 0.1, 0.005, 0.012, 0.0012), T(0, 0, -0.02), STAND),
      part(new BoxGeometry(0.11, 0.019, 0.006), T(0, 0.0145, 0.0125), STAND),
      part(strut(new Vector3(0, 0.005, -0.064), top, 0.05, 0.005), null, STAND),
    ])!;
    return { body, screen: tabletScreen(m, M) };
  });
}

// A tablet floating on its keyboard folio's cantilever arm, the keyboard
// sitting on a low graphite wedge (a store display stand).
export function tabletKbGeo(m: TabletModel): DeviceGeo {
  return cached(`tabletKb:${m.W}`, () => {
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
    return { body, screen: tabletScreen(m, tabM) };
  });
}

// ---------- the standalone display ----------

export function monitorGeo(): DeviceGeo {
  return cached("monitor", () => {
    const W = 0.623;
    const Hh = 0.362;
    const t = 0.02;
    const M = mul(T(0, 0.116, -0.05), RX(-0.03));
    const top = new Vector3(0, 0.2, -0.003).applyMatrix4(M);
    const body = mergeGeometries([
      part(panel(W, Hh, t, 0.008, 0.002), M),
      markDisc(0.022, mul(M, T(0, Hh * 0.55, -0.0003))),
      part(slab(0.2, 0.168, 0.006, 0.02, 0.0015), T(0, 0, -0.03)),
      part(strut(new Vector3(0, 0.006, -0.106), top, 0.16, 0.006), null),
    ])!;
    const screen = screenShape(W - 0.002, Hh - 0.002, 0.007);
    screen.applyMatrix4(mul(M, T(0, 0.001, t + 0.0003)));
    return { body, screen };
  });
}

// ---------- the all-in-one desktop (scaled 0.86 to fit its 0.5 m pitch) ----------

export function desktopGeo(): DeviceGeo {
  return cached("desktop", () => {
    const W = 0.47;
    const Hh = 0.331;
    const t = 0.0115;
    const chin = 0.058;
    const M = mul(T(0, 0.065, -0.1), RX(-0.06));
    const top = new Vector3(0, 0.17, -0.003).applyMatrix4(M);
    const kbDeck = new PlaneGeometry(0.27, 0.106);
    kbDeck.rotateX(-PI / 2);
    const mouse = new SphereGeometry(1, 20, 10);
    mouse.scale(0.03, 0.012, 0.056);
    const body = mergeGeometries([
      part(panel(W, Hh, t, 0.011, 0.0015), M),
      markDisc(0.02, mul(M, T(0, Hh * 0.55, -0.0003))),
      part(slab(0.126, 0.115, 0.005, 0.012, 0.0012), T(0, 0, -0.115)),
      part(strut(new Vector3(0, 0.005, -0.168), top, 0.11, 0.005), null),
      part(slab(0.278, 0.114, 0.0065, 0.007, 0.0012), T(0, 0, 0.11)),
      part(kbDeck, T(0, 0.0069, 0.11), 1, R_AIO),
      part(mouse, T(0.2, 0, 0.11)),
    ])!;
    const screen = screenShape(W - 0.002, Hh - chin - 0.001, 0.009);
    screen.applyMatrix4(mul(M, T(0, chin, t + 0.0003)));
    return { body, screen };
  });
}
