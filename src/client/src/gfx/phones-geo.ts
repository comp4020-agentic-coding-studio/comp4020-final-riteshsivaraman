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
