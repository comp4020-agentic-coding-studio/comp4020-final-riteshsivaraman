import type { Pose } from "./protocol.ts";

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

// Lanes between the three table columns (tables are 1.7 m wide, centred at
// x = -4, 0 and 4), and the outer lanes beside the wall benches.
const LANE = {
  outerL: { minX: -6.8, maxX: -5.2 },
  a: { minX: -2.9, maxX: -1.1 },
  b: { minX: 1.1, maxX: 2.9 },
  outerR: { minX: 5.2, maxX: 6.8 },
};
const SHOP_Z = { minZ: -5.8, maxZ: 4.9 };

// Zones are rectangles that contain no table, bench, bar or shelf, so a
// straight line between two points in a zone never crosses one.
export const NPCS: NpcDef[] = [
  // at the door of the shop
  staff("greeter-1", "greeter", [{ minX: -3, maxX: 3, minZ: -6.8, maxZ: -5.4 }], 10000, 0, 1),
  // one specialist per product lane
  staff("spec-phones", "specialist", [{ ...LANE.outerL, ...SHOP_Z }], 12000, 1500, 2),
  staff("spec-laptops", "specialist", [{ ...LANE.a, ...SHOP_Z }], 12000, 6000, 3),
  staff("spec-tablets", "specialist", [{ ...LANE.b, ...SHOP_Z }], 12000, 3000, 4),
  staff("spec-audio", "specialist", [{ ...LANE.outerR, ...SHOP_Z }], 12000, 9000, 5),
  // behind the service bar
  staff("genius-1", "genius", [{ minX: -5.5, maxX: -1.0, minZ: 6.4, maxZ: 7.3 }], 9000, 0, 6),
  staff("genius-2", "genius", [{ minX: 1.0, maxX: 5.5, minZ: 6.4, maxZ: 7.3 }], 10000, 3500, 7),
  // fetches stock: out of the door, along the aisle, back again
  staff(
    "stock-runner",
    "stock",
    [
      { minX: -7.5, maxX: -6.7, minZ: 6.6, maxZ: 7.2 },
      { minX: -7.5, maxX: -6.7, minZ: 8.8, maxZ: 10.3 },
    ],
    11000,
    2000,
    8,
  ),
  // back room, in the aisles between shelving
  staff("stock-1", "stock", [{ minX: -6.2, maxX: -1.5, minZ: 11.8, maxZ: 14.4 }], 11000, 5000, 9),
  staff("stock-2", "stock", [{ minX: 1.5, maxX: 6.2, minZ: 16, maxZ: 18.1 }], 11000, 8000, 10),
  // technicians at the repair benches
  staff("tech-1", "technician", [{ minX: -4.1, maxX: -2.9, minZ: 20.1, maxZ: 20.5 }], 12000, 0, 11, true),
  staff("tech-2", "technician", [{ minX: 2.9, maxX: 4.1, minZ: 20.1, maxZ: 20.5 }], 12000, 4000, 12, true),
  // customers
  customer("cust-front", "#e07a5f", { minX: -4, maxX: 4, minZ: -6.8, maxZ: -5.4 }, 11000, 500, 21),
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
