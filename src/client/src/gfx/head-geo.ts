import { BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry } from "three";
import type { BeardStyle, HairStyle } from "../../../shared/appearance.ts";

// A low-poly head: one displaced icosphere, flat shaded, placed by the
// figure-drawing landmarks (Loomis: hairline, brow, nose base and chin in
// thirds; eyes about half way down the head; lips a little above the middle of
// nose to chin; ears between brow and nose). It is kept soft and a little
// round on purpose: a long egg, a hard jaw and a heavy brow read as menacing.
// Hair is painted onto the head by vertex colour (and thickened a touch), so a
// whole head is one mesh. Metres; the face looks along -z; y is up.

const HALF_W = 0.081;
const HALF_H = 0.108;
const HALF_D = 0.094;

const g = (x: number, y: number, cx: number, cy: number, sx: number, sy: number): number =>
  Math.exp(-(((x - cx) ** 2) / (2 * sx * sx) + ((y - cy) ** 2) / (2 * sy * sy)));
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface HeadShape {
  width: number;
  height: number; // long or short face
  square: number; // 0 round, 1 boxy: flattens the sides and the jaw
  forehead: number; // wider (+) or narrower (-) across the forehead
  jaw: number;
  brow: number;
  nose: number;
  cheek: number;
  chin: number;
}
export const TYPICAL_HEAD: HeadShape = { width: 1, height: 1, square: 0, forehead: 0, jaw: 1, brow: 1, nose: 1, cheek: 1, chin: 1 };

// Where the hair stops, as a height on the unit sphere, at the front, the side
// (above the ears) and the back. null is no hair.
const HAIR: Record<HairStyle, { front: number; side: number; back: number } | null> = {
  bald: null,
  buzz: { front: 0.66, side: 0.12, back: 0.0 },
  short: { front: 0.6, side: 0.1, back: -0.25 },
  side: { front: 0.52, side: 0.0, back: -0.3 },
  long: { front: 0.6, side: -0.35, back: -0.85 },
  bun: { front: 0.6, side: 0.08, back: -0.2 },
  curly: { front: 0.5, side: -0.05, back: -0.3 },
};

// How far a point is inside the hair, positive inside, on the unit sphere.
function hairMargin(nx: number, ny: number, nz: number, style: HairStyle): number {
  const h = HAIR[style];
  if (!h) return -1;
  const f = smooth(0.0, 0.75, -nz);
  const b = smooth(0.0, 0.6, nz);
  const front = h.front - 0.45 * nx * nx; // the hairline sweeps down at the temples
  const edge = (h.side * (1 - f) + front * f) * (1 - b) + h.back * b;
  return ny - edge;
}

// How far a point is inside the facial hair, positive inside, on the unit
// sphere (face at -z). The mouth sits at about ny -0.58, the nose tip at -0.3.
function beardMargin(nx: number, ny: number, nz: number, style: BeardStyle): number {
  if (style === "none" || nz > 0.3) return -1;
  const ax = Math.abs(nx);
  switch (style) {
    case "moustache":
      return Math.min(0.42 - ax, ny + 0.57, -0.4 - ny);
    case "goatee":
      return Math.min(0.3 - ax, -0.64 - ny, 0.2 - nz > 0 ? 1 : -1);
    case "full": {
      const jaw = -0.27 - ny;
      const sideburn = Math.min(ax - 0.8, 0.12 - ny);
      return Math.max(jaw, sideburn);
    }
    default: // stubble: the lower face, the same area as a full beard
      return Math.max(-0.27 - ny, Math.min(ax - 0.8, 0.12 - ny));
  }
}

