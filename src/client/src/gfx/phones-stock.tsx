import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, type InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { BAY_COUNT, BAY_W, BENCHES, bayCentre } from "../../../shared/world.ts";
import { BAY_SHELVES, SIDE_WALL } from "../../../shared/plan.ts";
import { BENCH_HALF, BENCH_X, FACE_X, type Cuboid } from "./common.tsx";
import { BOX_DESIGNS, DESIGN, boxArt, phoneScreen, type BoxDesign } from "./phones-art.ts";

// The packaged stock on the bay shelves: real-sized retail boxes (estimates,
// references/products-phones.md) with original art, laid out per bay to match
// its sign. One InstancedMesh per design, so the whole wall of boxes costs one
// draw call per design (16).

// The labels the shell puts over the bays (BAY_LABELS in shell.tsx), by side
// and bay. Kept in step by hand: shell.tsx is not ours to import from here
// without a cycle.
const BAY_KIND: Record<-1 | 1, string[]> = {
  [-1]: ["AUDIO", "CHARGING", "CASES"],
  [1]: ["WATCH BANDS", "KEYBOARDS", "SMART HOME"],
};

// Shelf geometry (from furniture.tsx bayFrames and plan.ts): plate 0.025
// thick, 0.24 deep from FACE_X - 0.02 inward, so its front edge is 0.26 from
// the wall face and the back panel's face is 0.04 from it.
const PLATE_T = 0.025;
const BACK = 0.045; // nearest a box may stand to the wall face
const FRONT = 0.25; // where a box's front stands, from the wall face
const HERO_FRONT = 0.258; // a hero item set forward to the plate's edge
const CLEAR = BAY_SHELVES.step - PLATE_T - 0.01; // under the shelf above
// usable half width along the shelf. The piers stand proud of the bay, so from
// any angle the outermost facings vanish behind them: keep clear of that band
// rather than draw boxes nobody can see (Ritesh, 2026-10-19)
const HALF_RUN = BAY_W / 2 - 0.12;
const GAP = 0.008;

interface Item {
  id: string;
  n?: number; // facings side by side
  stack?: number; // boxes per facing, one on another
  tints?: string[]; // per-facing colours for tinted designs
  hero?: boolean;
  sold?: number[]; // facings left empty (sold), by index
  lean?: boolean; // one more, leaning on the last facing
}

