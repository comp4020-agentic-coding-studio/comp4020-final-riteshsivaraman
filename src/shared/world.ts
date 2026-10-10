import { FLOOR, type Role } from "./protocol.ts";

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

// Three columns of tables at -1/4, 0 and +1/4 of the room width, as in the
// reference photo. Tables run front to back (Ritesh: vertical on the plan),
// about a tenth of the room's width across; products stand along both long
// sides. Three tables down each side column, two down the middle.
export const COLUMN_X = [-2.5, 0, 2.5] as const;
export const SIDE_ROW_Z = [-2.85, -0.35, 2.15] as const;
export const CENTRE_ROW_Z = [-2.1, 1.4] as const;
export const TABLE_W = 1.05; // across the room (x)
export const TABLE_LEN = 1.9; // front to back (z)
export const TABLES: Box[] = [
  ...[COLUMN_X[0], COLUMN_X[2]].flatMap((x) =>
    SIDE_ROW_Z.map((z) => ({ x, z, w: TABLE_W, d: TABLE_LEN, h: 0.9 })),
  ),
  ...CENTRE_ROW_Z.map((z) => ({ x: COLUMN_X[1], z, w: TABLE_W, d: TABLE_LEN, h: 0.9 })),
];

// Long benches along both side walls, carrying devices.
export const BENCHES: Box[] = [
  { x: -4.72, z: 0, w: 0.56, d: 8.6, h: 0.95 },
  { x: 4.72, z: 0, w: 0.56, d: 8.6, h: 0.95 },
];

// The service bar along the back and the partitions that close off the staff
// space behind it.
export const COUNTER: Box = { x: 0, z: 4.0, w: 5, d: 0.8, h: 1.05 };
export const PARTITIONS: Box[] = [
  { x: -2.5, z: 4.7, w: 0.12, d: 0.6, h: 1.05 },
  { x: 2.5, z: 4.7, w: 0.12, d: 0.6, h: 1.05 },
];

// The back room: same footprint as the store, behind the back wall. Its first
// row of shelving starts after the wall (the wall's inner face is at maxZ+0.4).
export const WALL_FACE_Z = FLOOR.maxZ + 0.4;
export const BACK_ROOM_Z0 = WALL_FACE_Z + 0.2;
export const BACK_ROOM_Z1 = BACK_ROOM_Z0 + (FLOOR.maxZ - FLOOR.minZ);

export const BACK_SHELF_ROW_Z = [BACK_ROOM_Z0 + 2.0, BACK_ROOM_Z0 + 4.6] as const;
export const BACK_SHELF_UNIT_X = [-3.1, 0, 3.1] as const;
export const BACK_SHELVES: Box[] = BACK_SHELF_ROW_Z.flatMap((z) =>
  BACK_SHELF_UNIT_X.map((x) => ({ x, z, w: 2.7, d: 0.62, h: 2.4 })),
);

// Two repair benches where technicians work, near the back of the back room.
export const SERVICE_DESKS: Box[] = [
  { x: -2.2, z: BACK_ROOM_Z0 + 7.2, w: 2.4, d: 0.8, h: 0.95 },
  { x: 2.2, z: BACK_ROOM_Z0 + 7.2, w: 2.4, d: 0.8, h: 0.95 },
];

// The flush staff door in the back wall, left of the bar.
// On the visitor's LEFT of the bar as they face it, which is the +x side
// (facing +z, the visitor's right hand is -x).
export const DOOR = { minX: 2.9, maxX: 3.9 } as const;

// Product walls on both side walls: three recessed bays between piers, toward
// the back of the shop. The bays are indented into the wall.
export const BAY_COUNT = 3;
export const BAY_W = 0.9;
export const PIER_W = 0.2;
export const BAY_START_Z = 0.7;
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
];
export const SOLIDS: Box[] = [...COMMON_SOLIDS, ...PARTITIONS];

export function solidsFor(role: Role): Box[] {
  return role === "staff" ? COMMON_SOLIDS : SOLIDS;
}

// Walkable areas. A point outside them is pulled to the nearest edge.
const BAR_FRONT_Z = COUNTER.z - COUNTER.d / 2;
const BAR_X = Math.abs(PARTITIONS[0].x) + PARTITIONS[0].w / 2;
const CUSTOMER_RECTS: Rect[] = [
  { ...FLOOR, maxZ: BAR_FRONT_Z },
  { minX: FLOOR.minX, maxX: -BAR_X, minZ: BAR_FRONT_Z, maxZ: FLOOR.maxZ },
  { minX: BAR_X, maxX: FLOOR.maxX, minZ: BAR_FRONT_Z, maxZ: FLOOR.maxZ },
];
const DOORWAY: Rect = { minX: DOOR.minX + 0.1, maxX: DOOR.maxX - 0.1, minZ: FLOOR.maxZ - 0.1, maxZ: BACK_ROOM_Z0 + 0.5 };
const BACK_ROOM: Rect = { minX: FLOOR.minX, maxX: FLOOR.maxX, minZ: BACK_ROOM_Z0 + 0.3, maxZ: BACK_ROOM_Z1 - 0.3 };
const STAFF_RECTS: Rect[] = [{ ...FLOOR }, DOORWAY, BACK_ROOM];

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
