import { useLayoutEffect, useRef } from "react";
import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  Color,
  Euler,
  Float32BufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  Object3D,
  Quaternion,
  RepeatWrapping,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { canvasTexture } from "./common.tsx";

// Helpers for furniture.tsx: merged multi-part geometry with vertex colours
// (one draw call for a whole stool or bench frame), planar "wood" UVs so grain
// runs continuously across pieces, generic instancing, and the canvas textures
// (maple grain, brushed metal, felt, cartons, louvred lockers).

// ---------- merged parts ----------

export interface Part {
  geo: BufferGeometry;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
  colour?: string;
  // planar UVs: which world axis the grain (texture v) runs along, and the
  // size in metres one texture repeat covers (u, v)
  grain?: "x" | "y" | "z";
  uvSize?: [number, number];
  uvOffset?: [number, number];
}

const AX = ["x", "y", "z"] as const;

function planarUV(g: BufferGeometry, grain: "x" | "y" | "z", size: [number, number], off: [number, number]): void {
  const p = g.getAttribute("position");
  const n = g.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  const gi = AX.indexOf(grain);
  for (let i = 0; i < p.count; i++) {
    const c = [p.getX(i), p.getY(i), p.getZ(i)];
    const nn = [Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))];
    const dom = nn[0] >= nn[1] && nn[0] >= nn[2] ? 0 : nn[1] >= nn[2] ? 1 : 2;
    const plane = [0, 1, 2].filter((a) => a !== dom);
    let ua: number;
    let va: number;
    if (plane.includes(gi)) {
      va = gi;
      ua = plane.find((a) => a !== gi)!;
    } else {
      // grain points out of this face (end grain): keep it roughly vertical
      ua = plane[0];
      va = plane[1];
    }
    uv[i * 2] = c[ua] / size[0] + off[0];
    uv[i * 2 + 1] = c[va] / size[1] + off[1];
  }
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
}

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpE = new Euler();
const tmpV = new Vector3();
const tmpS = new Vector3();
const tmpC = new Color();

// Bake a list of parts into one geometry with a `color` attribute.
export function mergeParts(parts: Part[]): BufferGeometry {
  const geos = parts.map((pt) => {
    let g = pt.geo.index ? pt.geo.toNonIndexed() : pt.geo.clone();
    tmpE.set(...(pt.rot ?? [0, 0, 0]));
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpV.set(...(pt.pos ?? [0, 0, 0])), tmpQ, tmpS.set(...(pt.scale ?? [1, 1, 1])));
    g.applyMatrix4(tmpM);
    if (pt.grain) planarUV(g, pt.grain, pt.uvSize ?? [0.5, 1.2], pt.uvOffset ?? [0, 0]);
    tmpC.set(pt.colour ?? "#ffffff");
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = tmpC.r;
      col[i * 3 + 1] = tmpC.g;
      col[i * 3 + 2] = tmpC.b;
    }
    g.setAttribute("color", new Float32BufferAttribute(col, 3));
    // keep only the attributes every part has
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k);
    if (!g.getAttribute("uv")) g.setAttribute("uv", new Float32BufferAttribute(new Float32Array(n * 2), 2));
    g = g.clone();
    return g;
  });
  const out = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  return out;
}

// A unit box shared by everything (scaled per part).
export const UNIT_BOX = new BoxGeometry(1, 1, 1);

export const box = (
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  colour?: string,
  extra: Partial<Part> = {},
): Part => ({ geo: UNIT_BOX, pos: [x, y, z], scale: [w, h, d], colour, ...extra });

// ---------- instancing ----------

export interface Inst {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  colour?: string;
}