const CASE_RUNS = [
  ["#1f2937", "#1f2937", "#334155", "#334155", "#64748b", "#64748b", "#94a3b8"],
  ["#be123c", "#be123c", "#f43f5e", "#f43f5e", "#fda4af", "#fda4af", "#fecdd3"],
  ["#1d4ed8", "#1d4ed8", "#3b82f6", "#3b82f6", "#93c5fd", "#93c5fd", "#bfdbfe"],
  ["#047857", "#047857", "#10b981", "#10b981", "#a7f3d0", "#a7f3d0", "#d1fae5"],
  ["#7c3aed", "#7c3aed", "#a78bfa", "#a78bfa", "#ddd6fe", "#ddd6fe", "#ede9fe"],
  ["#c2410c", "#c2410c", "#fb923c", "#fb923c", "#fde68a", "#fde68a", "#fef3c7"],
];
const BAND_RUNS = [
  ["#111827", "#111827", "#374151", "#374151", "#6b7280", "#9ca3af", "#d1d5db", "#f3f4f6", "#f3f4f6", "#e5e7eb", "#cbd5e1", "#94a3b8", "#64748b"],
  ["#7f1d1d", "#b91c1c", "#b91c1c", "#ef4444", "#f87171", "#fca5a5", "#fecaca", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c"],
  ["#14532d", "#166534", "#15803d", "#22c55e", "#86efac", "#bbf7d0", "#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0f766e", "#134e4a"],
  ["#1e3a8a", "#1e40af", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5", "#4338ca", "#312e81"],
  ["#831843", "#9d174d", "#db2777", "#ec4899", "#f472b6", "#f9a8d4", "#fbcfe8", "#e9d5ff", "#d8b4fe", "#c084fc", "#a855f7", "#9333ea", "#6b21a8"],
  ["#78350f", "#92400e", "#b45309", "#d97706", "#f59e0b", "#fbbf24", "#fde68a", "#e7e5e4", "#d6d3d1", "#a8a29e", "#78716c", "#57534e", "#44403c"],
];
const SPEAKER_TINTS = ["#ffffff", "#fde68a", "#fdba74", "#93c5fd", "#4b5563"];
const BANK_TINTS = ["#ffffff", "#cbd5e1", "#fecaca", "#bbf7d0", "#c7d2fe", "#fde68a"];

// What each shelf carries, bottom shelf first. Rows that do not fit are cut
// at the bay's edge by the packer, never squeezed.
const SHELVES: Record<string, Item[][]> = {
  AUDIO: [
    [{ id: "cans", n: 3 }, { id: "dot", n: 1, tints: ["#4b5563"] }],
    [{ id: "dot", n: 6, tints: SPEAKER_TINTS, sold: [4] }],
    [{ id: "cans", n: 1, hero: true }, { id: "buds", n: 5, sold: [3] }],
    [{ id: "budsLite", n: 7, stack: 2, sold: [5] }],
    [{ id: "buds", n: 4, stack: 2 }, { id: "budsLite", n: 3, lean: true }],
    [{ id: "cans", n: 2 }, { id: "budsLite", n: 3, stack: 2 }],
  ],
  CHARGING: [
    [{ id: "bank", n: 8, tints: BANK_TINTS }],
    [{ id: "puck", n: 7, stack: 2, sold: [2] }],
    [{ id: "puck", n: 1, hero: true }, { id: "cable", n: 7, sold: [4] }],
    [{ id: "plug", n: 10, stack: 2, sold: [7] }],
    [{ id: "cable", n: 4, stack: 2 }, { id: "plug", n: 4, lean: true }],
    [{ id: "bank", n: 4, tints: BANK_TINTS.slice(2) }, { id: "cable", n: 4 }],
  ],
  CASES: [0, 1, 2, 3, 4, 5].map((k) => [
    { id: "case", n: 7, tints: CASE_RUNS[k], sold: k === 2 ? [3] : k === 4 ? [5] : [], hero: k === 2 },
  ]),
  "WATCH BANDS": [0, 1, 2, 3, 4, 5].map((k) => [
    { id: "band", n: 13, tints: BAND_RUNS[k], sold: k === 1 ? [6] : k === 3 ? [2, 9] : [] },
  ]),
  KEYBOARDS: [
    [{ id: "keys", n: 2, stack: 2 }, { id: "pad", n: 1 }],
    [{ id: "pad", n: 4, sold: [2] }],
    [{ id: "keys", n: 1, hero: true }, { id: "pad", n: 1 }, { id: "keys", n: 1 }],
    [{ id: "keys", n: 2, stack: 2 }, { id: "pad", n: 1, lean: true }],
    [{ id: "pad", n: 3 }, { id: "keys", n: 1 }],
    [{ id: "keys", n: 2 }, { id: "pad", n: 1 }],
  ],
  "SMART HOME": [
    [{ id: "home", n: 5 }, { id: "bulb", n: 1 }],
    [{ id: "cam", n: 6, sold: [2] }, { id: "tags", n: 2 }],
    [{ id: "home", n: 1, hero: true }, { id: "cam", n: 2 }, { id: "tags", n: 3 }],
    [{ id: "tags", n: 6, sold: [1] }],
    [{ id: "bulb", n: 9, sold: [6] }, { id: "tags", n: 1, lean: true }],
    [{ id: "home", n: 3 }, { id: "bulb", n: 4 }],
  ],
};

// One placed box, in world space.
export interface PlacedBox {
  design: string;
  pos: Vector3; // centre
  quat: Quaternion;
  colour: string;
  upright: Cuboid; // its axis-aligned bounds when standing (for the plain fallback)
}

const LEAN = 0.2; // radians

function place(side: -1 | 1, bay: number): PlacedBox[] {
  const out: PlacedBox[] = [];
  const zc = bayCentre(bay);
  const rows = SHELVES[BAY_KIND[side][bay]];
  // box faces out of the wall: local +z (its front) to world -side * x
  const face = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), side === -1 ? Math.PI / 2 : -Math.PI / 2);
  // along-shelf coordinate u runs with world z; local +x maps to world -z on
  // the -x wall and +z on the +x wall
  rows.forEach((row, k) => {
    const y0 = BAY_SHELVES.first + k * BAY_SHELVES.step + PLATE_T / 2;
    // measure the row, cut what does not fit, centre it
    type Slot = { d: BoxDesign; it: Item; j: number; lean: boolean };
    const slots: Slot[] = [];
    let width = 0;
    for (const it of row) {
      const d = DESIGN[it.id];
      const n = (it.n ?? 1) + (it.lean ? 1 : 0);
      for (let j = 0; j < n; j++) {
        const lean = !!it.lean && j === n - 1;
        const need = (lean ? d.w * Math.cos(LEAN) + d.h * Math.sin(LEAN) : d.w) + (slots.length ? GAP : 0);
        if (width + need > HALF_RUN * 2) break;
        width += need;
        slots.push({ d, it, j, lean });
      }
    }
    let u = zc - width / 2;
    slots.forEach((s, idx) => {
      if (idx) u += GAP;
      const d = s.d;
      const stack = Math.max(1, Math.min(s.it.stack ?? 1, Math.floor(CLEAR / d.h)));
      const tints = s.it.tints;
      const colour = d.tint && tints ? tints[s.j % tints.length] : "#ffffff";
      const front = s.it.hero ? HERO_FRONT : FRONT;
      const sold = s.it.sold?.includes(s.j) ?? false;
      if (s.lean) {
        // pivots on its bottom corner nearest the row, top resting toward the
        // previous facing, which it just touches
        const a = LEAN;
        const pivot = u + d.h * Math.sin(a);
        const cu = pivot + (d.w / 2) * Math.cos(a) - (d.h / 2) * Math.sin(a);
        const cy = y0 + (d.w / 2) * Math.sin(a) + (d.h / 2) * Math.cos(a);
        const dist = front - d.d / 2;
        const q = face.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), side * a));
        out.push({
          design: d.id,
          pos: new Vector3(side * (FACE_X - dist), cy, cu),
          quat: q,
          colour,
          upright: { x: side * (FACE_X - dist), y: y0 + d.h / 2, z: pivot + d.w / 2, w: d.d, h: d.h, d: d.w, colour: d.side },
        });
        u += d.w * Math.cos(a) + d.h * Math.sin(a);
        return;
      }
      const cu = u + d.w / 2;
      // rows behind the facing, back to the panel (only seen from an angle,
      // but a shelf with one box and air behind it reads as hollow)
      // one row only: the ones behind it were never visible and cost draws
      const depthRows = 1;
      for (let r = sold ? 1 : 0; r < (sold ? Math.max(1, depthRows) : depthRows); r++) {
        const dist = front - d.d / 2 - r * d.d;
        if (dist - d.d / 2 < BACK - 1e-6) break;
        for (let t = 0; t < (r === 0 ? stack : Math.min(stack, 1 + (s.j % 2))); t++) {
          const cy = y0 + d.h / 2 + t * d.h;
          out.push({
            design: d.id,
            pos: new Vector3(side * (FACE_X - dist), cy, cu),
            quat: face,
            colour,
            upright: { x: side * (FACE_X - dist), y: cy, z: cu, w: d.d, h: d.h, d: d.w, colour: d.side },
          });
        }
      }
      u += d.w;
    });
  });
  return out;
}

