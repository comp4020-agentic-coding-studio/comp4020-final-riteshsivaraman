import { BufferGeometry, Float32BufferAttribute, IcosahedronGeometry } from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// A head as one displaced sphere, placed by the figure-drawing landmarks
// (Loomis: hairline, brow, nose base and chin in equal thirds; eyes about half
// way down the whole head; lips just above the middle of nose to chin; ears
// between brow and nose). Metres, face looks along -z, y up, origin at the
// middle of the head. Pure, so the two looks below differ only in how finely
// the sphere is cut and how it is shaded.

const HALF_W = 0.078; // a head is about 0.155 m wide,
const HALF_H = 0.115; // 0.23 m high
const HALF_D = 0.095; // and 0.19 m deep

const g = (x: number, y: number, cx: number, cy: number, sx: number, sy: number): number =>
  Math.exp(-(((x - cx) ** 2) / (2 * sx * sx) + ((y - cy) ** 2) / (2 * sy * sy)));
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface HeadShape {
  brow: number; // strength of the brow ridge, 1 is typical
  nose: number; // nose size
  cheek: number;
  chin: number;
  jaw: number; // how much the lower face tapers, 1 is typical
}
export const TYPICAL_HEAD: HeadShape = { brow: 1, nose: 1, cheek: 1, chin: 1, jaw: 1 };

// Outward displacement, in metres, at a point on the unit sphere.
function features(nx: number, ny: number, nz: number, s: HeadShape): number {
  const front = smooth(0.1, 0.6, -nz);
  if (front === 0) return 0;
  const brow = 0.016 * s.brow * g(nx, ny, 0, 0.16, 0.55, 0.07);
  const sockets = -0.011 * (g(nx, ny, -0.36, 0.03, 0.17, 0.12) + g(nx, ny, 0.36, 0.03, 0.17, 0.12));
  const bridge = 0.014 * s.nose * g(nx, ny, 0, -0.05, 0.07, 0.25);
  const tip = 0.03 * s.nose * g(nx, ny, 0, -0.3, 0.1, 0.1);
  const alae = 0.012 * s.nose * (g(nx, ny, -0.17, -0.34, 0.07, 0.07) + g(nx, ny, 0.17, -0.34, 0.07, 0.07));
  const cheeks = 0.01 * s.cheek * (g(nx, ny, -0.55, -0.2, 0.2, 0.2) + g(nx, ny, 0.55, -0.2, 0.2, 0.2));
  const lips = 0.007 * g(nx, ny, 0, -0.62, 0.28, 0.07);
  const chin = 0.014 * s.chin * g(nx, ny, 0, -0.9, 0.18, 0.1);
  return front * (brow + sockets + bridge + tip + alae + cheeks + lips + chin);
}

// `detail` is the icosphere subdivision: 20 * (detail + 1)^2 triangles. Faceted
// keeps one normal per triangle; smooth shares vertices and blends them.
export function buildHead(detail: number, smoothShading: boolean, shape: HeadShape = TYPICAL_HEAD): BufferGeometry {
  let geo: BufferGeometry = new IcosahedronGeometry(1, detail);
  geo.deleteAttribute("uv");
  geo.deleteAttribute("normal");
  if (smoothShading) geo = mergeVertices(geo);
  const pos = geo.getAttribute("position");
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i);
    const ny = pos.getY(i);
    const nz = pos.getZ(i);
    // the lower face tapers towards the chin
    const taper = 1 - 0.28 * s_jaw(ny, shape.jaw);
    const off = features(nx, ny, nz, shape);
    out[i * 3] = nx * HALF_W * taper + nx * off;
    out[i * 3 + 1] = ny * HALF_H + ny * off;
    out[i * 3 + 2] = nz * HALF_D + nz * off;
  }
  geo.setAttribute("position", new Float32BufferAttribute(out, 3));
  geo.computeVertexNormals();
  return geo;
}

const s_jaw = (ny: number, jaw: number): number => jaw * Math.pow(Math.min(1, Math.max(0, -ny / 0.95)), 1.3);
