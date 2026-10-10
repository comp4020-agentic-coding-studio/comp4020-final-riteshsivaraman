// The mall around the store: a concourse along the glass front, shopfronts on
// both sides, and a mezzanine walkway opposite. Like the store's NPCs, the
// people here are a pure function of the server clock, so every visitor sees
// the same shoppers walk past, the same few come in, wander, and leave.
//
// z is the same axis as the store: the glass front is at z = -8, and the
// concourse runs out to the opposite shopfronts at z = -26.
import { FLOOR } from "./protocol.ts";

export const MALL = {
  minX: -34,
  maxX: 34,
  frontZ: FLOOR.minZ - 0.5, // the store's glass front
  farZ: -26, // the opposite shopfronts
  ceilingY: 7.4, // high atrium roof
  mezzanineY: 4.4, // upper walkway slab
  mezzanineZ0: -26, // slab runs from the far shopfronts...
  mezzanineZ1: -19.5, // ...to the glass balustrade
  upperWalkZ: [-21.8, -20.6],
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

const LEVEL = 0;
const UPPER = MALL.mezzanineY + 0.15; // top of the mezzanine slab

const passer = (id: string, colour: string, speed: number, phase: number, points: RoutePoint[]): Route => ({
  id,
  kind: "passer",
  y: LEVEL,
  speed,
  phase,
  colour,
  points,
});

// Ways in and out. They go through the opening in the glass (|x| <= 1.5) and
// then up an aisle between the tables. Positions follow the store's own edges.
const OUT = FLOOR.minZ - 3.5; // on the concourse, in front of the store
const DOOR_Z = FLOOR.minZ - 0.7; // just outside the glass
const IN_Z = FLOOR.minZ + 0.9; // just inside

const shopper = (id: string, colour: string, phase: number, laneX: number, stops: RoutePoint[]): Route => ({
  id,
  kind: "shopper",
  y: LEVEL,
  speed: 1.15,
  phase,
  colour,
  points: [
    { x: -30, z: OUT },
    { x: laneX, z: OUT },
    { x: laneX, z: DOOR_Z },
    { x: laneX, z: IN_Z },
    ...stops,
    { x: laneX, z: IN_Z },
    { x: laneX, z: DOOR_Z },
    { x: laneX, z: OUT },
    { x: 30, z: OUT },
    { x: 30, z: OUT - 1.4 },
    { x: -30, z: OUT - 1.4 },
  ],
});

export const ROUTES: Route[] = [
  // people walking past the store, two ways along the concourse
  passer("walker-1", "#c9a227", 1.25, 0, [
    { x: -30, z: -9.5 },
    { x: 30, z: -9.5 },
    { x: 30, z: -10.5 },
    { x: -30, z: -10.5 },
  ]),
  passer("walker-2", "#8a5a9e", 1.1, 21000, [
    { x: 30, z: -8.0 },
    { x: -30, z: -8.0 },
    { x: -30, z: -11.5 },
    { x: 30, z: -11.5 },
  ]),
  passer("walker-3", "#4a8f7a", 1.4, 9000, [
    { x: -30, z: -13.5 },
    { x: 30, z: -13.5 },
    { x: 30, z: -14.5 },
    { x: -30, z: -14.5 },
  ]),
  // window shoppers: stop and look in at the glass
  passer("window-1", "#d46a4e", 1.0, 33000, [
    { x: -30, z: -7.6 },
    { x: -3.5, z: -7.6, pause: 7000 },
    { x: 3.5, z: -7.6, pause: 5000 },
    { x: 30, z: -7.6 },
    { x: 30, z: -12.5 },
    { x: -30, z: -12.5 },
  ]),
  passer("window-2", "#5b7fb5", 1.05, 52000, [
    { x: 30, z: -7.4 },
    { x: 7, z: -7.4, pause: 6000 },
    { x: -30, z: -7.4 },
    { x: -30, z: -12.0 },
    { x: 30, z: -12.0 },
  ]),
  // customers: come in through the opening, look at a table or two, leave
  shopper("shopper-1", "#e07a5f", 4000, 1.25, [
    { x: 1.25, z: -1.9, pause: 9000 },
    { x: 1.25, z: 1.2, pause: 6000 },
  ]),
  shopper("shopper-2", "#81b29a", 61000, -1.25, [
    { x: -1.25, z: -1.4, pause: 8000 },
    { x: -1.25, z: 1.7, pause: 7000 },
  ]),
  shopper("shopper-3", "#f2cc8f", 98000, 1.25, [
    { x: 3.8, z: -4.35 },
    { x: 3.8, z: -1.2, pause: 10000 },
    { x: 3.8, z: 2.0, pause: 6000 },
    { x: 3.8, z: -4.35 },
  ]),
  // up on the mezzanine, across the way
  {
    id: "upper-1",
    kind: "upper",
    y: UPPER,
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
    y: UPPER,
    speed: 1.0,
    phase: 40000,
    colour: "#3d7ea6",
    points: [
      { x: 28, z: MALL.upperWalkZ[1] },
      { x: 6, z: -20.2, pause: 9000 },
      { x: -28, z: MALL.upperWalkZ[1] },
      { x: -28, z: MALL.upperWalkZ[0] },
      { x: 28, z: MALL.upperWalkZ[0] },
    ],
  },
  {
    id: "upper-3",
    kind: "upper",
    y: UPPER,
    speed: 1.15,
    phase: 71000,
    colour: "#8c4f8c",
    points: [
      { x: -20, z: -20.2, pause: 12000 },
      { x: 20, z: -20.2 },
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
