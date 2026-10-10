import { FLOOR, type Pose } from "./protocol.ts";
import { BACK_ROOM_Z0, BENCHES, COLUMN_X, COUNTER, DOOR, TABLES } from "./world.ts";

// NPCs are a pure function of the server's clock, not a simulation. Every
// client computes the same position for the same moment, so the store looks
// the same to everyone, nothing needs a server tick (the Fly machine stops
// when idle), and a restart changes nothing. Each NPC walks between waypoints
// inside its own obstacle-free zones, then stands for a while. A role decides
// where an NPC usually roams.

export interface Zone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type NpcRole =
  | "greeter"
  | "specialist"
  | "genius"
  | "stock"
  | "technician"
  | "customer";

export interface NpcDef {
  id: string;
  role: NpcRole;
  colour: string; // shirt
  cap?: string; // staff cap colour
  // Waypoint k is chosen in zones[k % zones.length]. One zone = wander in it;
  // two zones = go back and forth between them (e.g. through the door).
  zones: Zone[];
  period: number; // ms per waypoint: walk for half of it, then stand
  phase: number; // ms offset so NPCs are not in step
  seed: number;
  // Stays at a station and works (technicians): tiny zone, working pose.
  working?: boolean;
}

export const isStaff = (n: NpcDef): boolean => n.role !== "customer";

const CAPS: Record<Exclude<NpcRole, "customer">, string> = {
  greeter: "#4caf50",
  specialist: "#ffd23f",
  genius: "#ff6f61",
  stock: "#9c6ade",
  technician: "#29b6f6",
};

const SHIRT_STAFF = "#2f5d9e";

function staff(
  id: string,
  role: Exclude<NpcRole, "customer">,
  zones: Zone[],
  period: number,
  phase: number,
  seed: number,
  working = false,
): NpcDef {
  return { id, role, colour: SHIRT_STAFF, cap: CAPS[role], zones, period, phase, seed, working };
}

function customer(id: string, colour: string, zone: Zone, period: number, phase: number, seed: number): NpcDef {
  return { id, role: "customer", colour, zones: [zone], period, phase, seed };
}

// Lanes between the three table columns and beside the wall benches, worked
// out from where the tables and benches are (src/shared/layout.json), so they
// follow an edit of the layout. Each keeps 0.35 m off whatever is beside it.
const PRODUCTS = TABLES.filter((t) => !t.service);
const HALF = Math.max(...PRODUCTS.map((t) => t.w)) / 2;
const MARGIN = 0.35;
const LANE = {
  outerL: { minX: BENCHES[0].x + BENCHES[0].w / 2 + MARGIN, maxX: COLUMN_X[0] - HALF - MARGIN },
  a: { minX: COLUMN_X[0] + HALF + MARGIN, maxX: COLUMN_X[1] - HALF - MARGIN },
  b: { minX: COLUMN_X[1] + HALF + MARGIN, maxX: COLUMN_X[2] - HALF - MARGIN },
  outerR: { minX: COLUMN_X[2] + HALF + MARGIN, maxX: BENCHES[1].x - BENCHES[1].w / 2 - MARGIN },
};
// from just inside the entrance clear zone to just before the service tables
const FIRST_FRONT = Math.min(...PRODUCTS.map((t) => t.z - t.d / 2));
const SERVICE_FRONT = Math.min(...TABLES.filter((t) => t.service).map((t) => t.z - t.d / 2));
const SHOP_Z = { minZ: FIRST_FRONT + 0.2, maxZ: SERVICE_FRONT - 0.3 };
// the reception space between the glass and the first tables
const FRONT_Z = { minZ: FLOOR.minZ + 0.8, maxZ: FIRST_FRONT - 0.5 };
// the strip behind the bar, between its back edge and the wall
const BEHIND_BAR = { minZ: COUNTER.z + COUNTER.d / 2 + 0.15, maxZ: FLOOR.maxZ - 0.15 };
const BR = BACK_ROOM_Z0;

