import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import {
  CylinderGeometry,
  DoubleSide,
  type BufferGeometry,
  type Group,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CEILING } from "../../../shared/protocol.ts";
import {
  BACK_FURNITURE,
  BACK_SHELVES,
  BACK_SHELF_ROW_Z,
  BACK_SHELF_UNIT_X,
  BAY_COUNT,
  BAY_W,
  COUNTER,
  PARTITIONS,
  PIER_W,
  SERVICE_DESKS,
  BAR_STOOLS,
  bayCentre,
  type BackThing,
  type Box,
  type Table as TableSpec,
  TABLES,
} from "../../../shared/world.ts";
import { BAY_LEDGES, BAY_SHELVES, LEDGE_DEPTH, STOOL_SEAT_H } from "../../../shared/plan.ts";
import { BAY_LEDGE_MODELS, TABLE_ASSIGNMENTS } from "../../../shared/assignments.ts";
import { DEVICE_SLOTS, DEVICE_SLOT_BY_ID } from "../../../shared/slots.ts";
import { net } from "../net.ts";
import { DEVICE_COLOURS, BOX_COLOURS, FACE_X, BlobShadow, Sign, blobTexture, type Cuboid, type Kind } from "./common.tsx";
import { Device } from "./Device.tsx";
import {
  type Inst,
  Instances,
  type Part,
  UNIT_BOX,
  box,
  brushedTexture,
  cartonTexture,
  diagScreenTexture,
  fadeTexture,
  feltTexture,
  hashId,
  lockerTexture,
  mapleTexture,
  mergeParts,
  rng,
  speckleTexture,
  watchFaceTexture,
} from "./furniture-kit.tsx";

// Furniture, procedural only. Dimensions not fixed by shared/world.ts or
// plan.ts come from references/products-furniture.md (researched, for Ritesh
// to check). Most pieces are baked into one merged geometry per object with
// vertex colours, so a table is one draw call and all 13 bar stools are one.

// ---------- shared materials (made once, on first use in the browser) ----------