let placedCache: PlacedBox[] | null = null;
export function placedStock(): PlacedBox[] {
  if (!placedCache) {
    placedCache = [];
    for (const side of [-1, 1] as const) for (let i = 0; i < BAY_COUNT; i++) placedCache.push(...place(side, i));
  }
  return placedCache;
}

// A box geometry whose faces map to the design's atlas: front art on +z,
// side panel on +-x and the back, a plain strip on top and bottom.
function boxGeometry(d: BoxDesign): BoxGeometry {
  const art = boxArt(d);
  const g = new BoxGeometry(d.w, d.h, d.d);
  const uv = g.getAttribute("uv");
  // face order: +x, -x, +y, -y, +z, -z; four vertices each
  const regions = [art.side, art.side, art.top, art.top, art.front, art.side];
  for (let i = 0; i < uv.count; i++) {
    const [u0, u1] = regions[Math.floor(i / 4)];
    uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
  }
  uv.needsUpdate = true;
  return g;
}

function DesignBoxes({ design, boxes }: { design: BoxDesign; boxes: PlacedBox[] }) {
  const ref = useRef<InstancedMesh>(null);
  const geom = useMemo(() => boxGeometry(design), [design]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const c = new Color();
    const one = new Vector3(1, 1, 1);
    boxes.forEach((b, i) => {
      mesh.setMatrixAt(i, m.compose(b.pos, b.quat, one));
      mesh.setColorAt(i, c.set(b.colour));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [boxes]);
  return (
    <instancedMesh ref={ref} args={[geom, undefined, boxes.length]} frustumCulled={false}>
      <meshStandardMaterial map={boxArt(design).tex} roughness={0.42} metalness={0} envMapIntensity={0.6} />
    </instancedMesh>
  );
}

// ---- phones laid flat along the benches ----

export interface FlatPhone {
  x: number;
  z: number;
  colour: string;
  down: boolean; // face down: shows the back and its camera
  screen: number; // which wallpaper
}

const FLAT_FINISH = ["#2b2f36", "#c9ced3", "#e8d9c4", "#3a4a63", "#a7b7a4", "#d8b4a0"];

export function flatPhones(): FlatPhone[] {
  const out: FlatPhone[] = [];
  for (const side of [-1, 1]) {
    const benchX = side * BENCH_X;
    const kept = SIDE_WALL[side === 1 ? "+x" : "-x"].filter((f) => f.kind === "desktops" || f.kind === "headphones");
    const blocked = (z: number): boolean =>
      kept.some((f) => (f.kind === "desktops" || f.kind === "headphones") && z > f.z0 - 0.3 && z < f.z0 + (f.count - 1) * f.pitch + 0.3);
    let i = 0;
    for (let z = BENCHES[0].z - BENCH_HALF + 0.3; z <= BENCHES[0].z + BENCH_HALF - 0.3; z += 0.22) {
      if (blocked(z)) continue;
      for (const dx of [-0.17, 0.17]) {
        out.push({ x: benchX + dx, z, colour: FLAT_FINISH[(i * 5 + (dx > 0 ? 3 : 0)) % FLAT_FINISH.length], down: i % 4 === 3 && dx > 0, screen: i % 2 });
      }
      i++;
    }
  }
  return out;
}

// A phone lying on its back: body slab with rounded corners on the long axis
// along x (pointing at the wall), the camera plateau on its back. Real size
// 0.150 x 0.0715 x 0.008.
const PH_L = 0.15;
const PH_W = 0.0715;
const PH_T = 0.008;

function FlatPhones() {
  const phones = useMemo(() => flatPhones(), []);
  const body = useRef<InstancedMesh>(null);
  const bump = useRef<InstancedMesh>(null);
  const scr = [useRef<InstancedMesh>(null), useRef<InstancedMesh>(null)];
  const groups = useMemo(() => [phones.filter((p) => !p.down && p.screen === 0), phones.filter((p) => !p.down && p.screen === 1)], [phones]);
  const downs = useMemo(() => phones.filter((p) => p.down), [phones]);
  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    const one = new Vector3(1, 1, 1);
    const c = new Color();
    const b = body.current;
    if (b) {
      phones.forEach((p, i) => {
        b.setMatrixAt(i, m.compose(new Vector3(p.x, 0.95 + PH_T / 2 + (p.down ? 0.0012 : 0), p.z), q, one));
        b.setColorAt(i, c.set(p.colour));
      });
      b.instanceMatrix.needsUpdate = true;
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
    }
    const k = bump.current;
    if (k) {
      // camera plateau: on the up face of the face-down phones, at the end
      // toward the wall
      downs.forEach((p, i) => {
        const end = Math.sign(p.x);
        k.setMatrixAt(i, m.compose(new Vector3(p.x + end * (PH_L / 2 - 0.026), 0.95 + PH_T + 0.0012 + 0.0012, p.z - 0.012), q, one));
        k.setColorAt(i, c.set(p.colour).multiplyScalar(0.85));
      });
      k.instanceMatrix.needsUpdate = true;
      if (k.instanceColor) k.instanceColor.needsUpdate = true;
    }
    scr.forEach((r, gi) => {
      const s = r.current;
      if (!s) return;
      const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
      groups[gi].forEach((p, i) => {
        // portrait texture: its top toward the wall, upright for someone in the aisle
        const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.x > 0 ? -Math.PI / 2 : Math.PI / 2);
        s.setMatrixAt(i, m.compose(new Vector3(p.x, 0.95 + PH_T + 0.0004, p.z), turn.multiply(flat), one));
      });
      s.instanceMatrix.needsUpdate = true;
    });
  }, [phones, groups, downs]);
  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, phones.length]} frustumCulled={false}>
        <boxGeometry args={[PH_L, PH_T, PH_W]} />
        <meshStandardMaterial roughness={0.3} metalness={0.55} />
      </instancedMesh>
      <instancedMesh ref={bump} args={[undefined, undefined, Math.max(1, downs.length)]} frustumCulled={false}>
        <boxGeometry args={[0.038, 0.0024, 0.038]} />
        <meshStandardMaterial roughness={0.25} metalness={0.4} />
      </instancedMesh>
      {groups.map((gp, gi) => (
        <instancedMesh key={gi} ref={scr[gi]} args={[undefined, undefined, Math.max(1, gp.length)]} frustumCulled={false}>
          <planeGeometry args={[PH_W - 0.004, PH_L - 0.004]} />
          <meshBasicMaterial map={phoneScreen(gi + 1, gi === 0)} toneMapped={false} />
        </instancedMesh>
      ))}
    </group>
  );
}

// Everything this module draws on the walls: the boxed stock in the bays and
// the phones laid flat on the benches. World coordinates; mount once.
export function BayStock() {
  const byDesign = useMemo(() => {
    const all = placedStock();
    return BOX_DESIGNS.map((d) => ({ d, boxes: all.filter((b) => b.design === d.id) })).filter((x) => x.boxes.length > 0);
  }, []);
  return (
    <group>
      {byDesign.map(({ d, boxes }) => (
        <DesignBoxes key={d.id} design={d} boxes={boxes} />
      ))}
      <FlatPhones />
    </group>
  );
}