function features(nx: number, ny: number, nz: number, s: HeadShape, plain: boolean): number {
  const front = smooth(0.1, 0.6, -nz);
  if (front === 0) return 0;
  if (plain) {
    // toy face: no sockets, brow ridge or lips; just a pointed nose, a hint of
    // cheek and chin, so the eyes and mouth read as marks on a clean surface
    const nose = 0.03 * s.nose * g(nx, ny, 0, -0.26, 0.09, 0.11);
    const cheeks = 0.005 * s.cheek * (g(nx, ny, -0.52, -0.22, 0.24, 0.22) + g(nx, ny, 0.52, -0.22, 0.24, 0.22));
    const chin = 0.006 * s.chin * g(nx, ny, 0, -0.88, 0.2, 0.1);
    return front * (nose + cheeks + chin);
  }
  const brow = 0.008 * s.brow * g(nx, ny, 0, 0.18, 0.5, 0.08);
  const sockets = -0.006 * (g(nx, ny, -0.36, 0.0, 0.17, 0.12) + g(nx, ny, 0.36, 0.0, 0.17, 0.12));
  const bridge = 0.008 * s.nose * g(nx, ny, 0, -0.08, 0.07, 0.22);
  const tip = 0.019 * s.nose * g(nx, ny, 0, -0.3, 0.11, 0.1);
  const alae = 0.007 * s.nose * (g(nx, ny, -0.16, -0.33, 0.07, 0.07) + g(nx, ny, 0.16, -0.33, 0.07, 0.07));
  const cheeks = 0.013 * s.cheek * (g(nx, ny, -0.52, -0.22, 0.24, 0.22) + g(nx, ny, 0.52, -0.22, 0.24, 0.22));
  const lips = 0.005 * g(nx, ny, 0, -0.6, 0.26, 0.07);
  const chin = 0.009 * s.chin * g(nx, ny, 0, -0.88, 0.2, 0.1);
  return front * (brow + sockets + bridge + tip + alae + cheeks + lips + chin);
}

export function buildHead(
  shape: HeadShape,
  hair: HairStyle,
  hairHex: string,
  skinHex: string,
  beard: BeardStyle = "none",
  detail = 4,
  plain = false,
): BufferGeometry {
  const geo = new IcosahedronGeometry(1, detail);
  geo.deleteAttribute("uv");
  geo.deleteAttribute("normal");
  const pos = geo.getAttribute("position");
  const out = new Float32Array(pos.count * 3);
  const col = new Float32Array(pos.count * 3);
  const skin = new Color(skinHex);
  const hairC = new Color(hairHex);
  const beardC = hairC.clone().multiplyScalar(0.9);
  const stubbleC = skin.clone().lerp(hairC, 0.42);
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i);
    const ny = pos.getY(i);
    const nz = pos.getZ(i);
    // a softer taper than a real jaw, so the chin is round
    const taper = 1 - 0.17 * shape.jaw * Math.pow(Math.min(1, Math.max(0, -ny / 0.95)), 1.3);
    // hair has thickness; curly has bumps in it
    const inside = smooth(-0.02, 0.1, hairMargin(nx, ny, nz, hair));
    const bump = hair === "curly" ? 0.006 * (0.5 + 0.5 * Math.sin(nx * 15 + 1) * Math.sin(ny * 13 + 2) * Math.sin(nz * 14 + 3)) : 0;
    const beardIn = beard === "none" || beard === "stubble" ? 0 : smooth(-0.04, 0.12, beardMargin(nx, ny, nz, beard));
    const off = features(nx, ny, nz, shape, plain) + inside * (0.007 + bump) + beardIn * 0.0055;
    // squareness pushes the sides and the jaw out towards a box, mostly low
    // down; forehead width scales the upper half
    const wq = shape.square * (0.3 + 0.7 * smooth(0.3, -0.6, ny));
    const boxy = (v: number): number => Math.sign(v) * Math.pow(Math.abs(v), 0.5);
    const px = nx * (1 - wq) + boxy(nx) * wq;
    const pz = nz * (1 - wq) + boxy(nz) * wq;
    const fx = 1 + shape.forehead * smooth(0.0, 0.7, ny);
    out[i * 3] = px * HALF_W * shape.width * taper * fx + nx * off;
    out[i * 3 + 1] = ny * HALF_H * shape.height + ny * off;
    out[i * 3 + 2] = pz * HALF_D + nz * off;
  }
  // one colour per triangle, by where its centre is, so the facets stay crisp
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    const c =
      hairMargin(cx, cy, cz, hair) > 0
        ? hairC
        : beard !== "none" && beardMargin(cx, cy, cz, beard) > 0
          ? beard === "stubble"
            ? stubbleC
            : beardC
          : skin;
    for (let k = 0; k < 3; k++) {
      col[(t + k) * 3] = c.r;
      col[(t + k) * 3 + 1] = c.g;
      col[(t + k) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute("position", new Float32BufferAttribute(out, 3));
  geo.setAttribute("color", new Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}