interface Mats {
  wood: MeshStandardMaterial; // maple grain, tinted by vertex colour
  paint: MeshStandardMaterial; // painted steel, laminate, fabric
  metal: MeshStandardMaterial; // brushed steel and aluminium
  felt: MeshStandardMaterial;
  glow: MeshBasicMaterial; // LED strips, lamp heads
  glass: MeshStandardMaterial;
  band: MeshStandardMaterial;
  watchCase: MeshStandardMaterial;
  watchFace: MeshStandardMaterial;
  carton: MeshStandardMaterial;
  screen: MeshBasicMaterial;
  fade: MeshBasicMaterial;
  blob: MeshBasicMaterial;
  wrap: MeshStandardMaterial;
  locker: MeshStandardMaterial;
}
let MATS: Mats | null = null;
function mats(): Mats {
  if (MATS) return MATS;
  MATS = {
    wood: new MeshStandardMaterial({ map: mapleTexture(), vertexColors: true, roughness: 0.48, metalness: 0, side: DoubleSide }),
    paint: new MeshStandardMaterial({ map: speckleTexture(), vertexColors: true, roughness: 0.55, metalness: 0.15 }),
    metal: new MeshStandardMaterial({ map: brushedTexture(), vertexColors: true, roughness: 0.32, metalness: 0.75 }),
    felt: new MeshStandardMaterial({ map: feltTexture(), vertexColors: true, roughness: 1, metalness: 0 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    glass: new MeshStandardMaterial({ color: "#eef6f8", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    band: new MeshStandardMaterial({ roughness: 0.65, metalness: 0, side: DoubleSide }),
    watchCase: new MeshStandardMaterial({ roughness: 0.28, metalness: 0.7 }),
    watchFace: new MeshStandardMaterial({ map: watchFaceTexture(), emissiveMap: watchFaceTexture(), emissive: "#ffffff", emissiveIntensity: 0.55, roughness: 0.12, metalness: 0 }),
    carton: new MeshStandardMaterial({ map: cartonTexture(), roughness: 0.85, metalness: 0 }),
    screen: new MeshBasicMaterial({ map: diagScreenTexture(), toneMapped: false }),
    fade: new MeshBasicMaterial({ map: fadeTexture(), transparent: true, depthWrite: false }),
    blob: new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
    wrap: new MeshStandardMaterial({ color: "#f2f6f8", transparent: true, opacity: 0.28, roughness: 0.12, metalness: 0, depthWrite: false }),
    locker: new MeshStandardMaterial({ map: lockerTexture(7, 2), roughness: 0.5, metalness: 0.2 }),
  };
  return MATS;
}

// tints over the maple texture (vertex colours multiply it)
const MAPLE_TOP = "#f2e7d3";
const MAPLE_EDGE = "#ffffff"; // the lighter chamfer
const MAPLE_LEG = "#e6d5bb";
const MAPLE_DARK = "#6a5946"; // seams and shadow gaps
const FLAT: Partial<Part> = { grain: "y", uvSize: [1000, 1000] }; // samples one flat spot of a texture

// A rotated square strip along an edge reads as a small lighter chamfer.
function chamfer(len: number, axis: "x" | "z", x: number, y: number, z: number, s = 0.008, colour = MAPLE_EDGE): Part {
  return axis === "z"
    ? { geo: UNIT_BOX, pos: [x, y, z], scale: [s, s, len], rot: [0, 0, Math.PI / 4], colour, grain: "z", uvSize: [0.6, 1.6] }
    : { geo: UNIT_BOX, pos: [x, y, z], scale: [len, s, s], rot: [Math.PI / 4, 0, 0], colour, grain: "x", uvSize: [0.6, 1.6] };
}

const groundBlob = (() => {
  let g: BufferGeometry | null = null;
  return () => {
    if (!g) {
      g = new PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
    }
    return g;
  };
})();

// ---------- tables ----------

const TOP_T = 0.085; // top thickness (photo, 80 to 100 mm)
const LEG = 0.09; // square leg section
const LEG_IN = 0.03; // legs set in from the top's edge
const APRON_H = 0.07;
const APRON_IN = 0.045; // apron set back from the top's edge
const APRON_T = 0.025;
// watch bed (a sunken, glass-covered, LED-lit tray in the middle of the top)
const BED_W = 0.36; // across x
const BED_D = 0.74; // along z
const BED_DEPTH = 0.06;
const RIM = 0.006;
const RIM_H = 0.004;

function isWatchBed(t: TableSpec): boolean {
  return !t.service && t.x === 0 && (t.products as readonly string[]).includes("watch");
}

function tableGeometry(t: TableSpec, bed: boolean): BufferGeometry {
  const h = t.h;
  const hsh = hashId(t.id);
  const off: [number, number] = [(hsh % 97) / 97, ((hsh >> 8) % 89) / 89];
  const top = t.service ? "#ecdfc8" : MAPLE_TOP;
  const wood = (w: number, hh: number, d: number, x: number, y: number, z: number, colour: string, grain: "x" | "y" | "z"): Part =>
    box(w, hh, d, t.x + x, y, t.z + z, colour, { grain, uvSize: [0.6, 1.6], uvOffset: off });
  const parts: Part[] = [];
  const yTop = h - TOP_T / 2;
  if (bed) {
    // the top as a frame round an honest opening
    const sw = (t.w - BED_W) / 2;
    const ed = (t.d - BED_D) / 2;
    parts.push(wood(sw, TOP_T, t.d, -(t.w + BED_W) / 4, yTop, 0, top, "z"));
    parts.push(wood(sw, TOP_T, t.d, (t.w + BED_W) / 4, yTop, 0, top, "z"));
    parts.push(wood(BED_W, TOP_T, ed, 0, yTop, -(t.d + BED_D) / 4, top, "z"));
    parts.push(wood(BED_W, TOP_T, ed, 0, yTop, (t.d + BED_D) / 4, top, "z"));
  } else {
    parts.push(wood(t.w, TOP_T, t.d, 0, yTop, 0, top, "z"));
  }
  // lighter chamfer on the four top edges
  const c = 0.0028;
  for (const s of [-1, 1]) {
    parts.push({ ...chamfer(t.d, "z", t.x + s * (t.w / 2 - c), h - c, t.z), uvOffset: off });
    parts.push({ ...chamfer(t.w, "x", t.x, h - c, t.z + s * (t.d / 2 - c)), uvOffset: off });
  }
  // apron, between the legs, set back under the top
  const legC = (n: number) => n / 2 - LEG_IN - LEG / 2;
  const ay = h - TOP_T - APRON_H / 2;
  for (const s of [-1, 1]) {
    parts.push(wood(APRON_T, APRON_H, 2 * legC(t.d) - LEG, s * (t.w / 2 - APRON_IN - APRON_T / 2), ay, 0, MAPLE_LEG, "z"));
    parts.push(wood(2 * legC(t.w) - LEG, APRON_H, APRON_T, 0, ay, s * (t.d / 2 - APRON_IN - APRON_T / 2), MAPLE_LEG, "x"));
  }
  // heavy square legs with a hairline seam under the top and a dark glide
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = sx * legC(t.w);
      const lz = sz * legC(t.d);
      parts.push(wood(LEG, h - TOP_T, LEG, lx, (h - TOP_T) / 2, lz, MAPLE_LEG, "y"));
      parts.push(box(LEG + 0.003, 0.003, LEG + 0.003, t.x + lx, h - TOP_T - 0.0015, t.z + lz, MAPLE_DARK, FLAT));
      parts.push(box(LEG - 0.012, 0.012, LEG - 0.012, t.x + lx, 0.006, t.z + lz, "#3a3a3a", FLAT));
    }
  }
  return mergeParts(parts);
}

// The watches lying in the bed: case, band looped over a felt pillow, screen.
const WATCH_CASES = ["#c9ced3", "#2b2f36", "#e8d9c4", "#d9c3a5", "#9aa1a8", "#3a3f47"];
const WATCH_BANDS = ["#ece6da", "#1f2328", "#b8434a", "#3f5f8a", "#7d9a7a", "#e2b79a"];
const WATCH_SPOTS: Array<[number, number]> = [-0.085, 0.085].flatMap((x) => [-0.22, 0, 0.22].map((z) => [x, z] as [number, number]));
let watchGeo: { band: BufferGeometry; caseG: BufferGeometry; face: BufferGeometry } | null = null;
function watchGeometry() {
  if (watchGeo) return watchGeo;
  const band = new CylinderGeometry(0.019, 0.019, 0.022, 24, 1, true);
  band.rotateZ(Math.PI / 2);
  const caseG = new RoundedBoxGeometry(0.036, 0.0097, 0.042, 2, 0.0045);
  const face = new PlaneGeometry(0.031, 0.037);
  face.rotateX(-Math.PI / 2);
  watchGeo = { band, caseG, face };
  return watchGeo;
}

function WatchBed({ t }: { t: TableSpec }) {
  const m = mats();
  const { felt, rim, led, bands, cases, faces } = useMemo(() => {
    const h = t.h;
    const floor = h - BED_DEPTH;
    const X = t.x;
    const Z = t.z;
    const feltParts: Part[] = [
      box(BED_W, 0.01, BED_D, X, floor - 0.005, Z, "#4a4e56"),
      ...[-1, 1].flatMap((s) => [
        box(0.004, BED_DEPTH, BED_D, X + s * (BED_W / 2 - 0.002), h - BED_DEPTH / 2, Z, "#3e4249"),
        box(BED_W, BED_DEPTH, 0.004, X, h - BED_DEPTH / 2, Z + s * (BED_D / 2 - 0.002), "#3e4249"),
      ]),
      // a pillow under each watch
      ...WATCH_SPOTS.map(([x, z]) => ({
        geo: new CylinderGeometry(0.017, 0.017, 0.075, 16),
        pos: [X + x, floor + 0.019, Z + z] as [number, number, number],
        rot: [0, 0, Math.PI / 2] as [number, number, number],
        colour: "#c9ccd2",
      })),
    ];
    const rimParts: Part[] = [-1, 1].flatMap((s) => [
      box(RIM, RIM_H, BED_D + 2 * RIM, X + s * (BED_W / 2 + RIM / 2), h + RIM_H / 2, Z, "#d4d8dc"),
      box(BED_W + 2 * RIM, RIM_H, RIM, X, h + RIM_H / 2, Z + s * (BED_D / 2 + RIM / 2), "#d4d8dc"),
    ]);
    const ledParts: Part[] = [-1, 1].map((s) => box(0.003, 0.003, BED_D - 0.02, X + s * (BED_W / 2 - 0.0055), h - 0.004, Z, "#fff7ea"));
    const bands: Inst[] = WATCH_SPOTS.map(([x, z], i) => ({ x: X + x, y: floor + 0.019, z: Z + z, colour: WATCH_BANDS[(i + (t.z > -2 ? 3 : 0)) % 6] }));
    const cases: Inst[] = WATCH_SPOTS.map(([x, z], i) => ({ x: X + x, y: floor + 0.043, z: Z + z, colour: WATCH_CASES[(i * 5 + (t.z > -2 ? 1 : 0)) % 6] }));
    const faces: Inst[] = WATCH_SPOTS.map(([x, z]) => ({ x: X + x, y: floor + 0.043 + 0.0052, z: Z + z }));
    return { felt: mergeParts(feltParts), rim: mergeParts(rimParts), led: mergeParts(ledParts), bands, cases, faces };
  }, [t]);
  const g = watchGeometry();
  return (
    <group>
      <mesh geometry={felt} material={m.felt} />
      <mesh geometry={rim} material={m.metal} />
      <mesh geometry={led} material={m.glow} />
      <Instances geo={g.band} items={bands} material={m.band} />
      <Instances geo={g.caseG} items={cases} material={m.watchCase} />
      <Instances geo={g.face} items={faces} material={m.watchFace} />
      {/* the glass lid, flush with the rim */}
      <mesh position={[t.x, t.h + RIM_H, t.z]} rotation={[-Math.PI / 2, 0, 0]} material={m.glass} renderOrder={2}>
        <planeGeometry args={[BED_W, BED_D]} />
      </mesh>
    </group>
  );
}

// A product table: a thick maple top with a lighter chamfered edge, an apron
// and four heavy legs set in from the corners. Products stand in a row along
// each long side, facing out (Ritesh, 2026-10-11); the ends are bare. On the
// centre column's watch tables, a sunken glass-covered bed of watches sits in
// the middle. A service table is the same, square, without products.
// Dev-only look check: `?pilotPhone=<id>` overrides every phone-kind table
// slot with one model, to see it at real scale among real furniture
// regardless of the real assignment below.
const PILOT_PHONE_MODEL = new URLSearchParams(location.search).get("pilotPhone") ?? undefined;

const colourFor = (i: number, tableZ: number): string => DEVICE_COLOURS[(((i + Math.round(tableZ * 3) + 6) % DEVICE_COLOURS.length) + DEVICE_COLOURS.length) % DEVICE_COLOURS.length];

// What a slot's device is, for drawing a second copy of it (the one lifted up for
// the person inspecting it).
export function slotDevice(slotId: string): { kind: Kind; colour: string; model?: string } | null {
  const it = DEVICE_SLOT_BY_ID.get(slotId);
  const table = it ? TABLES.find((t) => t.id === it.tableId) : undefined;
  if (!it || !table) return null;
  const i = DEVICE_SLOTS.filter((s) => s.tableId === it.tableId).findIndex((s) => s.id === it.id);
  return { kind: it.kind as Kind, colour: colourFor(i, table.z), model: PILOT_PHONE_MODEL ?? TABLE_ASSIGNMENTS[it.tableId]?.[it.side] };
}

// A device on its table. Whoever is inspecting it holds it up to their face
// (their own copy floats in front of them), so it is gone from the table for
// them, and hovers a little above it for everyone else watching.
function SlotDevice({ slotId, children }: { slotId: string; children: ReactNode }) {
  const g = useRef<Group>(null);
  useFrame((_, dt) => {
    const el = g.current;
    if (!el) return;
    const mine = net.myInspectSlot === slotId;
    el.visible = !mine;
    const lift = !mine && net.inspections.has(slotId) ? 0.12 : 0;
    el.position.y += (lift - el.position.y) * (1 - Math.exp(-8 * Math.min(dt, 0.05)));
  });
  return <group ref={g}>{children}</group>;
}

export function Table({ box: t }: { box: TableSpec }) {
  const m = mats();
  const bed = isWatchBed(t);
  const geo = useMemo(() => tableGeometry(t, bed), [t, bed]);
  const assigned = TABLE_ASSIGNMENTS[t.id];
  // positions come from shared/slots.ts (D28's stable slot id), not computed
  // here, so the server's inspect range-check always agrees with what is drawn
  const items = DEVICE_SLOTS.filter((s) => s.tableId === t.id);
  return (
    <group>
      <group position={[t.x, 0, t.z]}>
        <BlobShadow w={t.w + 0.9} d={t.d + 0.9} />
      </group>
      <mesh geometry={geo} material={m.wood} />
      {bed && <WatchBed t={t} />}
      {items.map((it, i) => (
        <SlotDevice key={it.id} slotId={it.id}>
          <Device kind={it.kind as Kind} x={it.x} y={t.h} z={it.z} rotY={it.rotY} colour={colourFor(i, t.z)} model={PILOT_PHONE_MODEL ?? assigned?.[it.side]} />
        </SlotDevice>
      ))}
    </group>
  );
}

export const BAR_TOP = 0.06; // thickness of the bar top

export const BAR_OVERHANG = 0.3; // how far the top stands out in front of its base

// ---------- wall bench and bay ledges ----------

// A cantilevered maple slab out of the wall: a lighter top skin, a chamfered
// front edge, a hidden fixing (a dark shadow gap at the wall) and a soft
// shadow on the wall below it.
function slabParts(x0: number, x1: number, z: number, d: number, top: number, thick: number, side: -1 | 1): Part[] {
  const w = Math.abs(x1 - x0);
  const cx = (x0 + x1) / 2;
  const front = side === 1 ? Math.min(x0, x1) : Math.max(x0, x1);
  return [
    box(w, thick - 0.015, d, cx, top - 0.015 - (thick - 0.015) / 2, z, "#e2d0b2", { grain: "z", uvSize: [0.6, 1.6] }),
    box(w, 0.015, d, cx, top - 0.0075, z, MAPLE_TOP, { grain: "z", uvSize: [0.6, 1.6], uvOffset: [0.31, 0.2] }),
    chamfer(d, "z", front + side * 0.0028, top - 0.0028, z),
    chamfer(d, "z", front + side * 0.0028, top - thick + 0.0028, z, 0.008, "#d8c4a4"),
    // the shadow gap where the slab meets the wall
    box(0.012, 0.004, d, side * (FACE_X - 0.026), top + 0.002, z, MAPLE_DARK, FLAT),
  ];
}

function wallShadow(z: number, d: number, top: number, side: -1 | 1, hgt = 0.5): Part {
  return {
    geo: new PlaneGeometry(1, 1),
    pos: [side * (FACE_X - 0.023), top - hgt / 2, z],
    rot: [0, side === 1 ? -Math.PI / 2 : Math.PI / 2, 0],
    scale: [d, hgt, 1],
  };
}

export function WallBench({ box: b, side }: { box: Box; side: -1 | 1 }) {
  const m = mats();
  const { slab, shade } = useMemo(() => {
    // the collision box stops short of the wall; draw the slab out to it
    const inner = b.x - side * (b.w / 2);
    const wall = side * (FACE_X - 0.02);
    return {
      slab: mergeParts(slabParts(inner, wall, b.z, b.d, b.h, 0.12, side)),
      shade: mergeParts([wallShadow(b.z, b.d, b.h - 0.12, side, 0.55)]),
    };
  }, [b, side]);
  return (
    <group>
      <mesh geometry={slab} material={m.wood} />
      <mesh geometry={shade} material={m.fade} />
    </group>
  );
}

// A short ledge at bench height in front of part of each bay, carrying one
// product (BAY_LEDGES in plan.ts says which half and what).
export function BayLedges() {
  const m = mats();
  const ledges = useMemo(
    () =>
      ([1, -1] as const).flatMap((side) =>
        BAY_LEDGES[side === 1 ? "+x" : "-x"].map((l) => {
          const c = bayCentre(l.bay);
          const z = l.half === "front" ? c - BAY_W / 4 : c + BAY_W / 4;
          return { side, z, x: side * (FACE_X - LEDGE_DEPTH / 2), kind: l.kind, key: `${side}:${l.bay}` };
        }),
      ),
    [],
  );
  const { slab, shade } = useMemo(
    () => ({
      slab: mergeParts(ledges.flatMap((l) => slabParts(l.side * (FACE_X - LEDGE_DEPTH), l.side * (FACE_X - 0.02), l.z, BAY_W / 2, 0.95, 0.1, l.side))),
      shade: mergeParts(ledges.map((l) => wallShadow(l.z, BAY_W / 2, 0.85, l.side, 0.35))),
    }),
    [ledges],
  );
  return (
    <group>
      <mesh geometry={slab} material={m.wood} />
      <mesh geometry={shade} material={m.fade} />
      {ledges.map((l) => (
        <Device
          key={l.key}
          kind={l.kind}
          x={l.x}
          y={0.95}
          z={l.z}
          rotY={l.side === 1 ? -Math.PI / 2 : Math.PI / 2}
          colour="#c9ced3"
          model={BAY_LEDGE_MODELS[l.side === 1 ? "+x" : "-x"][l.kind]}
        />
      ))}
    </group>
  );
}

// ---------- stools ----------

// splayed square leg from (rTop, yTop) to (rBot, 0) at angle phi round y
function splayLeg(phi: number, rTop: number, rBot: number, yTop: number, s: number, colour: string): Part {
  const tilt = Math.atan2(rBot - rTop, yTop);
  const len = Math.hypot(rBot - rTop, yTop);
  const r = (rTop + rBot) / 2;
  return {
    geo: UNIT_BOX,
    pos: [r * Math.cos(phi), yTop / 2, -r * Math.sin(phi)],
    rot: [0, phi, tilt],
    scale: [s, len, s],
    colour,
    grain: "y",
    uvSize: [0.3, 0.9],
  };
}

// A low round stool for the service tables: a maple seat with a leather pad,
// four splayed square legs and a steel foot ring. Seat top about 0.65.
let tableStoolGeo: BufferGeometry | null = null;
function tableStoolGeometry(): BufferGeometry {
  if (tableStoolGeo) return tableStoolGeo;
  const legs = [0, 1, 2, 3].map((k) => splayLeg(Math.PI / 4 + (k * Math.PI) / 2, 0.11, 0.16, 0.6, 0.032, MAPLE_LEG));
  const ring = new TorusGeometry(0.14, 0.007, 8, 40);
  ring.rotateX(Math.PI / 2);
  tableStoolGeo = mergeParts([
    ...legs,
    { geo: new CylinderGeometry(0.17, 0.165, 0.035, 32), pos: [0, 0.6175, 0], colour: MAPLE_TOP, grain: "x", uvSize: [0.6, 1.6] },
    { geo: new CylinderGeometry(0.152, 0.158, 0.025, 32), pos: [0, 0.647, 0], colour: "#6e4a32", ...FLAT },
    { geo: ring, pos: [0, 0.25, 0], colour: "#8a8f95", ...FLAT },
  ]);
  return tableStoolGeo;
}

export function TableStool({ x, z }: { x: number; z: number }) {
  const m = mats();
  return (
    <group position={[x, 0, z]}>
      <BlobShadow w={0.6} d={0.6} />
      <mesh geometry={tableStoolGeometry()} material={m.wood} />
    </group>
  );
}

// A wooden bar stool with a curved back (Ritesh's photo): a round seat at
// STOOL_SEAT_H, four splayed square legs, a wooden foot ring, two back posts
// and a curved back rail. The sitter faces +z, toward the bar.
let barStoolGeo: BufferGeometry | null = null;
function barStoolGeometry(): BufferGeometry {
  if (barStoolGeo) return barStoolGeo;
  const seat = STOOL_SEAT_H;
  const legTop = seat - 0.04;
  const legs = [0, 1, 2, 3].map((k) => splayLeg(Math.PI / 4 + (k * Math.PI) / 2, 0.13, 0.2, legTop, 0.036, MAPLE_LEG));
  const ringY = 0.28;
  const ringR = 0.2 - 0.07 * (ringY / legTop) - 0.004;
  const ring = new TorusGeometry(ringR, 0.011, 8, 40);
  ring.rotateX(Math.PI / 2);
  const back = new CylinderGeometry(0.19, 0.19, 0.085, 24, 1, true, Math.PI - 0.95, 1.9);
  const backIn = new CylinderGeometry(0.175, 0.175, 0.085, 24, 1, true, Math.PI - 0.95, 1.9);
  const postH = 0.36;
  barStoolGeo = mergeParts([
    ...legs,
    { geo: ring, pos: [0, ringY, 0], colour: MAPLE_LEG, grain: "x", uvSize: [0.3, 0.9] },
    { geo: new CylinderGeometry(0.2, 0.19, 0.04, 32), pos: [0, seat - 0.02, 0], colour: MAPLE_TOP, grain: "x", uvSize: [0.6, 1.6] },
    chamferRing(0.198, seat - 0.002),
    // back posts, leaning back a little
    ...[-1, 1].map((s): Part => ({
      geo: UNIT_BOX,
      pos: [s * 0.11, seat + postH / 2 - 0.01, -0.15],
      rot: [-0.12, 0, 0],
      scale: [0.03, postH, 0.026],
      colour: MAPLE_LEG,
      grain: "y",
      uvSize: [0.3, 0.9],
    })),
    { geo: back, pos: [0, seat + 0.3, 0.028], colour: MAPLE_TOP, grain: "x", uvSize: [0.6, 1.6] },
    { geo: backIn, pos: [0, seat + 0.3, 0.028], colour: MAPLE_LEG, grain: "x", uvSize: [0.6, 1.6] },
  ]);
  return barStoolGeo;
}

function chamferRing(r: number, y: number): Part {
  const g = new TorusGeometry(r, 0.004, 4, 40);
  g.rotateX(Math.PI / 2);
  return { geo: g, pos: [0, y, 0], colour: MAPLE_EDGE, grain: "x", uvSize: [0.6, 1.6] };
}

export function Stools() {
  const m = mats();
  const items = useMemo(() => BAR_STOOLS.map((s) => ({ x: s.x, y: 0, z: s.z })), []);
  const shadows = useMemo(() => BAR_STOOLS.map((s) => ({ x: s.x, y: 0.006, z: s.z, sx: 0.75, sz: 0.75 })), []);
  return (
    <group>
      <Instances geo={groundBlob()} items={shadows} material={m.blob} />
      <Instances geo={barStoolGeometry()} items={items} material={m.wood} />
    </group>
  );
}

// ---------- the service bar ----------

// A base set back BAR_OVERHANG from a top that overhangs it, so a stool tucks
// under the edge and knees go beneath, as on a real bar. Lighter maple top
// with a deeper front lip, vertical-grain base panels with seams, a dark
// recessed toe kick, and a steel foot rail. Then the partitions and stools.
export function ServiceBar() {
  const m = mats();
  const { wood, metal } = useMemo(() => {
    const C = COUNTER;
    const front = C.z - C.d / 2;
    const baseFront = front + BAR_OVERHANG;
    const baseD = C.d - BAR_OVERHANG;
    const baseW = C.w - 0.1;
    const kick = 0.1;
    const bodyH = C.h - BAR_TOP - kick;
    const parts: Part[] = [
      box(baseW, bodyH, baseD, C.x, kick + bodyH / 2, baseFront + baseD / 2, MAPLE_LEG, { grain: "y", uvSize: [0.6, 1.6] }),
      box(baseW - 0.06, kick, baseD - 0.06, C.x, kick / 2, baseFront + baseD / 2 + 0.03, "#3b3631", FLAT),
      // the top, its deeper front lip and chamfers
      box(C.w, BAR_TOP, C.d, C.x, C.h - BAR_TOP / 2, C.z, MAPLE_TOP, { grain: "x", uvSize: [0.6, 1.8] }),
      box(C.w, 0.04, 0.035, C.x, C.h - BAR_TOP - 0.02, front + 0.0175, MAPLE_TOP, { grain: "x", uvSize: [0.6, 1.8] }),
      chamfer(C.w, "x", C.x, C.h - 0.0028, front + 0.0028),
      chamfer(C.w, "x", C.x, C.h - BAR_TOP - 0.04 + 0.0028, front + 0.0028, 0.008, "#d8c4a4"),
      ...[-1, 1].map((s) => chamfer(C.d, "z", C.x + s * (C.w / 2 - 0.0028), C.h - 0.0028, C.z)),
      // underside shadow strip, where the top meets the base
      box(baseW, 0.006, 0.01, C.x, C.h - BAR_TOP - 0.003, baseFront - 0.005, MAPLE_DARK, FLAT),
    ];
    // panel seams down the base front, about a metre apart
    const panels = Math.max(2, Math.round(baseW / 1.0));
    for (let i = 1; i < panels; i++) {
      parts.push(box(0.006, bodyH, 0.004, C.x - baseW / 2 + (i * baseW) / panels, kick + bodyH / 2, baseFront - 0.0015, MAPLE_DARK, FLAT));
    }
    for (const p of PARTITIONS) {
      parts.push(box(p.w, p.h - 0.03, p.d, p.x, (p.h - 0.03) / 2, p.z, MAPLE_LEG, { grain: "y", uvSize: [0.6, 1.6] }));
      parts.push(box(p.w + 0.02, 0.03, p.d, p.x, p.h - 0.015, p.z, MAPLE_TOP, { grain: "z", uvSize: [0.6, 1.6] }));
    }
    // the foot rail on brackets
    const railZ = baseFront - 0.07;
    const railW = baseW - 0.3;
    const rail = new CylinderGeometry(0.02, 0.02, railW, 16);
    rail.rotateZ(Math.PI / 2);
    const metal: Part[] = [{ geo: rail, pos: [C.x, 0.22, railZ], colour: "#c4c9ce" }];
    const brackets = Math.round(railW / 1.3);
    for (let i = 0; i <= brackets; i++) {
      const bx = C.x - railW / 2 + 0.05 + (i * (railW - 0.1)) / brackets;
      metal.push(box(0.02, 0.025, 0.07, bx, 0.22, railZ + 0.035, "#9aa0a6"));
    }
    for (const s of [-1, 1]) metal.push({ geo: new CylinderGeometry(0.022, 0.022, 0.01, 16), pos: [C.x + s * (railW / 2 + 0.005), 0.22, railZ], rot: [0, 0, Math.PI / 2], colour: "#9aa0a6" });
    return { wood: mergeParts(parts), metal: mergeParts(metal) };
  }, []);
  return (
    <group>
      <group position={[COUNTER.x, 0, COUNTER.z + BAR_OVERHANG / 2]}>
        <BlobShadow w={COUNTER.w + 0.6} d={COUNTER.d} />
      </group>
      <mesh geometry={wood} material={m.wood} />
      <mesh geometry={metal} material={m.metal} />
      <Stools />
    </group>
  );
}

// ---------- product bays ----------

// Piers and the dark bay panels (and, unless `shelves: false`, the plain
// shelf plates). For brushed-metal shelves with a lip and a lit strip, render
// <BayShelves /> and call bayFrames({ shelves: false }).
export function bayFrames(opts: { shelves?: boolean } = {}): Cuboid[] {
  const shelves = opts.shelves ?? true;
  const frames: Cuboid[] = [];
  const bottom = BAY_SHELVES.panelBottom;
  const top = BAY_SHELVES.panelTop;
  for (const side of [-1, 1]) {
    // piers: lighter strips from the bench to the ceiling, so the bays read as
    // indented between them; below the bench the grey panel runs unbroken
    for (let i = 0; i <= BAY_COUNT; i++) {
      const zc = bayCentre(0) - BAY_W / 2 - PIER_W / 2 + i * (BAY_W + PIER_W);
      frames.push({ x: side * (FACE_X - 0.15), y: (bottom + CEILING) / 2, z: zc, w: 0.3, h: CEILING - bottom, d: PIER_W, colour: "#b4b8bd" });
    }
    for (let i = 0; i < BAY_COUNT; i++) {
      const zc = bayCentre(i);
      frames.push({ x: side * (FACE_X - 0.02), y: (bottom + top) / 2, z: zc, w: 0.04, h: top - bottom, d: BAY_W, colour: "#3b3f45" });
      if (!shelves) continue;
      for (let k = 0; k < BAY_SHELVES.count; k++) {
        const y = BAY_SHELVES.first + k * BAY_SHELVES.step;
        frames.push({ x: side * (FACE_X - 0.14), y, z: zc, w: 0.24, h: 0.025, d: BAY_W - 0.04, colour: "#8b9096" });
      }
    }
  }
  return frames;
}

// Brushed-metal shelf plates (same place and size as bayFrames' plates: 0.24
// deep, 25 mm, centred on each shelf height), a 12 mm front lip rising 10 mm
// above the plate, and a thin lit strip under each plate's front edge.
export function BayShelves() {
  const m = mats();
  const { plates, lips, strips } = useMemo(() => {
    const plates: Part[] = [];
    const lips: Part[] = [];
    const strips: Part[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < BAY_COUNT; i++) {
        const zc = bayCentre(i);
        for (let k = 0; k < BAY_SHELVES.count; k++) {
          const y = BAY_SHELVES.first + k * BAY_SHELVES.step;
          plates.push(box(0.24, 0.025, BAY_W - 0.04, side * (FACE_X - 0.14), y, zc, "#b9bec4"));
          lips.push(box(0.006, 0.035, BAY_W - 0.04, side * (FACE_X - 0.26 + 0.003), y + 0.005, zc, "#dfe3e7"));
          strips.push(box(0.012, 0.004, BAY_W - 0.1, side * (FACE_X - 0.235), y - 0.0145, zc, "#fff4e2"));
        }
      }
    }
    return { plates: mergeParts([...plates, ...lips]), lips: null, strips: mergeParts(strips) };
  }, []);
  void lips;
  return (
    <group>
      <mesh geometry={plates} material={m.metal} />
      <mesh geometry={strips} material={m.glow} />
    </group>
  );
}

// ---------- back room ----------

// Staff-only back room: rows of labelled shelving, two repair benches with
// technicians, and a parts wall, behind the flush door left of the bar.
export const BACK_LABELS = [
  ["PHONES  BLK", "PHONES  SLV", "TABLETS"],
  ["LAPTOPS", "WATCHES", "EARBUDS"],
  ["CASES", "CHARGERS", "CABLES"],
  ["BANDS", "KEYBOARDS", "SMART HOME"],
];

const KRAFT = ["#c8a272", "#b8915f", "#d4b48a", "#c19a68"];

// A hand wheel for a mobile shelving carriage: rim, three spokes, hub, knob.
// Its axis is +x (it faces +x).
let wheelGeo: BufferGeometry | null = null;
function wheelGeometry(): BufferGeometry {
  if (wheelGeo) return wheelGeo;
  const rim = new TorusGeometry(0.15, 0.012, 8, 32);
  rim.rotateY(Math.PI / 2);
  const parts: Part[] = [
    { geo: rim, colour: "#2f343a" },
    { geo: new CylinderGeometry(0.035, 0.035, 0.05, 16), rot: [0, 0, Math.PI / 2], colour: "#c4c9ce" },
    { geo: new CylinderGeometry(0.012, 0.012, 0.07, 10), pos: [0.05, 0.15 * Math.cos(0.4), 0.15 * Math.sin(0.4)], rot: [0, 0, Math.PI / 2], colour: "#2f343a" },
  ];
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * Math.PI) / 3;
    parts.push({ geo: UNIT_BOX, pos: [0, 0.075 * Math.cos(a), 0.075 * Math.sin(a)], rot: [a, 0, 0], scale: [0.012, 0.15, 0.02], colour: "#c4c9ce" });
  }
  wheelGeo = mergeParts(parts);
  return wheelGeo;
}