// Zones are rectangles that contain no table, bench, bar or shelf, so a
// straight line between two points in a zone never crosses one.
export const NPCS: NpcDef[] = [
  // at the door of the shop
  staff("greeter-1", "greeter", [{ minX: -2, maxX: 2, ...FRONT_Z }], 10000, 0, 1),
  // one specialist per product lane
  staff("spec-phones", "specialist", [{ ...LANE.outerL, ...SHOP_Z }], 12000, 1500, 2),
  staff("spec-laptops", "specialist", [{ ...LANE.a, ...SHOP_Z }], 12000, 6000, 3),
  staff("spec-tablets", "specialist", [{ ...LANE.b, ...SHOP_Z }], 12000, 3000, 4),
  staff("spec-audio", "specialist", [{ ...LANE.outerR, ...SHOP_Z }], 12000, 9000, 5),
  // behind the service bar
  staff("genius-1", "genius", [{ minX: -2.9, maxX: -0.6, ...BEHIND_BAR }], 9000, 0, 6),
  staff("genius-2", "genius", [{ minX: 0.6, maxX: 2.9, ...BEHIND_BAR }], 10000, 3500, 7),
  // fetches stock: out of the door, along the aisle, back again
  staff(
    "stock-runner",
    "stock",
    [
      { minX: DOOR.minX + 0.1, maxX: DOOR.maxX - 0.1, minZ: FLOOR.maxZ - 0.5, maxZ: FLOOR.maxZ - 0.1 },
      { minX: DOOR.minX + 0.1, maxX: DOOR.maxX - 0.1, minZ: BR + 0.5, maxZ: BR + 1.3 },
    ],
    11000,
    2000,
    8,
  ),
  // back room, in the aisles between shelving
  staff("stock-1", "stock", [{ minX: -3.8, maxX: -0.9, minZ: BR + 2.7, maxZ: BR + 3.9 }], 11000, 5000, 9),
  staff("stock-2", "stock", [{ minX: 0.9, maxX: 3.8, minZ: BR + 5.4, maxZ: BR + 6.4 }], 11000, 8000, 10),
  // technicians at the repair benches
  staff("tech-1", "technician", [{ minX: -2.7, maxX: -1.7, minZ: BR + 7.9, maxZ: BR + 8.3 }], 12000, 0, 11, true),
  staff("tech-2", "technician", [{ minX: 1.7, maxX: 2.7, minZ: BR + 7.9, maxZ: BR + 8.3 }], 12000, 4000, 12, true),
  // customers
  customer("cust-front", "#e07a5f", { minX: -3.2, maxX: 3.2, ...FRONT_Z }, 11000, 500, 21),
  customer("cust-a", "#81b29a", { ...LANE.a, ...SHOP_Z }, 12000, 4000, 22),
  customer("cust-b", "#f2cc8f", { ...LANE.b, ...SHOP_Z }, 12000, 8000, 23),
  customer("cust-c", "#9b72aa", { ...LANE.outerL, ...SHOP_Z }, 12000, 2500, 24),
  customer("cust-d", "#6d9dc5", { ...LANE.outerR, ...SHOP_Z }, 12000, 10000, 25),
  customer("cust-e", "#d4a373", { ...LANE.a, ...SHOP_Z }, 13000, 9000, 26),
  customer("cust-f", "#7a9e7e", { ...LANE.b, ...SHOP_Z }, 13000, 1000, 27),
];

// Deterministic value in [0, 1) from an integer (one round of mulberry32).
function rand(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const WALK_FRACTION = 0.5;

function waypoint(def: NpcDef, k: number): { x: number; z: number } {
  const zone = def.zones[((k % def.zones.length) + def.zones.length) % def.zones.length];
  const s = def.seed * 7919 + k * 104729;
  return {
    x: zone.minX + rand(s) * (zone.maxX - zone.minX),
    z: zone.minZ + rand(s + 1) * (zone.maxZ - zone.minZ),
  };
}

export interface NpcPose extends Pose {
  walking: boolean;
}

// Where an NPC is, which way it faces and whether it is mid-stride, at server
// time `nowMs`.
export function npcPose(def: NpcDef, nowMs: number): NpcPose {
  const t = nowMs + def.phase;
  const k = Math.floor(t / def.period);
  const u = (t - k * def.period) / def.period;
  const a = waypoint(def, k);
  const b = waypoint(def, k + 1);
  const p = Math.min(1, u / WALK_FRACTION);
  const e = p * p * (3 - 2 * p); // ease in and out
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const walking = u < WALK_FRACTION && Math.hypot(dx, dz) > 0.05 && !def.working;
  // heading convention: 0 faces -z (see protocol.ts). Workers face the bench.
  const ry = def.working ? 0 : Math.atan2(-dx, -dz);
  return { x: a.x + dx * e, z: a.z + dz * e, ry, walking };
}