export function Instances({
  geo,
  items,
  material,
}: {
  geo: BufferGeometry;
  items: Inst[];
  material: Material;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    const c = new Color();
    items.forEach((it, i) => {
      o.position.set(it.x, it.y, it.z);
      o.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
      o.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.set(it.colour ?? "#ffffff"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, material, items.length]} frustumCulled={false} />;
}

// ---------- textures (cached, created once) ----------

const cache = new Map<string, CanvasTexture>();
function cached(key: string, make: () => CanvasTexture): CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

// deterministic random
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Pale maple: long straight grain running along the texture's v, seamless in
// both directions (integer wave counts), with soft figure bands and pores.
// Drawn near-white so vertex colours can tint it (lighter top, darker legs).
export function mapleTexture(): CanvasTexture {
  return cached("maple", () => {
    const W = 256;
    const H = 512;
    const t = canvasTexture(W, H, (g) => {
      const r = rng(7);
      g.fillStyle = "#f4e6cc";
      g.fillRect(0, 0, W, H);
      // broad figure bands
      for (let i = 0; i < 14; i++) {
        const x = r() * W;
        const w = 8 + r() * 30;
        const a = 0.03 + r() * 0.05;
        for (const ox of [-W, 0, W]) {
          const grd = g.createLinearGradient(x + ox - w, 0, x + ox + w, 0);
          grd.addColorStop(0, "rgba(190,140,80,0)");
          grd.addColorStop(0.5, `rgba(190,140,80,${a})`);
          grd.addColorStop(1, "rgba(190,140,80,0)");
          g.fillStyle = grd;
          g.fillRect(x + ox - w, 0, 2 * w, H);
        }
      }
      // grain lines
      for (let i = 0; i < 110; i++) {
        const x0 = r() * W;
        const k1 = 1 + Math.floor(r() * 3);
        const k2 = 3 + Math.floor(r() * 5);
        const a1 = 1 + r() * 4;
        const a2 = r() * 1.2;
        const p1 = r() * 6.28;
        const p2 = r() * 6.28;
        g.strokeStyle = `rgba(${150 + r() * 30},${100 + r() * 25},${55 + r() * 20},${0.06 + r() * 0.16})`;
        g.lineWidth = 0.4 + r() * 1.4;
        for (const ox of [-W, 0, W]) {
          g.beginPath();
          for (let y = 0; y <= H; y += 4) {
            const t2 = (y / H) * Math.PI * 2;
            const x = x0 + ox + a1 * Math.sin(k1 * t2 + p1) + a2 * Math.sin(k2 * t2 + p2);
            if (y === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
      }
      // pores: short dark dashes along the grain
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(120,80,40,${0.05 + r() * 0.1})`;
        g.fillRect(r() * W, r() * H, 0.8, 2 + r() * 4);
      }
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 4;
    return t;
  });
}

// Brushed metal: fine streaks along u.
export function brushedTexture(): CanvasTexture {
  return cached("brushed", () => {
    const t = canvasTexture(256, 64, (g) => {
      const r = rng(11);
      g.fillStyle = "#d8dbde";
      g.fillRect(0, 0, 256, 64);
      for (let i = 0; i < 260; i++) {
        const y = r() * 64;
        const v = Math.floor(170 + r() * 80);
        g.strokeStyle = `rgba(${v},${v + 2},${v + 5},${0.25 + r() * 0.35})`;
        g.lineWidth = 0.5 + r() * 0.8;
        g.beginPath();
        const x = r() * 256;
        g.moveTo(x - 200, y);
        g.lineTo(x + 200, y + (r() - 0.5));
        g.stroke();
      }
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    return t;
  });
}

// Felt / fabric: soft noise.
export function feltTexture(): CanvasTexture {
  return cached("felt", () => {
    const t = canvasTexture(64, 64, (g) => {
      const r = rng(5);
      g.fillStyle = "#8a8a8a";
      g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 1400; i++) {
        const v = Math.floor(100 + r() * 70);
        g.fillStyle = `rgba(${v},${v},${v},0.5)`;
        g.fillRect(r() * 64, r() * 64, 1, 1);
      }
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(4, 4);
    return t;
  });
}

// A carton face: tape down the middle and a shipping label, near white so the
// instance colour tints it kraft or white.
export function cartonTexture(): CanvasTexture {
  return cached("carton", () =>
    canvasTexture(128, 128, (g) => {
      const r = rng(3);
      g.fillStyle = "#f2f2f2";
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 300; i++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.04})`;
        g.fillRect(r() * 128, r() * 128, 2, 2);
      }
      // edge darkening (reads the box's edges at a distance)
      g.strokeStyle = "rgba(0,0,0,0.18)";
      g.lineWidth = 4;
      g.strokeRect(0, 0, 128, 128);
      // tape
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.fillRect(54, 0, 20, 128);
      g.fillStyle = "rgba(0,0,0,0.06)";
      g.fillRect(54, 0, 1, 128);
      g.fillRect(73, 0, 1, 128);
      // label
      g.fillStyle = "#ffffff";
      g.fillRect(12, 80, 34, 26);
      g.fillStyle = "#333";
      for (let k = 0; k < 4; k++) g.fillRect(15, 84 + k * 5, 18 + (k % 2) * 8, 2);
      for (let k = 0; k < 10; k++) g.fillRect(16 + k * 2.6, 102, 1.4, 3);
    }),
  );
}

// A wood-grain-free "panel" texture for laminate tops and painted steel.
export function speckleTexture(): CanvasTexture {
  return cached("speckle", () => {
    const t = canvasTexture(128, 128, (g) => {
      const r = rng(9);
      g.fillStyle = "#f0f0f0";
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 1200; i++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
        g.fillRect(r() * 128, r() * 128, 1, 1);
      }
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    return t;
  });
}

// A soft vertical shadow fading downward (under a shelf, on the wall).
export function fadeTexture(): CanvasTexture {
  return cached("fade", () =>
    canvasTexture(8, 64, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 64);
      grd.addColorStop(0, "rgba(15,18,24,0.45)");
      grd.addColorStop(0.35, "rgba(15,18,24,0.16)");
      grd.addColorStop(1, "rgba(15,18,24,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 8, 64);
    }),
  );
}

// A watch face: dark glass, a ring of ticks, two hands, a small dial.
export function watchFaceTexture(): CanvasTexture {
  return cached("watchface", () =>
    canvasTexture(128, 128, (g) => {
      g.fillStyle = "#050608";
      g.fillRect(0, 0, 128, 128);
      g.translate(64, 64);
      for (let i = 0; i < 12; i++) {
        g.save();
        g.rotate((i / 12) * Math.PI * 2);
        g.fillStyle = i % 3 === 0 ? "#f5f5f5" : "#8a8f96";
        g.fillRect(-1.5, -50, 3, i % 3 === 0 ? 12 : 7);
        g.restore();
      }
      g.strokeStyle = "#e9eef2";
      g.lineCap = "round";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(22, -18);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-8, -40);
      g.stroke();
      g.strokeStyle = "#ff8a2a";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, 8);
      g.lineTo(28, 30);
      g.stroke();
      g.strokeStyle = "#4fd18b";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(0, 24, 9, -Math.PI / 2, Math.PI * 0.9);
      g.stroke();
    }),
  );
}

// Lockers: 7 columns x 2 tiers of doors with louvres, number plates, handles.
export function lockerTexture(cols: number, tiers: number): CanvasTexture {
  return cached(`locker${cols}x${tiers}`, () =>
    canvasTexture(512, 256, (g) => {
      const W = 512;
      const H = 256;
      g.fillStyle = "#e9ecef";
      g.fillRect(0, 0, W, H);
      const cw = W / cols;
      const th = H / tiers;
      let n = 1;
      for (let t = 0; t < tiers; t++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cw;
          const y = t * th;
          // door gap
          g.fillStyle = "#4a5058";
          g.fillRect(x, y, cw, th);
          g.fillStyle = "#e7eaee";
          g.fillRect(x + 1.5, y + 1.5, cw - 3, th - 3);
          // louvres
          g.fillStyle = "#59606a";
          for (let k = 0; k < 5; k++) g.fillRect(x + cw * 0.22, y + 10 + k * 5, cw * 0.56, 2.2);
          // number plate
          g.fillStyle = "#c9ced3";
          g.fillRect(x + cw * 0.32, y + 42, cw * 0.36, 13);
          g.fillStyle = "#20262e";
          g.font = "bold 10px system-ui, sans-serif";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(String(n++).padStart(2, "0"), x + cw / 2, y + 49);
          // lock and handle slot
          g.fillStyle = "#2e343b";
          g.fillRect(x + cw * 0.7, y + th * 0.48, 4, 16);
          g.beginPath();
          g.arc(x + cw * 0.72, y + th * 0.42, 3, 0, Math.PI * 2);
          g.fill();
          // lower vents
          g.fillStyle = "#59606a";
          for (let k = 0; k < 4; k++) g.fillRect(x + cw * 0.22, y + th - 26 + k * 5, cw * 0.56, 2.2);
        }
      }
    }),
  );
}

// A monitor screen with a generic diagnostics layout.
export function diagScreenTexture(): CanvasTexture {
  return cached("diag", () =>
    canvasTexture(256, 160, (g) => {
      g.fillStyle = "#0f1a26";
      g.fillRect(0, 0, 256, 160);
      g.fillStyle = "#1d2c3d";
      g.fillRect(0, 0, 256, 18);
      g.fillStyle = "#6fb7ff";
      g.fillRect(8, 6, 40, 6);
      const r = rng(21);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = "#2a3d52";
        g.fillRect(10, 28 + i * 13, 110, 8);
        g.fillStyle = i % 4 === 3 ? "#e9a23b" : "#4fd18b";
        g.fillRect(10, 28 + i * 13, 30 + r() * 80, 8);
      }
      g.strokeStyle = "#6fb7ff";
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x < 110; x += 4) g.lineTo(136 + x, 100 - 30 * Math.abs(Math.sin(x / 13)) - r() * 10);
      g.stroke();
      g.strokeStyle = "#2a3d52";
      g.strokeRect(134, 30, 112, 100);
    }),
  );
}