// The rolling high-density shelves in the inventory store: a carriage on
// floor rails, painted end panels with hand wheels, steel decks with label
// strips, uprights, and cartons.
export function StorageRacks() {
  const m = mats();
  const { frame, wheels, cartons } = useMemo(() => {
    const r = rng(42);
    const parts: Part[] = [];
    const wheels: Inst[] = [];
    const cartons: Inst[] = [];
    const decks = [0.2, 0.68, 1.16, 1.64, 2.12];
    BACK_SHELVES.forEach((u, idx) => {
      const panelCol = idx % 3 === 1 ? "#8ea2b4" : "#7f95a8";
      // carriage
      parts.push(box(u.w, 0.1, u.d, u.x, 0.08, u.z, "#3d434b"));
      // end panels, with a light trim
      for (const s of [-1, 1]) {
        const ex = u.x + s * (u.w / 2 - 0.012);
        parts.push(box(0.024, u.h - 0.13, u.d, ex, 0.13 + (u.h - 0.13) / 2, u.z, panelCol));
        parts.push(box(0.03, 0.03, u.d + 0.01, ex, u.h - 0.015, u.z, "#d6dade"));
        parts.push(box(0.003, 0.12, 0.2, ex + s * 0.013, 1.5, u.z, "#f4f4f2")); // label holder
        wheels.push({ x: u.x + s * (u.w / 2 + 0.05), y: 1.05, z: u.z, ry: s === 1 ? 0 : Math.PI });
      }
      // uprights at the middle
      for (const uz of [-0.28, 0.28]) parts.push(box(0.04, u.h - 0.13, 0.04, u.x, 0.13 + (u.h - 0.13) / 2, u.z + uz, "#9aa0a6"));
      // decks, each with front and back lips and white label strips
      for (const y of [...decks, u.h - 0.02]) {
        parts.push(box(u.w - 0.05, 0.025, u.d - 0.02, u.x, y, u.z, "#c4c9ce"));
        for (const s of [-1, 1]) parts.push(box(u.w - 0.05, 0.04, 0.012, u.x, y + 0.0075, u.z + s * (u.d / 2 - 0.006), "#aeb4ba"));
        for (let k = 0; k < 4; k++) parts.push(box(0.12, 0.022, 0.002, u.x - u.w / 2 + 0.25 + k * 0.62, y + 0.008, u.z - u.d / 2 - 0.001, "#f7f7f5"));
      }
      // cartons, one deep, varied
      decks.forEach((y) => {
        let x = u.x - u.w / 2 + 0.04;
        const end = u.x + u.w / 2 - 0.04;
        while (true) {
          const w = 0.22 + r() * 0.2;
          if (x + w > end) break;
          const h = 0.16 + r() * 0.24;
          const d = 0.42 + r() * 0.14;
          const white = r() < 0.3;
          cartons.push({
            x: x + w / 2,
            y: y + 0.0125 + h / 2,
            z: u.z + (r() - 0.5) * 0.04,
            sx: w,
            sy: h,
            sz: d,
            ry: (r() - 0.5) * 0.05,
            colour: white ? BOX_COLOURS[Math.floor(r() * BOX_COLOURS.length)] : KRAFT[Math.floor(r() * KRAFT.length)],
          });
          x += w + 0.01 + r() * 0.03;
        }
      });
    });
    // floor rails (steel T section, 27 mm), running front to back under each column of units
    const z0 = Math.min(...BACK_SHELVES.map((u) => u.z)) - 0.9;
    const z1 = Math.max(...BACK_SHELVES.map((u) => u.z)) + 0.9;
    for (const x of BACK_SHELF_UNIT_X) {
      for (const dx of [-0.9, 0.9]) {
        parts.push(box(0.054, 0.006, z1 - z0, x + dx, 0.003, (z0 + z1) / 2, "#5a6068"));
        parts.push(box(0.016, 0.027, z1 - z0, x + dx, 0.0135, (z0 + z1) / 2, "#8d939a"));
      }
    }
    return { frame: mergeParts(parts), wheels, cartons };
  }, []);
  return (
    <group>
      <mesh geometry={frame} material={m.paint} />
      <Instances geo={wheelGeometry()} items={wheels} material={m.paint} />
      <Instances geo={UNIT_BOX} items={cartons} material={m.carton} />
      {BACK_SHELF_ROW_Z.map((z, r) =>
        BACK_SHELF_UNIT_X.map((x, u) => <Sign key={`${r}:${u}`} text={BACK_LABELS[r][u]} position={[x, 2.6, z - 0.33]} rotY={Math.PI} w={1.7} />),
      )}
    </group>
  );
}

