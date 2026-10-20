import { ENTRANCE_HALF, FLOOR, WALKWAY_DEPTH, type Role } from "./protocol.ts";

// The store's solid objects and walkable areas, as axis-aligned boxes on the
// floor plan. One list feeds both the scene (what is drawn) and the movement
// code (what you cannot walk through), so a table you see is a table you bump
// into. The server uses the same walkable areas to clamp positions.
//
// Layout follows the Canberra reference (SCOPE.md 3f): a wide room, long
// tables running front to back in five columns, device benches along the side
// walls, product walls above them, a long service bar at the back, and a
// staff-only back room behind a flush door left of the bar.

export interface Box {
  x: number; // centre
  z: number; // centre
  w: number; // size along x
  d: number; // size along z
  h: number; // height
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Where the tables, benches and stools stand is DATA, in layout.json, so it
// can be edited with the layout tool (tools/layout) and everything that reads
// it (the 3D scene, the server, the drawings, the checks) follows.
//
// What the layout says, as Ritesh described it (2026-10-11): three columns of
// tables at -1/4, 0 and +1/4 of the room width. The two side columns each have
// four almost-square product tables and, nearest the bar, a larger SQUARE
// service table (its side is the long edge of a product table) with a stool on
// its left and right, where a customer sits down to talk with staff. The
// middle column has three product tables and one service table. Product tables
// carry one product on each side, each facing outward.
import layoutData from "./layout.json" with { type: "json" };
import type { ProductKind } from "./plan.ts";

export interface Table extends Box {
  id: string;
  service: boolean; // a service table: square, no products, stools either side
  // products on the two long sides only (Ritesh, 2026-10-11), in the order -x side, +x side
  products: readonly ProductKind[];
}

export interface Stool {
  id: string;
  x: number;
  z: number;
  kind: "bar" | "table"; // at the service bar, or beside a service table
}

interface LayoutFile {
  tables: Array<{ id: string; x: number; z: number; w: number; d: number; service: boolean; products: ProductKind[] }>;
  benches: Array<{ id: string; x: number; z: number; w: number; d: number }>;
  stools: Stool[];
}
const LAYOUT = layoutData as LayoutFile;

// The table columns: about a quarter of the shop's width either side of the
// middle. Tables sit near these but are free to move (src/shared/layout.json).
export const COLUMN_X = [-3.2, 0, 3.2] as const;
export const TABLE_H = 0.95; // Ritesh, 2026-10-12: "table heights may need to be raised slightly" (was 0.9)

export const TABLES: Table[] = LAYOUT.tables.map((t) => ({ ...t, h: TABLE_H }));

// Product table size: the first product table's (they are all the same size
// unless edited). A service table is a square; its side is the long edge.
const firstProduct = TABLES.find((t) => !t.service) ?? TABLES[0];
const firstService = TABLES.find((t) => t.service) ?? TABLES[0];
export const TABLE_W = firstProduct.w; // across the room (x)
export const TABLE_LEN = firstProduct.d; // front to back (z)
export const SERVICE_SIDE = firstService.w;

// Long benches along both side walls, carrying devices.
export const BENCHES: Box[] = LAYOUT.benches.map((b) => ({ ...b, h: 0.95 }));

export const STOOL_LIST: Stool[] = LAYOUT.stools;
export const BAR_STOOLS: Stool[] = STOOL_LIST.filter((s) => s.kind === "bar");
// Stools beside the service tables. (Small and not solid, like the bar's.)
export const TABLE_STOOLS: Stool[] = STOOL_LIST.filter((s) => s.kind === "table");

// The service bar along the back, from almost the far edge of one service
// table to almost the far edge of the other (Ritesh, 2026-10-11), and the
// partitions that close off the staff space behind it. The bar's front edge
// leaves a metre-wide aisle behind the seated people at it (their stools are
// tucked 0.2 m under the edge), and the partitions run from the bar's back to
// the wall.
const SERVICE_TABLES = LAYOUT.tables.filter((t) => t.service);
const OUTER_EDGE = Math.max(...SERVICE_TABLES.map((t) => Math.abs(t.x) + t.w / 2));
export const BAR_HALF = Math.round((OUTER_EDGE - 0.1) * 100) / 100; // ends 0.1 m short of the tables' far edges
export const BAR_D = 0.8;
export const BAR_H = 1.05;
const BAR_FRONT = Math.round(Math.max(...SERVICE_TABLES.map((t) => t.z + t.d / 2)) * 100) / 100 + 1.45;
export const COUNTER: Box = { x: 0, z: BAR_FRONT + BAR_D / 2, w: BAR_HALF * 2, d: BAR_D, h: BAR_H };
const PART_D = FLOOR.maxZ - (COUNTER.z + BAR_D / 2);
export const PARTITIONS: Box[] = [-1, 1].map((s) => ({
  x: s * (BAR_HALF - 0.06),
  z: FLOOR.maxZ - PART_D / 2,
  w: 0.12,
  d: PART_D,
  h: BAR_H,
}));

// The back room: same footprint as the store, behind the back wall. Its first
// row of shelving starts after the wall (the wall's inner face is at maxZ+0.4).
export const WALL_FACE_Z = FLOOR.maxZ + 0.4;
export const BACK_ROOM_Z0 = WALL_FACE_Z + 0.2;
export const BACK_ROOM_Z1 = BACK_ROOM_Z0 + (FLOOR.maxZ - FLOOR.minZ);

// What is in the back room (Ritesh, 2026-10-11, from a description of a real
// store's back of house): inventory on rolling high-density shelves; a repair
// room where technicians work on devices; a manager's office; a break and
// training room with computers; lockers and staff restrooms; and a back door
// to a loading dock for deliveries.
//
// The layout is the redesign Ritesh approved on 2026-10-12
// (docs/blueprint/back-redesign.png; SCOPE D38). The old one put every room
// behind four rows of shelving. Now: a clear concourse inside the staff door,
// the stock hall with a clear staff lane down one side, a spine corridor, and
// the rooms off the spine, with open receiving from the dock door. The areas
// and furniture are mine to place (working defaults, drawn in the blueprint
// to be corrected); the footprint is the shop's.
const rz = (v: number): number => BACK_ROOM_Z0 + v;
export interface BackArea {
  id: string;
  name: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
// v is metres from the back room's first row. East is +x (the visitor's left
// as they enter, and the side of the staff door).
export const BACK_LAYOUT = {
  concourseV: 2.0, // clear floor just inside the staff door
  spineV0: 9.0, // the cross corridor, 1.8 m wide
  spineV1: 10.8,
  laneX0: 4.2, // the staff lane down the east side of the stock hall
  roomsX: { west: -2.2, east: 2.2 }, // receiving runs between these
  repairV1: 15.4, // repair ends, the office begins
  westRoomsV: 13.4, // restrooms and cleaner end, break and training begins
  cleanerX: -3.4,
} as const;
const L = BACK_LAYOUT;
export const BACK_AREAS: BackArea[] = [
  { id: "storage", name: "INVENTORY STORAGE (rolling shelves)", x0: FLOOR.minX, x1: L.laneX0, z0: rz(L.concourseV), z1: rz(L.spineV0) },
  { id: "lane", name: "STAFF LANE", x0: L.laneX0, x1: FLOOR.maxX, z0: rz(L.concourseV), z1: rz(L.spineV0) },
  { id: "concourse", name: "RUNNER CONCOURSE", x0: FLOOR.minX, x1: FLOOR.maxX, z0: rz(0), z1: rz(L.concourseV) },
  { id: "spine", name: "SPINE", x0: FLOOR.minX, x1: FLOOR.maxX, z0: rz(L.spineV0), z1: rz(L.spineV1) },
  { id: "restroom", name: "RESTROOMS", x0: FLOOR.minX, x1: L.cleanerX, z0: rz(L.spineV1), z1: rz(L.westRoomsV) },
  { id: "cleaner", name: "CLEANER'S STORE", x0: L.cleanerX, x1: L.roomsX.west, z0: rz(L.spineV1), z1: rz(L.westRoomsV) },
  { id: "break", name: "BREAK & TRAINING", x0: FLOOR.minX, x1: L.roomsX.west, z0: rz(L.westRoomsV), z1: rz(18.2) },
  { id: "dock", name: "RECEIVING AND STAGING", x0: L.roomsX.west, x1: L.roomsX.east, z0: rz(L.spineV1), z1: rz(18.2) },
  { id: "repair", name: "GENIUS ROOM: REPAIR", x0: L.roomsX.east, x1: FLOOR.maxX, z0: rz(L.spineV1), z1: rz(L.repairV1) },
  { id: "office", name: "MANAGER'S OFFICE", x0: L.roomsX.east, x1: FLOOR.maxX, z0: rz(L.repairV1), z1: rz(18.2) },
];

// Shelving: six banks, each two back-to-back rolling units, in two runs of
// three. Main aisles are at least 1.35 m, the passages between banks 1.0 m.
export const BACK_SHELF_ROW_Z = [rz(4.0), rz(6.7)] as const;
export const BACK_SHELF_UNIT_X = [-4.4, -0.8, 2.6] as const;
const UNIT_D = 0.62;
export const BACK_SHELVES: Box[] = BACK_SHELF_ROW_Z.flatMap((z) =>
  BACK_SHELF_UNIT_X.flatMap((x) => [-1, 1].map((s) => ({ x, z: z + (s * UNIT_D) / 2, w: 2.4, d: UNIT_D, h: 2.4 }))),
);

// Two repair benches where technicians work, along the east wall of the repair
// room, so it is next to the staff lane. A technician stands on the west side.
export const SERVICE_DESKS: Box[] = [
  { x: 5.55, z: rz(12.0), w: 0.8, d: 2.0, h: 0.95 },
  { x: 5.55, z: rz(14.1), w: 0.8, d: 2.0, h: 0.95 },
];

// Walls between the areas, with doorways. A wall is split into segments
// around each gap, so a solid is a segment and a doorway is a real gap.
export const DOORWAY_W = 1.0;
const WALL_T = 0.12;
const WALL_H = 2.6;
type Gap = [number, number];
function wallAlongX(z: number, x0: number, x1: number, gaps: Gap[]): Box[] {
  const stops = [x0, ...gaps.flatMap(([a, b]) => [a, b]), x1];
  const out: Box[] = [];
  for (let i = 0; i < stops.length; i += 2) {
    const w = stops[i + 1] - stops[i];
    if (w > 1e-6) out.push({ x: (stops[i] + stops[i + 1]) / 2, z, w, d: WALL_T, h: WALL_H });
  }
  return out;
}
function wallAlongZ(x: number, v0: number, v1: number, gaps: Gap[]): Box[] {
  const stops = [v0, ...gaps.flatMap(([a, b]) => [a, b]), v1];
  const out: Box[] = [];
  for (let i = 0; i < stops.length; i += 2) {
    const d = stops[i + 1] - stops[i];
    if (d > 1e-6) out.push({ x, z: rz((stops[i] + stops[i + 1]) / 2), w: WALL_T, d, h: WALL_H });
  }
  return out;
}
export interface BackDoorway {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number; // clear opening
  axis: "x" | "z"; // the wall it is in runs along this axis
}
export const BACK_DOORWAYS: BackDoorway[] = [
  { id: "restroom", name: "RESTROOMS", x: -4.7, z: rz(L.spineV1), w: 1.0, axis: "x" },
  { id: "cleaner", name: "CLEANER", x: -2.8, z: rz(L.spineV1), w: 1.0, axis: "x" },
  { id: "dock", name: "RECEIVING", x: 0, z: rz(L.spineV1), w: 4.4, axis: "x" },
  { id: "repair", name: "GENIUS ROOM", x: 3.7, z: rz(L.spineV1), w: 1.0, axis: "x" },
  { id: "break", name: "BREAK & TRAINING", x: L.roomsX.west, z: rz(15.0), w: 1.0, axis: "z" },
  { id: "office", name: "MANAGER", x: L.roomsX.east, z: rz(17.0), w: 1.0, axis: "z" },
];
const gapX = (id: string): Gap => {
  const d = BACK_DOORWAYS.find((k) => k.id === id)!;
  return [d.x - d.w / 2, d.x + d.w / 2];
};
const gapV = (id: string): Gap => {
  const d = BACK_DOORWAYS.find((k) => k.id === id)!;
  return [d.z - BACK_ROOM_Z0 - d.w / 2, d.z - BACK_ROOM_Z0 + d.w / 2];
};
export const BACK_WALLS: Box[] = [
  // the spine's far wall, with a doorway into each room
  ...wallAlongX(rz(L.spineV1), FLOOR.minX, FLOOR.maxX, ["restroom", "cleaner", "dock", "repair"].map(gapX).sort((a, b) => a[0] - b[0])),
  // receiving's two side walls, with a door to the break room and to the office
  ...wallAlongZ(L.roomsX.west, L.spineV1, 18.2, [gapV("break")]),
  ...wallAlongZ(L.roomsX.east, L.spineV1, 18.2, [gapV("office")]),
  // between the restrooms and the cleaner's store, and above them
  ...wallAlongZ(L.cleanerX, L.spineV1, L.westRoomsV, []),
  ...wallAlongX(rz(L.westRoomsV), FLOOR.minX, L.roomsX.west, []),
  // between repair and the office
  ...wallAlongX(rz(L.repairV1), L.roomsX.east, FLOOR.maxX, []),
];

export type BackKind = "desk" | "table" | "computers" | "lockers" | "restroom" | "pallet";
export interface BackThing extends Box {
  kind: BackKind;
  label?: string;
}
export const BACK_FURNITURE: BackThing[] = [
  { kind: "lockers", label: "lockers", x: -5.7, z: rz(1.6), w: 0.5, d: 2.8, h: 1.9 },
  { kind: "desk", label: "manager", x: 4.4, z: rz(16.9), w: 1.6, d: 0.8, h: 0.75 },
  { kind: "table", label: "break table", x: -4.8, z: rz(14.4), w: 1.2, d: 0.9, h: 0.75 },
  { kind: "computers", label: "training computers", x: -3.0, z: rz(16.9), w: 0.7, d: 2.4, h: 0.75 },
  { kind: "restroom", label: "restrooms", x: -4.7, z: rz(12.55), w: 2.4, d: 1.5, h: WALL_H },
  { kind: "pallet", label: "deliveries", x: -1.0, z: rz(16.7), w: 1.0, d: 1.0, h: 0.9 },
  { kind: "pallet", label: "deliveries", x: 1.0, z: rz(16.7), w: 1.0, d: 1.0, h: 1.1 },
];
// the back door onto the loading dock, in the far wall
export const BACK_DOOR = { minX: -2.0, maxX: 2.0 } as const;

// The flush staff door in the back wall, left of the bar.
// On the visitor's LEFT of the bar as they face it, which is the +x side
// (facing +z, the visitor's right hand is -x).
export const DOOR = { minX: BAR_HALF + 0.4, maxX: BAR_HALF + 1.4 } as const;

// Product walls on both side walls: three recessed bays between piers, toward
// the back of the shop. The bays are indented into the wall.
export const BAY_COUNT = 3;
export const BAY_W = 0.9;
export const PIER_W = 0.2;
// The bays run to 0.8 m short of the back wall; the wall bench stops where they start.
export const BAY_START_Z = FLOOR.maxZ - 0.8 - (BAY_COUNT * BAY_W + (BAY_COUNT + 1) * PIER_W);
export function bayCentre(i: number): number {
  return BAY_START_Z + PIER_W + BAY_W / 2 + i * (BAY_W + PIER_W);
}

// Everything solid. Customers are also stopped by the bar partitions (they
// cannot get behind the bar); staff can pass them.
const COMMON_SOLIDS: Box[] = [
  ...TABLES,
  ...BENCHES,
  COUNTER,
  ...BACK_SHELVES,
  ...SERVICE_DESKS,
  ...BACK_WALLS,
  ...BACK_FURNITURE,
];
export const SOLIDS: Box[] = [...COMMON_SOLIDS, ...PARTITIONS];

export function solidsFor(role: Role): Box[] {
  return role === "staff" ? COMMON_SOLIDS : SOLIDS;
}

// Walkable areas. A point outside them is pulled to the nearest edge.
const BAR_FRONT_Z = COUNTER.z - COUNTER.d / 2;
const BAR_X = Math.abs(PARTITIONS[0].x) + PARTITIONS[0].w / 2;
// The first-floor walkway outside the glass, through the entrance opening:
// anyone may step out to the balustrade and look down into the atrium. Its
// balustrade is 0.5 m past the far edge (the glass front is 0.5 m outside the
// floor).
export const WALKWAY: Rect = {
  minX: -10,
  maxX: 10,
  minZ: FLOOR.minZ - 0.5 - WALKWAY_DEPTH + 0.5,
  maxZ: FLOOR.minZ - 0.65,
};
// Whoever stands in here, just inside the entrance, is who the greeter goes up to (Ritesh, 2026-10-21).
export const ENTRANCE_ZONE: Rect = { minX: -3.5, maxX: 3.5, minZ: FLOOR.minZ, maxZ: FLOOR.minZ + 3.5 };
const ENTRANCE: Rect = {
  minX: -ENTRANCE_HALF + 0.3,
  maxX: ENTRANCE_HALF - 0.3,
  minZ: FLOOR.minZ - 0.7,
  maxZ: FLOOR.minZ + 0.1,
};
const OUTSIDE: Rect[] = [WALKWAY, ENTRANCE];
const CUSTOMER_RECTS: Rect[] = [
  { ...FLOOR, maxZ: BAR_FRONT_Z },
  { minX: FLOOR.minX, maxX: -BAR_X, minZ: BAR_FRONT_Z, maxZ: FLOOR.maxZ },
  { minX: BAR_X, maxX: FLOOR.maxX, minZ: BAR_FRONT_Z, maxZ: FLOOR.maxZ },
  ...OUTSIDE,
];
const DOORWAY: Rect = { minX: DOOR.minX + 0.1, maxX: DOOR.maxX - 0.1, minZ: FLOOR.maxZ - 0.1, maxZ: BACK_ROOM_Z0 + 0.5 };
const BACK_ROOM: Rect = { minX: FLOOR.minX, maxX: FLOOR.maxX, minZ: BACK_ROOM_Z0 + 0.3, maxZ: BACK_ROOM_Z1 - 0.3 };
const STAFF_RECTS: Rect[] = [{ ...FLOOR }, DOORWAY, BACK_ROOM, ...OUTSIDE];

export function clampToWalkable(role: Role, x: number, z: number): { x: number; z: number } {
  const rects = role === "staff" ? STAFF_RECTS : CUSTOMER_RECTS;
  let best = { x, z };
  let bestD = Infinity;
  for (const r of rects) {
    const cx = Math.min(r.maxX, Math.max(r.minX, x));
    const cz = Math.min(r.maxZ, Math.max(r.minZ, z));
    const dist = Math.hypot(cx - x, cz - z);
    if (dist < bestD) {
      bestD = dist;
      best = { x: cx, z: cz };
      if (dist === 0) break;
    }
  }
  return best;
}

// Radius of a visitor's body, used for collision.
export const BODY_RADIUS = 0.3;

// Push a point out of every box it overlaps (circle against box), then return
// the corrected point.
export function resolveCollisions(x: number, z: number, role: Role = "customer"): { x: number; z: number } {
  for (const b of solidsFor(role)) {
    const minX = b.x - b.w / 2;
    const maxX = b.x + b.w / 2;
    const minZ = b.z - b.d / 2;
    const maxZ = b.z + b.d / 2;
    const nx = Math.max(minX, Math.min(x, maxX));
    const nz = Math.max(minZ, Math.min(z, maxZ));
    const dx = x - nx;
    const dz = z - nz;
    const dist = Math.hypot(dx, dz);
    if (dist < BODY_RADIUS) {
      if (dist > 1e-6) {
        x = nx + (dx / dist) * BODY_RADIUS;
        z = nz + (dz / dist) * BODY_RADIUS;
      } else {
        const left = x - minX;
        const right = maxX - x;
        const front = z - minZ;
        const back = maxZ - z;
        const m = Math.min(left, right, front, back);
        if (m === left) x = minX - BODY_RADIUS;
        else if (m === right) x = maxX + BODY_RADIUS;
        else if (m === front) z = minZ - BODY_RADIUS;
        else z = maxZ + BODY_RADIUS;
      }
    }
  }
  return { x, z };
}

// People do not walk through each other (Ritesh, 2026-10-11). Push a point out
// of every other person's body: two bodies of BODY_RADIUS may touch but not
// overlap. A person standing exactly on top of another is nudged along x so the
// result is deterministic.
export function separateFromPeople(
  x: number,
  z: number,
  others: ReadonlyArray<{ x: number; z: number }>,
): { x: number; z: number } {
  const min = BODY_RADIUS * 2;
  for (let pass = 0; pass < 4; pass++) {
    for (const o of others) {
      const dx = x - o.x;
      const dz = z - o.z;
      const d = Math.hypot(dx, dz);
      if (d >= min) continue;
      if (d < 1e-6) {
        x = o.x + min;
      } else {
        x = o.x + (dx / d) * min;
        z = o.z + (dz / d) * min;
      }
    }
  }
  return { x, z };
}
