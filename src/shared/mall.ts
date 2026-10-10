// The mall around the store: a concourse along the glass front, shopfronts on
// both sides, and a mezzanine walkway opposite. Like the store's NPCs, the
// people here are a pure function of the server clock, so every visitor sees
// the same shoppers walk past, the same few come in, wander, and leave.
//
// z is the same axis as the store. Every z below was set for a shop whose glass
// front was at z = -5; D moves the whole mall back by however much deeper the
// shop is now, so the concourse sits in front of the glass wherever it is.
import { FLOOR, STORE_Y, WALKWAY_DEPTH } from "./protocol.ts";

const D = FLOOR.minZ + 5;

// The store is on the first floor (STORE_Y), as in a mall atrium: outside the
// glass is a walkway with a balustrade, then the void down to the ground-floor
// concourse (shopfronts under the walkway and opposite), and the opposite
// first-floor shopfronts with their own walkway.
export const MALL = {
  minX: -34,
  maxX: 34,
  frontZ: FLOOR.minZ - 0.5, // the store's glass front
  walkwayZ: FLOOR.minZ - 0.5 - WALKWAY_DEPTH, // the balustrade, looking down into the atrium
  farZ: D - 26, // the opposite shopfronts
  ceilingY: STORE_Y + 5.6, // high atrium roof
  mezzanineY: STORE_Y, // the opposite walkway, level with the store
  mezzanineZ0: D - 26, // slab runs from the far shopfronts...
  mezzanineZ1: D - 19.5, // ...to its glass balustrade
  upperWalkZ: [D - 21.8, D - 20.6],
} as const;

export interface RoutePoint {
  x: number;
  z: number;
  pause?: number; // ms to stand here on arrival
}

export type RouteKind = "passer" | "shopper" | "upper";

export interface Route {
  id: string;
  kind: RouteKind;
  y: number; // height of the floor they walk on
  speed: number; // metres per second
  phase: number; // ms offset
  colour: string;
  points: RoutePoint[]; // a closed loop: the last point leads back to the first
}

const GROUND = 0;
const FIRST = STORE_Y; // the walkway and the store: feet on the first-floor slab

const passer = (id: string, colour: string, speed: number, phase: number, points: RoutePoint[], y = GROUND): Route => ({
  id,
  kind: "passer",
  y,
  speed,
  phase,
  colour,
  points,
});

// Lanes on the first-floor walkway, from the glass outward.
const W_NEAR = MALL.frontZ - 0.9; // window-shopping, close to the glass
const W_MID = MALL.frontZ - 1.7; // the lane customers walk in from
const W_RAIL = MALL.frontZ - 2.6; // the lane back, by the balustrade
// Lanes on the ground-floor concourse, below and beyond the walkway.
const G = (k: number): number => MALL.walkwayZ - k;

// Ways in and out. They come along the walkway, go through the opening in the
// glass (|x| <= ENTRANCE_HALF) and then up an aisle between the tables.
const DOOR_Z = FLOOR.minZ - 0.7; // just outside the glass
const IN_Z = FLOOR.minZ + 0.4; // just inside, in the clear zone before the first tables

const shopper = (id: string, colour: string, phase: number, laneX: number, stops: RoutePoint[]): Route => ({
  id,
  kind: "shopper",
  y: FIRST,
  speed: 1.15,
  phase,
  colour,
  points: [
    { x: -30, z: W_MID },
    { x: laneX, z: W_MID },
    { x: laneX, z: DOOR_Z },
    { x: laneX, z: IN_Z },
    ...stops,
    { x: laneX, z: IN_Z },
    { x: laneX, z: DOOR_Z },
    { x: laneX, z: W_MID },
    { x: 30, z: W_MID },
    { x: 30, z: W_RAIL },
    { x: -30, z: W_RAIL },
  ],
});