// An office task chair, facing +z (the sitter's back toward -z).
let chairGeo: BufferGeometry | null = null;
function officeChairGeometry(): BufferGeometry {
  if (chairGeo) return chairGeo;
  const parts: Part[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5;
    parts.push({ geo: UNIT_BOX, pos: [0.14 * Math.sin(a), 0.07, 0.14 * Math.cos(a)], rot: [0, a, 0], scale: [0.035, 0.03, 0.28], colour: "#2a2e33" });
    parts.push({ geo: new CylinderGeometry(0.022, 0.022, 0.03, 10), pos: [0.27 * Math.sin(a), 0.025, 0.27 * Math.cos(a)], rot: [Math.PI / 2, a, 0], colour: "#1c1f23" });
  }
  parts.push({ geo: new CylinderGeometry(0.025, 0.03, 0.34, 12), pos: [0, 0.25, 0], colour: "#9aa0a6" });
  parts.push({ geo: new RoundedBoxGeometry(0.47, 0.07, 0.45, 2, 0.025), pos: [0, 0.46, 0], colour: "#30353c" });
  parts.push(box(0.05, 0.32, 0.03, 0, 0.6, -0.23, "#2a2e33"));
  parts.push({ geo: new RoundedBoxGeometry(0.44, 0.48, 0.05, 2, 0.02), pos: [0, 0.86, -0.25], rot: [-0.1, 0, 0], colour: "#30353c" });
  for (const s of [-1, 1]) {
    parts.push(box(0.03, 0.2, 0.03, s * 0.21, 0.58, -0.02, "#2a2e33"));
    parts.push(box(0.06, 0.025, 0.24, s * 0.21, 0.68, 0.0, "#2a2e33"));
  }
  chairGeo = mergeParts(parts);
  return chairGeo;
}

// A plain maple cafe chair, facing +z.
let cafeGeo: BufferGeometry | null = null;
function cafeChairGeometry(): BufferGeometry {
  if (cafeGeo) return cafeGeo;
  const parts: Part[] = [box(0.42, 0.03, 0.42, 0, 0.45, 0, MAPLE_TOP, { grain: "z", uvSize: [0.6, 1.6] })];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(box(0.03, 0.435, 0.03, sx * 0.18, 0.2175, sz * 0.18, MAPLE_LEG, { grain: "y", uvSize: [0.3, 0.9] }));
    parts.push(box(0.03, 0.42, 0.03, sx * 0.18, 0.67, -0.18, MAPLE_LEG, { grain: "y", uvSize: [0.3, 0.9] }));
  }
  parts.push(box(0.39, 0.09, 0.02, 0, 0.82, -0.18, MAPLE_TOP, { grain: "x", uvSize: [0.6, 1.6] }));
  parts.push(box(0.39, 0.03, 0.02, 0, 0.3, -0.18, MAPLE_LEG, { grain: "x", uvSize: [0.6, 1.6] }));
  cafeGeo = mergeParts(parts);
  return cafeGeo;
}

// A monitor on a stand, facing +z, plus its screen plane (separate).
function monitorParts(x: number, y: number, z: number, facing: number): { body: Part[]; screen: Part } {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  const at = (dx: number, dz: number): [number, number] => [x + dx * c + dz * s, z - dx * s + dz * c];
  const [bx, bz] = at(0, -0.02);
  const [nx, nz] = at(0, -0.03);
  const [dx, dz] = at(0, 0);
  const [sx, sz] = at(0, 0.0135);
  return {
    body: [
      { geo: UNIT_BOX, pos: [bx, y + 0.006, bz], rot: [0, facing, 0], scale: [0.22, 0.012, 0.16], colour: "#b9bec4" },
      { geo: UNIT_BOX, pos: [nx, y + 0.17, nz], rot: [0, facing, 0], scale: [0.04, 0.32, 0.02], colour: "#b9bec4" },
      { geo: new RoundedBoxGeometry(0.58, 0.35, 0.025, 2, 0.006), pos: [dx, y + 0.4, dz], rot: [0, facing, 0], colour: "#1d2026" },
    ],
    screen: { geo: new PlaneGeometry(0.55, 0.32), pos: [sx, y + 0.4, sz], rot: [0, facing, 0] },
  };
}