export const ROUTES: Route[] = [
  // people on the ground-floor concourse, seen from above: two ways along it
  passer("walker-1", "#c9a227", 1.25, 0, [
    { x: -30, z: G(2) },
    { x: 30, z: G(2) },
    { x: 30, z: G(3) },
    { x: -30, z: G(3) },
  ]),
  passer("walker-2", "#8a5a9e", 1.1, 21000, [
    { x: 30, z: G(5) },
    { x: -30, z: G(5) },
    { x: -30, z: G(6.5) },
    { x: 30, z: G(6.5) },
  ]),
  passer("walker-3", "#4a8f7a", 1.4, 9000, [
    { x: -30, z: G(9) },
    { x: 30, z: G(9) },
    { x: 30, z: G(10.5) },
    { x: -30, z: G(10.5) },
  ]),
  passer("walker-4", "#b5651d", 1.0, 40000, [
    { x: -12, z: G(4), pause: 6000 },
    { x: 4, z: G(4) },
    { x: 8, z: G(7.5), pause: 9000 },
    { x: -6, z: G(8) },
  ]),
  passer("walker-5", "#3d7ea6", 1.15, 66000, [
    { x: 14, z: G(3.5) },
    { x: -2, z: G(3.5), pause: 7000 },
    { x: -14, z: G(9.5), pause: 5000 },
    { x: 10, z: G(9.5) },
  ]),
  // window shoppers on the walkway: stop and look in at the glass
  passer(
    "window-1",
    "#d46a4e",
    1.0,
    33000,
    [
      { x: -30, z: W_NEAR },
      { x: -4.5, z: W_NEAR, pause: 7000 },
      { x: 4.5, z: W_NEAR, pause: 5000 },
      { x: 30, z: W_NEAR },
      { x: 30, z: W_RAIL },
      { x: -30, z: W_RAIL },
    ],
    FIRST,
  ),
  passer(
    "window-2",
    "#5b7fb5",
    1.05,
    52000,
    [
      { x: 30, z: W_NEAR },
      { x: 7, z: W_NEAR, pause: 6000 },
      { x: -30, z: W_NEAR },
      { x: -30, z: W_RAIL },
      { x: 30, z: W_RAIL },
    ],
    FIRST,
  ),
  // customers: come along the walkway, in through the opening, look at a table
  // or two, leave
  shopper("shopper-1", "#e07a5f", 4000, 1.25, [
    { x: 1.25, z: FLOOR.minZ + 4.5, pause: 9000 },
    { x: 1.25, z: FLOOR.minZ + 8.0, pause: 6000 },
  ]),
  shopper("shopper-2", "#81b29a", 61000, -1.25, [
    { x: -1.25, z: FLOOR.minZ + 5.5, pause: 8000 },
    { x: -1.25, z: FLOOR.minZ + 9.0, pause: 7000 },
  ]),
  shopper("shopper-3", "#f2cc8f", 98000, 1.25, [
    { x: 4.6, z: IN_Z },
    { x: 4.6, z: FLOOR.minZ + 3.5, pause: 10000 },
    { x: 4.6, z: FLOOR.minZ + 8.5, pause: 6000 },
    { x: 4.6, z: IN_Z },
  ]),
  // across the way, on the opposite first-floor walkway
  {
    id: "upper-1",
    kind: "upper",
    y: FIRST,
    speed: 1.2,
    phase: 0,
    colour: "#b5651d",
    points: [
      { x: -28, z: MALL.upperWalkZ[0] },
      { x: 28, z: MALL.upperWalkZ[0] },
      { x: 28, z: MALL.upperWalkZ[1] },
      { x: -28, z: MALL.upperWalkZ[1] },
    ],
  },
  {
    id: "upper-2",
    kind: "upper",
    y: FIRST,
    speed: 1.0,
    phase: 40000,
    colour: "#3d7ea6",
    points: [
      { x: 28, z: MALL.upperWalkZ[1] },
      { x: 6, z: D - 20.2, pause: 9000 },
      { x: -28, z: MALL.upperWalkZ[1] },
      { x: -28, z: MALL.upperWalkZ[0] },
      { x: 28, z: MALL.upperWalkZ[0] },
    ],
  },
  {
    id: "upper-3",
    kind: "upper",
    y: FIRST,
    speed: 1.15,
    phase: 71000,
    colour: "#8c4f8c",
    points: [
      { x: -20, z: D - 20.2, pause: 12000 },
      { x: 20, z: D - 20.2 },
      { x: 20, z: MALL.upperWalkZ[0] },
      { x: -20, z: MALL.upperWalkZ[0] },
    ],
  },
];

interface Timing {
  segMs: number[]; // time to walk each segment (point i to point i+1)
  pauseMs: number[]; // pause on arrival at point i+1
  total: number;
}

const timings = new WeakMap<Route, Timing>();

function timing(r: Route): Timing {
  let t = timings.get(r);
  if (!t) {
    const n = r.points.length;
    const segMs: number[] = [];
    const pauseMs: number[] = [];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const a = r.points[i];
      const b = r.points[(i + 1) % n];
      const ms = (Math.hypot(b.x - a.x, b.z - a.z) / r.speed) * 1000;
      segMs.push(ms);
      pauseMs.push(b.pause ?? 0);
      total += ms + (b.pause ?? 0);
    }
    t = { segMs, pauseMs, total };
    timings.set(r, t);
  }
  return t;
}

export interface RoutePose {
  x: number;
  y: number;
  z: number;
  ry: number; // 0 faces -z
  walking: boolean;
}

// Where a route's person is at server time `nowMs`. Walks segment by segment,
// standing still for each point's pause.
export function routePose(r: Route, nowMs: number): RoutePose {
  const t = timing(r);
  let u = (((nowMs + r.phase) % t.total) + t.total) % t.total;
  const n = r.points.length;
  for (let i = 0; i < n; i++) {
    const a = r.points[i];
    const b = r.points[(i + 1) % n];
    const heading = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    if (u < t.segMs[i]) {
      const f = t.segMs[i] === 0 ? 1 : u / t.segMs[i];
      return { x: a.x + (b.x - a.x) * f, y: r.y, z: a.z + (b.z - a.z) * f, ry: heading, walking: true };
    }
    u -= t.segMs[i];
    if (u < t.pauseMs[i]) return { x: b.x, y: r.y, z: b.z, ry: heading, walking: false };
    u -= t.pauseMs[i];
  }
  const last = r.points[0];
  return { x: last.x, y: r.y, z: last.z, ry: 0, walking: false };
}