// The repair benches in the repair room: a light laminate top on a steel
// frame, an anti-static mat with a grounding snap, a drawer pedestal, a
// louvred rear panel with parts bins, a task lamp, a monitor and a task chair.
// The technician works from the -z side.
export function RepairBenches() {
  const m = mats();
  const { paint, glow, screens, chairs } = useMemo(() => {
    const paint: Part[] = [];
    const glow: Part[] = [];
    const screens: Part[] = [];
    const chairs: Inst[] = [];
    const BIN = ["#2f6db5", "#d0473c", "#e6b23c", "#2f6db5", "#4a9a5c"];
    SERVICE_DESKS.forEach((d, di) => {
      const h = d.h;
      const back = d.z + d.d / 2;
      paint.push(box(d.w, 0.04, d.d, d.x, h - 0.02, d.z, "#d5d8dc"));
      paint.push(box(d.w, 0.012, 0.012, d.x, h - 0.006, d.z - d.d / 2 + 0.006, "#9aa0a6"));
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) paint.push(box(0.05, h - 0.04, 0.05, d.x + sx * (d.w / 2 - 0.05), (h - 0.04) / 2, d.z + sz * (d.d / 2 - 0.05), "#4d545c"));
        paint.push(box(0.04, 0.04, d.d - 0.1, d.x + sx * (d.w / 2 - 0.05), 0.15, d.z, "#4d545c"));
      }
      paint.push(box(d.w - 0.1, 0.04, 0.04, d.x, 0.15, back - 0.05, "#4d545c"));
      // drawer pedestal, right end
      const px = d.x + d.w / 2 - 0.32;
      paint.push(box(0.45, h - 0.16, d.d - 0.12, px, 0.06 + (h - 0.16) / 2, d.z + 0.02, "#6f7a85"));
      for (let k = 0; k < 4; k++) {
        const dy = 0.1 + k * 0.18 + 0.08;
        paint.push(box(0.42, 0.16, 0.012, px, dy, d.z - d.d / 2 + 0.075, "#808b96"));
        paint.push(box(0.2, 0.014, 0.02, px, dy + 0.045, d.z - d.d / 2 + 0.064, "#2a2e33"));
      }
      // anti-static mat and its grounding snap
      paint.push(box(d.w - 0.3, 0.004, d.d - 0.28, d.x - 0.05, h + 0.002, d.z - 0.08, "#3f6b8c"));
      paint.push({ geo: new CylinderGeometry(0.008, 0.008, 0.006, 10), pos: [d.x - d.w / 2 + 0.2, h + 0.006, d.z + 0.12], colour: "#d4d8dc" });
      // louvred rear panel with rows of parts bins
      paint.push(box(d.w, 0.62, 0.02, d.x, h + 0.31, back - 0.01, "#a3acb6"));
      for (let row = 0; row < 3; row++) {
        const ry = h + 0.16 + row * 0.17;
        paint.push(box(d.w - 0.08, 0.012, 0.03, d.x, ry, back - 0.035, "#7f8a95"));
        const n = 13;
        for (let k = 0; k < n; k++) {
          const bx = d.x - d.w / 2 + 0.11 + k * ((d.w - 0.22) / (n - 1));
          paint.push(box(0.1, 0.075, 0.12, bx, ry + 0.045, back - 0.08, BIN[(k + row + di) % BIN.length]));
          paint.push(box(0.07, 0.02, 0.003, bx, ry + 0.05, back - 0.142, "#f4f4f2"));
        }
      }
      // task lamp at the back left corner
      const lx = d.x - d.w / 2 + 0.16;
      const lz = d.z + 0.2;
      paint.push({ geo: new CylinderGeometry(0.07, 0.075, 0.02, 20), pos: [lx, h + 0.01, lz], colour: "#2a2e33" });
      paint.push({ geo: UNIT_BOX, pos: [lx, h + 0.22, lz - 0.04], rot: [-0.19, 0, 0], scale: [0.018, 0.43, 0.018], colour: "#2a2e33" });
      paint.push({ geo: UNIT_BOX, pos: [lx, h + 0.37, lz - 0.25], rot: [-0.284, 0, 0], scale: [0.018, 0.018, 0.354], colour: "#2a2e33" });
      paint.push({ geo: new CylinderGeometry(0.045, 0.065, 0.05, 20), pos: [lx, h + 0.3, lz - 0.42], colour: "#2a2e33" });
      glow.push({ geo: new CylinderGeometry(0.058, 0.058, 0.004, 20), pos: [lx, h + 0.274, lz - 0.42], colour: "#fff6e0" });
      // monitor, facing the technician
      const mon = monitorParts(d.x + 0.5, h, d.z + 0.24, Math.PI);
      paint.push(...mon.body);
      screens.push(mon.screen);
      chairs.push({ x: d.x - 0.2, y: 0, z: d.z - d.d / 2 - 0.45, ry: 0 });
    });
    return { paint: mergeParts(paint), glow: mergeParts(glow), screens: mergeParts(screens), chairs };
  }, []);
  return (
    <group>
      <mesh geometry={paint} material={m.paint} />
      <mesh geometry={glow} material={m.glow} />
      <mesh geometry={screens} material={m.screen} />
      <Instances geo={officeChairGeometry()} items={chairs} material={m.paint} />
      {SERVICE_DESKS.map((d, i) => (
        <group key={i}>
          <Device kind="laptop" x={d.x - 0.75} y={d.h + 0.004} z={d.z - 0.12} rotY={Math.PI} colour="#2b2f36" />
          <Device kind="tabletKb" x={d.x + 0.05} y={d.h + 0.004} z={d.z - 0.12} rotY={Math.PI} colour="#3a4a63" />
          <Device kind="phone" x={d.x + 0.6} y={d.h + 0.004} z={d.z - 0.18} rotY={Math.PI} colour="#c9ced3" />
        </group>
      ))}
    </group>
  );
}

// Furniture in the areas behind the shop (positions from BACK_FURNITURE in
// world.ts): lockers, the manager's desk and chair, the break table and
// chairs, the training computers' desk, the restroom doors and the delivery
// pallets.
export function BackFurniture() {
  const m = mats();
  const built = useMemo(() => {
    const wood: Part[] = [];
    const paint: Part[] = [];
    const screens: Part[] = [];
    const wrap: Part[] = [];
    const office: Inst[] = [];
    const cafe: Inst[] = [];
    const cartons: Inst[] = [];
    const lockerFronts: BackThing[] = [];
    const r = rng(77);
    const desk = (f: BackThing, modesty: "-z" | "+z" | "-x" | "+x") => {
      const T = 0.03;
      wood.push(box(f.w, T, f.d, f.x, f.h - T / 2, f.z, MAPLE_TOP, { grain: f.w > f.d ? "x" : "z", uvSize: [0.6, 1.6] }));
      wood.push(chamfer(f.w, "x", f.x, f.h - 0.002, f.z - f.d / 2 + 0.002, 0.006));
      wood.push(chamfer(f.w, "x", f.x, f.h - 0.002, f.z + f.d / 2 - 0.002, 0.006));
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) paint.push(box(0.04, f.h - T, 0.04, f.x + sx * (f.w / 2 - 0.04), (f.h - T) / 2, f.z + sz * (f.d / 2 - 0.04), "#5b626a"));
      }
      const mh = 0.35;
      if (modesty === "-z" || modesty === "+z") {
        const s = modesty === "-z" ? -1 : 1;
        paint.push(box(f.w - 0.12, mh, 0.015, f.x, f.h - T - mh / 2, f.z + s * (f.d / 2 - 0.06), "#c9ced3"));
      } else {
        const s = modesty === "-x" ? -1 : 1;
        paint.push(box(0.015, mh, f.d - 0.12, f.x + s * (f.w / 2 - 0.06), f.h - T - mh / 2, f.z, "#c9ced3"));
      }
    };
    for (const f of BACK_FURNITURE) {
      if (f.kind === "lockers") {
        // steel lockers: body, plinth, top trim; fronts are a texture (7 x 2)
        paint.push(box(f.w - 0.02, f.h - 0.1, f.d, f.x - 0.01, 0.1 + (f.h - 0.1) / 2, f.z, "#c8cdd2"));
        paint.push(box(f.w - 0.06, 0.1, f.d, f.x - 0.03, 0.05, f.z, "#3a3f46"));
        paint.push(box(f.w, 0.02, f.d + 0.01, f.x, f.h - 0.01, f.z, "#aab1b8"));
        for (let k = 0; k < 7; k++) {
          for (let t = 0; t < 2; t++) {
            const hz = f.z - f.d / 2 + (k + 0.86) * (f.d / 7);
            const hy = 0.1 + (t + 0.5) * ((f.h - 0.12) / 2);
            paint.push(box(0.02, 0.1, 0.018, f.x + f.w / 2 + 0.003, hy, hz, "#3a3f46"));
          }
        }
        lockerFronts.push(f);
      } else if (f.kind === "restroom") {
        // the restroom block's front (faces -z): two doors with frames, push
        // plates, kick plates and a plain plate sign on each
        const fz = f.z - f.d / 2;
        paint.push(box(f.w, f.h, f.d, f.x, f.h / 2, f.z, "#dfe3e7"));
        for (const dx of [-0.6, 0.6]) {
          const x = f.x + dx;
          paint.push(box(0.85, 2.05, 0.04, x, 1.025, fz - 0.02, "#b4bcc5"));
          paint.push(box(0.05, 2.1, 0.05, x - 0.45, 1.05, fz - 0.022, "#6d757e"));
          paint.push(box(0.05, 2.1, 0.05, x + 0.45, 1.05, fz - 0.022, "#6d757e"));
          paint.push(box(0.95, 0.05, 0.05, x, 2.1, fz - 0.022, "#6d757e"));
          paint.push(box(0.08, 0.3, 0.004, x + 0.3, 1.1, fz - 0.042, "#dfe3e7"));
          paint.push(box(0.8, 0.2, 0.004, x, 0.12, fz - 0.042, "#d4d8dc"));
          paint.push(box(0.16, 0.16, 0.006, x, 1.55, fz - 0.043, "#2f3a4a"));
          paint.push({ geo: new CylinderGeometry(0.025, 0.025, 0.004, 16), pos: [x, 1.585, fz - 0.047], rot: [Math.PI / 2, 0, 0], colour: "#ffffff" });
          paint.push(box(0.05, 0.07, 0.004, x, 1.525, fz - 0.047, "#ffffff"));
        }
      } else if (f.kind === "pallet") {
        // a timber pallet (0.144 high: bottom boards, bearers, top deck),
        // stacked cartons, shrink-wrap over the load
        const P = "#cfae7c";
        for (const z of [-0.44, 0, 0.44]) wood.push(box(f.w, 0.022, 0.12, f.x, 0.011, f.z + z * f.d, P, { grain: "x", uvSize: [0.5, 1.0], uvOffset: [r(), r()] }));
        for (const x of [-0.45, 0, 0.45]) wood.push(box(0.1, 0.1, f.d, f.x + x * f.w, 0.072, f.z, "#bf9d6b", { grain: "z", uvSize: [0.5, 1.0] }));
        for (let i = 0; i < 7; i++) wood.push(box(f.w, 0.022, 0.11, f.x, 0.133, f.z - f.d / 2 + 0.055 + i * ((f.d - 0.11) / 6), P, { grain: "x", uvSize: [0.5, 1.0], uvOffset: [r(), r()] }));
        const loadH = f.h - 0.144;
        const layers = loadH > 0.8 ? 3 : 2;
        const lh = loadH / layers;
        for (let L = 0; L < layers; L++) {
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              cartons.push({ x: f.x + sx * 0.24, y: 0.144 + L * lh + lh / 2, z: f.z + sz * 0.24, sx: 0.47, sy: lh - 0.005, sz: 0.47, ry: (r() - 0.5) * 0.03, colour: KRAFT[Math.floor(r() * KRAFT.length)] });
            }
          }
        }
        wrap.push(box(0.97, loadH + 0.04, 0.97, f.x, 0.12 + (loadH + 0.04) / 2, f.z));
      } else if (f.kind === "computers") {
        // the training desk: three keyboard tablets, used from the -x side
        desk(f, "+x");
        for (const dz of [-0.9, 0, 0.9]) office.push({ x: f.x - f.w / 2 - 0.4, y: 0, z: f.z + dz, ry: Math.PI / 2 });
      } else if (f.kind === "desk") {
        // the manager's desk: used from the +z side, a drawer pedestal, a
        // monitor and a keyboard
        desk(f, "-z");
        const px = f.x + f.w / 2 - 0.25;
        paint.push(box(0.4, f.h - 0.08, f.d - 0.1, px, (f.h - 0.08) / 2 + 0.02, f.z, "#9aa3ad"));
        for (let k = 0; k < 3; k++) paint.push(box(0.36, 0.005, 0.012, px, 0.2 + k * 0.2, f.z + f.d / 2 - 0.05, "#2a2e33"));
        const mon = monitorParts(f.x + 0.1, f.h, f.z - 0.22, 0);
        paint.push(...mon.body);
        screens.push(mon.screen);
        paint.push(box(0.42, 0.015, 0.13, f.x + 0.1, f.h + 0.0075, f.z + 0.12, "#d6dade"));
        office.push({ x: f.x, y: 0, z: f.z + f.d / 2 + 0.4, ry: Math.PI });
      } else {
        // the break table and its four chairs
        wood.push(box(f.w, 0.035, f.d, f.x, f.h - 0.0175, f.z, MAPLE_TOP, { grain: "x", uvSize: [0.6, 1.6] }));
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) wood.push(box(0.05, f.h - 0.035, 0.05, f.x + sx * (f.w / 2 - 0.06), (f.h - 0.035) / 2, f.z + sz * (f.d / 2 - 0.06), MAPLE_LEG, { grain: "y", uvSize: [0.3, 0.9] }));
          for (const sz of [-1, 1]) cafe.push({ x: f.x + sx * 0.3, y: 0, z: f.z + sz * (f.d / 2 + 0.2), ry: sz === -1 ? 0 : Math.PI });
        }
      }
    }
    return {
      wood: mergeParts(wood),
      paint: mergeParts(paint),
      screens: mergeParts(screens),
      wrap: mergeParts(wrap),
      office,
      cafe,
      cartons,
      lockerFronts,
    };
  }, []);
  const desk = BACK_FURNITURE.find((f) => f.kind === "desk");
  const computers = BACK_FURNITURE.find((f) => f.kind === "computers");
  const restroom = BACK_FURNITURE.find((f) => f.kind === "restroom");
  return (
    <group>
      <mesh geometry={built.wood} material={m.wood} />
      <mesh geometry={built.paint} material={m.paint} />
      <mesh geometry={built.screens} material={m.screen} />
      <Instances geo={UNIT_BOX} items={built.cartons} material={m.carton} />
      <mesh geometry={built.wrap} material={m.wrap} renderOrder={2} />
      <Instances geo={officeChairGeometry()} items={built.office} material={m.paint} />
      <Instances geo={cafeChairGeometry()} items={built.cafe} material={m.wood} />
      {built.lockerFronts.map((f, i) => (
        <mesh key={i} position={[f.x + f.w / 2 + 0.001, 0.1 + (f.h - 0.12) / 2, f.z]} rotation={[0, Math.PI / 2, 0]} material={m.locker}>
          <planeGeometry args={[f.d, f.h - 0.12]} />
        </mesh>
      ))}
      {computers &&
        [-0.9, 0, 0.9].map((dz) => <Device key={dz} kind="tabletKb" x={computers.x} y={computers.h} z={computers.z + dz} rotY={-Math.PI / 2} colour="#3a4a63" />)}
      {desk && <Device kind="laptop" x={desk.x - 0.45} y={desk.h} z={desk.z + 0.05} rotY={0} colour="#2b2f36" />}
      {restroom && (
        <Sign text="RESTROOMS" position={[restroom.x, 2.3, restroom.z - restroom.d / 2 - 0.03]} rotY={Math.PI} w={1.6} fg="#ffffff" bg="#2f3a4a" />
      )}
    </group>
  );
}
