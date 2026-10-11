import type { Behaviour } from "./behaviour.ts";
import { playPose, type InteractionKind } from "./interaction.ts";
import type { ProductKind } from "./plan.ts";
import { ENTRANCE_HALF, FLOOR } from "./protocol.ts";
import { clearance, HARD_GAP, headingTo, stepWalker, wrap, type Obstacle, type Walker } from "./steering.ts";
import { BACK_ROOM_Z0, BACK_ROOM_Z1, BACK_LAYOUT, BACK_SHELF_ROW_Z, BACK_SHELF_UNIT_X, BAR_STOOLS, COUNTER, DOOR, SERVICE_DESKS, SOLIDS, TABLES, TABLE_STOOLS, solidsFor } from "./world.ts";

// A day in the store, as a timetable. Everyone who is not a visitor has a
// purpose and a script that follows from it:
//
//   customers   come in for something: a phone, a laptop, a tablet, audio, a
//               repair, an order to pick up, or just a look. They walk to the
//               right table, wait for the right person, go to the bar to pay
//               or collect, and leave.
//   greeter     meets everyone at the door.
//   specialists each own a kind of product, and walk out to the customers who
//               are looking at it.
//   geniuses    serve the bar: paying, repairs, pick-ups.
//   stock       the runner fetches what the bar asks for from the back room.
//
// It is generated once, from fixed seeds, with the same steering the crowd
// specs prove, and then it is only read: where is this person at time t, which
// way are they facing, what are they doing. So, like the rest of the NPCs, it is
// a pure function of the server's clock: every visitor sees the same store,
// nothing needs a server tick, and a restart changes nothing.

export const CYCLE = 480; // seconds, then it repeats

export type Purpose = "phone" | "laptop" | "tablet" | "audio" | "repair" | "pickup" | "browse" | "consult";
export type StaffRole = "greeter" | "specialist" | "genius" | "stock" | "technician";
export type SpecialtyGroup = "phones" | "laptops" | "tablets" | "audio";

export interface Moment {
  present: boolean; // inside the store (or its doorway) right now
  x: number;
  z: number;
  ry: number;
  walking: boolean;
  mode: Behaviour;
  mood: string;
  seated: boolean; // sitting on a stool
  device: boolean; // a phone or tablet is out
  intent: string; // what they are doing, in words
  // the point they are looking at (y is height above the floor); none while
  // walking, when they look where they are going
  gaze?: { x: number; y: number; z: number };
}

interface Pt {
  x: number;
  z: number;
}

interface Path {
  pts: Pt[]; // sampled every STEP seconds
  secs: number;
}

interface Seg {
  t0: number;
  t1: number;
  kind: "away" | "walk" | "stand" | "act";
  intent: string;
  mode: Behaviour;
  mood: string;
  path?: Path;
  at?: Pt;
  face?: Pt;
  fromHeading?: number;
  act?: { kind: InteractionKind; index: number; n: number; dur: number; from: number };
  with?: string; // who this interaction is with
  seated?: boolean;
}

// ---- the places ----

export const groupOf = (kind: ProductKind): SpecialtyGroup => {
  if (kind === "phone") return "phones";
  if (kind === "laptop") return "laptops";
  if (kind === "tablet" || kind === "tabletKb") return "tablets";
  return "audio"; // watch, earbuds, headphones, speaker, airtag
};

const PURPOSE_GROUP: Partial<Record<Purpose, SpecialtyGroup>> = {
  phone: "phones",
  laptop: "laptops",
  tablet: "tablets",
  audio: "audio",
};

export interface Station {
  id: string;
  kind: ProductKind;
  group: SpecialtyGroup;
  at: Pt; // where a customer stands
  face: Pt; // what they look at: the table
}

const PRODUCT_TABLES = TABLES.filter((t) => !t.service);
const SOLID_RECTS = (role: "staff" | "customer", grow: number): Obstacle[] =>
  solidsFor(role).map((b) => ({ kind: "rect", minX: b.x - b.w / 2 - grow, maxX: b.x + b.w / 2 + grow, minZ: b.z - b.d / 2 - grow, maxZ: b.z + b.d / 2 + grow, hard: true }));
const CUSTOMER_OBS = SOLID_RECTS("customer", 0.3);
const STAFF_OBS = SOLID_RECTS("staff", 0.26);

const free = (p: Pt): boolean => SOLIDS.every((b) => Math.abs(p.x - b.x) > b.w / 2 + 0.45 || Math.abs(p.z - b.z) > b.d / 2 + 0.45);

export const STATIONS: Station[] = PRODUCT_TABLES.flatMap((t) =>
  ([-1, 1] as const).map((side, i) => ({
    id: `${t.id}${side < 0 ? "-" : "+"}`,
    kind: t.products[i] ?? t.products[0],
    group: groupOf(t.products[i] ?? t.products[0]),
    at: { x: t.x + side * (t.w / 2 + 0.62), z: t.z },
    face: { x: t.x, z: t.z },
  })),
).filter((s) => free(s.at));

const BAR_FRONT_Z = COUNTER.z - COUNTER.d / 2;
const BAR_BACK_Z = COUNTER.z + COUNTER.d / 2;
const BAR_SLOTS: number[] = (() => {
  const xs = BAR_STOOLS.map((s) => s.x).filter((x) => Math.abs(x) < COUNTER.w / 2 - 0.5);
  const pick = xs.filter((_, i) => i % 3 === 1); // every third stool, so people are not shoulder to shoulder
  return pick.length > 1 ? pick : [-2.4, -0.6, 1.2, 2.8];
})();
const BEHIND_BAR_Z = BAR_BACK_Z + 0.5;

// Seats. At each square table, a stool for a guest on its left and one for the
// host on its right, facing each other across it; and the stools along the bar.
export interface Seat {
  id: string;
  at: Pt; // where a sitter's pelvis goes
  face: Pt; // what they face
}
const SERVICE_TABLES = TABLES.filter((t) => t.service);
export const TABLE_SEATS: Array<{ id: string; guest: Seat; host: Seat }> = SERVICE_TABLES.flatMap((t) => {
  // the stools along this table's own two sides, not a neighbour's
  const near = TABLE_STOOLS.filter((s) => Math.abs(s.z - t.z) < t.d / 2 + 0.3 && Math.abs(s.x - t.x) < t.w / 2 + 0.6);
  const left = near.filter((s) => s.x < t.x).sort((a, b) => a.z - b.z)[0];
  const right = near.filter((s) => s.x > t.x).sort((a, b) => a.z - b.z)[0];
  if (!left || !right) return [];
  const centre: Pt = { x: t.x, z: t.z };
  return [{ id: t.id, guest: { id: left.id, at: { x: left.x, z: left.z }, face: centre }, host: { id: right.id, at: { x: right.x, z: right.z }, face: centre } }];
});
export const BAR_SEATS: Seat[] = BAR_STOOLS.filter((s) => Math.abs(s.x) < COUNTER.w / 2 - 0.4).map((s) => ({
  id: s.id,
  // forward a little on the seat, so the chest is not in the counter
  at: { x: s.x, z: s.z - 0.12 },
  face: { x: s.x, z: COUNTER.z },
}));
const DOOR_X = (DOOR.minX + DOOR.maxX) / 2;
const SHOP_FRONT = FLOOR.minZ;

// ---- paths ----

const STEP = 0.1;
const SPEED = 1.15;
const pathCache = new Map<string, Path>();

// ---- finding a way round the furniture ----
// Local steering (steering.ts) dodges people well, but can sit in a dead end
// against a long table. So the way through the furniture is planned on a grid
// first (A*, then straightened), and the steering follows those waypoints.
const CELL = 0.2;
const GRID = { minX: -7.5, maxX: 7.5, minZ: FLOOR.minZ - 3, maxZ: BACK_ROOM_Z1 + 1 };
const COLS = Math.ceil((GRID.maxX - GRID.minX) / CELL);
const ROWS = Math.ceil((GRID.maxZ - GRID.minZ) / CELL);
const blockedGrids = new Map<string, Uint8Array>();

function blockedGrid(role: "staff" | "customer"): Uint8Array {
  const hit = blockedGrids.get(role);
  if (hit) return hit;
  const obs = role === "staff" ? STAFF_OBS : CUSTOMER_OBS;
  const g = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = GRID.minX + (c + 0.5) * CELL;
      const z = GRID.minZ + (r + 0.5) * CELL;
      // closer than the steering's own gap and a walker cannot stand there
      if (obs.some((o) => clearance(o, x, z).d < HARD_GAP + 0.02)) g[r * COLS + c] = 1;
    }
  }
  blockedGrids.set(role, g);
  return g;
}

const cellOf = (p: Pt): [number, number] => [
  Math.min(COLS - 1, Math.max(0, Math.floor((p.x - GRID.minX) / CELL))),
  Math.min(ROWS - 1, Math.max(0, Math.floor((p.z - GRID.minZ) / CELL))),
];
const centreOf = (c: number, r: number): Pt => ({ x: GRID.minX + (c + 0.5) * CELL, z: GRID.minZ + (r + 0.5) * CELL });

// the nearest open cell to a point, searching outwards
function openCell(g: Uint8Array, p: Pt): [number, number] {
  const [c0, r0] = cellOf(p);
  if (!g[r0 * COLS + c0]) return [c0, r0];
  for (let rad = 1; rad < 40; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (c >= 0 && r >= 0 && c < COLS && r < ROWS && !g[r * COLS + c]) return [c, r];
      }
    }
  }
  return [c0, r0];
}

function clearLine(g: Uint8Array, a: Pt, b: Pt): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL * 0.5)));
  for (let i = 0; i <= n; i++) {
    const [c, r] = cellOf({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n });
    if (g[r * COLS + c]) return false;
  }
  return true;
}

function route(from: Pt, to: Pt, role: "staff" | "customer"): Pt[] {
  const g = blockedGrid(role);
  if (clearLine(g, from, to)) return [to];
  const [sc, sr] = openCell(g, from);
  const [gc, gr] = openCell(g, to);
  const N = COLS * ROWS;
  const cost = new Float32Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const start = sr * COLS + sc;
  const goal = gr * COLS + gc;
  cost[start] = 0;
  // a binary heap of [f, index]
  const heap: Array<[number, number]> = [[0, start]];
  const push = (f: number, i: number): void => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const h = (c: number, r: number): number => Math.hypot(c - gc, r - gr);
  while (heap.length > 0) {
    const [, cur] = pop();
    if (cur === goal) break;
    const c = cur % COLS;
    const r = (cur / COLS) | 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const ni = nr * COLS + nc;
        if (g[ni]) continue;
        // no cutting a corner between two blocked cells
        if (dr !== 0 && dc !== 0 && (g[r * COLS + nc] || g[nr * COLS + c])) continue;
        const nc2 = cost[cur] + (dr !== 0 && dc !== 0 ? 1.4142 : 1);
        if (nc2 < cost[ni]) {
          cost[ni] = nc2;
          prev[ni] = cur;
          push(nc2 + h(nc, nr), ni);
        }
      }
    }
  }
  if (prev[goal] < 0 && goal !== start) return [to]; // no route: go straight and let steering try
  const cells: Pt[] = [];
  for (let i = goal; i >= 0; i = prev[i]) {
    cells.push(centreOf(i % COLS, (i / COLS) | 0));
    if (i === start) break;
  }
  cells.reverse();
  // straighten: keep a point only where the line of sight would be lost
  const out: Pt[] = [];
  let anchor: Pt = from;
  for (let i = 1; i < cells.length; i++) {
    if (!clearLine(g, anchor, cells[i])) {
      out.push(cells[i - 1]);
      anchor = cells[i - 1];
    }
  }
  out.push(to);
  return out;
}

export function planPath(from: Pt, to: Pt, role: "staff" | "customer"): Path {
  const key = `${role}|${from.x.toFixed(2)},${from.z.toFixed(2)}|${to.x.toFixed(2)},${to.z.toFixed(2)}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  const obs = role === "staff" ? STAFF_OBS : CUSTOMER_OBS;
  const w: Walker = { x: from.x, z: from.z, heading: headingTo(from.x, from.z, to.x, to.z) };
  const pts: Pt[] = [{ x: w.x, z: w.z }];
  for (const wp of route(from, to, role)) {
    // a walker pinned against furniture (a goal inside a keep-out margin)
    // used to spend all 900 steps, 90 s, walking on the spot. If it has
    // barely moved in half a second, stop; the straight last approach below
    // finishes. (Distance moved, not distance left: going round a corner
    // legitimately leaves the distance to the waypoint unchanged.)
    const recent: Pt[] = [];
    for (let i = 0; i < 900; i++) {
      if (Math.hypot(wp.x - w.x, wp.z - w.z) < 0.13) break;
      recent.push({ x: w.x, z: w.z });
      if (recent.length > 5) {
        const old = recent[recent.length - 6];
        if (Math.hypot(w.x - old.x, w.z - old.z) < 0.08) break;
      }
      stepWalker(w, STEP, { walkTo: wp }, obs, { walkSpeed: SPEED, followRoute: true, turnRate: 6 });
      pts.push({ x: w.x, z: w.z });
    }
  }
  // a goal that sits inside the keep-out margin (a stool tucked up to a table)
  // is reached by walking the last bit straight there, at a walking pace
  const last0 = pts[pts.length - 1];
  const rest = Math.hypot(to.x - last0.x, to.z - last0.z);
  const steps = Math.ceil(rest / (SPEED * STEP));
  for (let i = 1; i <= steps; i++) {
    pts.push({ x: last0.x + ((to.x - last0.x) * i) / steps, z: last0.z + ((to.z - last0.z) * i) / steps });
  }
  const path = { pts, secs: (pts.length - 1) * STEP };
  pathCache.set(key, path);
  return path;
}

// ---- an actor's timeline, built in time order ----

class Timeline {
  segs: Seg[] = [];
  pos: Pt;
  heading: number;
  t = 0; // the time up to which this actor's day is written
  seated = false; // sitting from here on, until they get up
  constructor(
    public id: string,
    public role: "staff" | "customer",
    public post: Pt,
    face: Pt,
    private idleIntent: string,
    private idleMood = "neutral",
  ) {
    this.pos = { ...post };
    this.heading = headingTo(post.x, post.z, face.x, face.z);
  }
  // wait here until time t
  stand(until: number, intent?: string, mode: Behaviour = "idle", mood?: string, face?: Pt): void {
    if (until <= this.t + 1e-6) return;
    const f = face ?? { x: this.pos.x - Math.sin(this.heading), z: this.pos.z - Math.cos(this.heading) };
    this.segs.push({ t0: this.t, t1: until, kind: "stand", intent: intent ?? this.idleIntent, mode, mood: mood ?? this.idleMood, at: { ...this.pos }, face: f, fromHeading: this.heading, seated: this.seated });
    this.heading = headingTo(this.pos.x, this.pos.z, f.x, f.z);
    this.t = until;
  }
  // set off at time `depart` (waiting where they are until then), return when they arrive
  walk(to: Pt, depart: number, intent: string, via: Pt[] = []): number {
    this.stand(depart);
    this.seated = false; // anyone walking has got up
    let at = this.t;
    for (const target of [...via, to]) {
      const path = planPath(this.pos, target, this.role);
      this.segs.push({ t0: at, t1: at + path.secs, kind: "walk", intent, mode: "walk", mood: "neutral", path });
      at += path.secs;
      const n = path.pts.length;
      const a = path.pts[Math.max(0, n - 4)];
      const b = path.pts[n - 1];
      this.heading = Math.hypot(b.x - a.x, b.z - a.z) > 1e-6 ? headingTo(a.x, a.z, b.x, b.z) : this.heading;
      this.pos = { x: b.x, z: b.z };
    }
    this.t = at;
    return at;
  }
  // a stretch of an interaction, played from where they stand
  act(dur: number, kind: InteractionKind, index: number, n: number, face: Pt, intent: string, from = 0, withId?: string): void {
    const p = playPose(kind, index, n, from, from + dur);
    this.segs.push({
      t0: this.t,
      t1: this.t + dur,
      kind: "act",
      intent,
      mode: p.mode,
      mood: p.mood,
      at: { ...this.pos },
      face,
      fromHeading: this.heading,
      act: { kind, index, n, dur: from + dur, from },
      with: withId,
      seated: this.seated,
    });
    this.heading = headingTo(this.pos.x, this.pos.z, face.x, face.z);
    this.t += dur;
  }
  away(until: number): void {
    if (until <= this.t) return;
    this.segs.push({ t0: this.t, t1: until, kind: "away", intent: "not in the store", mode: "idle", mood: "neutral", at: { ...this.pos } });
    this.t = until;
  }
}

// ---- who is in the store ----

const rand = (n: number): number => {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export interface CastMember {
  id: string;
  role: StaffRole | "customer";
  purpose?: Purpose;
  specialty?: SpecialtyGroup;
  shirt: string;
  cap?: string;
}

const CAPS: Record<StaffRole, string> = { greeter: "#4caf50", specialist: "#ffd23f", genius: "#ff6f61", stock: "#9c6ade", technician: "#29b6f6" };
const STAFF_SHIRT = "#2f5d9e";
const SPEC_ORDER: SpecialtyGroup[] = ["phones", "laptops", "tablets", "audio"];

// the customers, each with a reason to be here
const PURPOSES: Purpose[] = ["phone", "laptop", "repair", "tablet", "audio", "consult", "phone", "pickup", "laptop", "browse", "audio", "consult", "repair", "phone"];
const CUSTOMER_SHIRTS = ["#e07a5f", "#81b29a", "#f2cc8f", "#9b72aa", "#6d9dc5", "#d4a373", "#7a9e7e", "#c46f8a", "#6f8f4a", "#4a7c9a"];

export const CAST: CastMember[] = [
  { id: "greeter-1", role: "greeter", shirt: STAFF_SHIRT, cap: CAPS.greeter },
  ...SPEC_ORDER.map((g): CastMember => ({ id: `spec-${g}`, role: "specialist", specialty: g, shirt: STAFF_SHIRT, cap: CAPS.specialist })),
  { id: "genius-1", role: "genius", shirt: STAFF_SHIRT, cap: CAPS.genius },
  { id: "genius-2", role: "genius", shirt: STAFF_SHIRT, cap: CAPS.genius },
  { id: "stock-runner", role: "stock", shirt: STAFF_SHIRT, cap: CAPS.stock },
  { id: "stock-1", role: "stock", shirt: STAFF_SHIRT, cap: CAPS.stock },
  { id: "stock-2", role: "stock", shirt: STAFF_SHIRT, cap: CAPS.stock },
  { id: "tech-1", role: "technician", shirt: STAFF_SHIRT, cap: CAPS.technician },
  { id: "tech-2", role: "technician", shirt: STAFF_SHIRT, cap: CAPS.technician },
  ...PURPOSES.map((p, i): CastMember => ({ id: `cust-${i + 1}`, role: "customer", purpose: p, shirt: CUSTOMER_SHIRTS[i % CUSTOMER_SHIRTS.length] })),
];

const BR = BACK_ROOM_Z0;
// middle of the clear floor in front of the first run and behind the second
const STOCK_AISLE_V: [number, number] = [
  (BACK_LAYOUT.concourseV + (BACK_SHELF_ROW_Z[0] - BR - 0.62)) / 2,
  (BACK_SHELF_ROW_Z[1] - BR + 0.62 + BACK_LAYOUT.spineV0) / 2,
];
const POSTS: Record<string, Pt> = {
  "greeter-1": { x: 0, z: SHOP_FRONT + 1.0 },
  "spec-phones": { x: -4.5, z: -3.0 },
  "spec-laptops": { x: 1.6, z: 0.5 },
  "spec-tablets": { x: -1.6, z: -2.0 },
  "spec-audio": { x: 4.9, z: -2.0 },
  "genius-1": { x: -1.8, z: BEHIND_BAR_Z },
  "genius-2": { x: 1.8, z: BEHIND_BAR_Z },
  "stock-runner": { x: DOOR_X, z: BR + 1.4 },
  // the two stock staff work the aisle along the front of the first run and
  // the one behind the second (back-of-house layout, SCOPE D38)
  "stock-1": { x: -1.8, z: BR + STOCK_AISLE_V[0] },
  "stock-2": { x: -1.8, z: BR + STOCK_AISLE_V[1] },
  // technicians stand on the west side of their repair bench
  "tech-1": { x: SERVICE_DESKS[0].x - 0.9, z: SERVICE_DESKS[0].z },
  "tech-2": { x: SERVICE_DESKS[1].x - 0.9, z: SERVICE_DESKS[1].z },
};
const BENCH_FACE: Record<string, Pt> = {
  "tech-1": { x: SERVICE_DESKS[0].x, z: SERVICE_DESKS[0].z },
  "tech-2": { x: SERVICE_DESKS[1].x, z: SERVICE_DESKS[1].z },
};
// a post that falls inside furniture is moved to the nearest open floor, so
// nobody is asked to stand in a table
for (const id of Object.keys(POSTS)) {
  const g = blockedGrid("staff");
  const [c, r] = openCell(g, POSTS[id]);
  const open = centreOf(c, r);
  if (Math.hypot(open.x - POSTS[id].x, open.z - POSTS[id].z) > 0.01) POSTS[id] = open;
}

// ---- generating the day ----

const timelines = new Map<string, Timeline>();
const meta = new Map<string, CastMember>();

function build(): void {
  const staff = new Map<string, Timeline>();
  for (const c of CAST) {
    meta.set(c.id, c);
    if (c.role === "customer") continue;
    const post = POSTS[c.id];
    const tl = new Timeline(c.id, "staff", post, c.role === "technician" ? BENCH_FACE[c.id] : { x: post.x, z: post.z + (post.z < 0 ? 2 : 1) }, idleFor(c));
    staff.set(c.id, tl);
  }
  const greeter = staff.get("greeter-1")!;
  const specialistFor = (g: SpecialtyGroup): Timeline => staff.get(`spec-${g}`)!;
  const geniuses = [staff.get("genius-1")!, staff.get("genius-2")!];
  const runner = staff.get("stock-runner")!;

  // stations in use: one customer at a time
  const stationFree = new Map<string, number>();
  const barFree = BAR_SLOTS.map(() => 0);
  const tableFree = TABLE_SEATS.map(() => 0);
  const customers = CAST.filter((c) => c.role === "customer");
  const horizon = CYCLE - 70;

  customers.forEach((c, i) => {
    const tl = new Timeline(c.id, "customer", { x: 0, z: SHOP_FRONT - 1.7 }, { x: 0, z: SHOP_FRONT + 3 }, "on their way", "neutral");
    timelines.set(c.id, tl);
    const jitter = rand(i * 17 + 3) * 8;
    const arrival = 6 + (i * (horizon - 140)) / customers.length + jitter;
    const entryX = (rand(i * 31 + 5) * 2 - 1) * (ENTRANCE_HALF - 0.6);
    tl.pos = { x: entryX, z: SHOP_FRONT - 1.7 };
    tl.away(arrival);

    // 1. in at the door, and the greeter comes to meet them
    const meet: Pt = { x: entryX * 0.5, z: SHOP_FRONT + 1.6 };
    const tMeet = tl.walk(meet, arrival, "coming in");
    const gSpot: Pt = { x: meet.x + (meet.x > 0 ? -0.5 : 0.5), z: meet.z + 1.0 };
    {
      const gPath = planPath(greeter.pos, { x: gSpot.x, z: gSpot.z }, "staff");
      const gDepart = Math.max(greeter.t, tMeet - gPath.secs + 0.6);
      const gArrive = greeter.walk(gSpot, gDepart, "going to greet a customer");
      const start = Math.max(tMeet, gArrive);
      tl.stand(start, "being greeted", "idle", "smile", gSpot);
      greeter.stand(start, "greeting a customer", "idle", "smile", meet);
      const dur = 3.8;
      tl.act(dur, "handshake", 0, 2, gSpot, "being welcomed", 0, greeter.id);
      greeter.act(dur, "handshake", 1, 2, meet, "welcoming a customer", 0, tl.id);
      greeter.walk(POSTS["greeter-1"], greeter.t + 0.8, "back to the door");
      tl.heading = headingTo(meet.x, meet.z, gSpot.x, gSpot.z);
    }

    const group = c.purpose ? PURPOSE_GROUP[c.purpose] : undefined;

    // 2. what they came for
    if (group) {
      // find the right table: the first free station for what they want
      const options = STATIONS.filter((s) => s.group === group);
      let best = options[0];
      let bestAt = Infinity;
      options.forEach((s, k) => {
        const when = Math.max(stationFree.get(s.id) ?? 0, tl.t) + rand(i * 7 + k) * 0.5;
        if (when < bestAt) {
          bestAt = when;
          best = s;
        }
      });
      if (best) {
        const arrive = tl.walk(best.at, Math.max(tl.t, stationFree.get(best.id) ?? 0), `heading for the ${group}`);
        tl.stand(arrive + 1.2, `looking at ${best.kind}s`, "observe", "curious", best.face);
        // the specialist for this kind of product comes over
        const spec = specialistFor(group);
        const helpSpot: Pt = [{ x: best.at.x, z: best.at.z + 1.15 }, { x: best.at.x, z: best.at.z - 1.15 }].find(free) ?? { x: best.at.x, z: best.at.z + 1.15 };
        const sPath = planPath(spec.pos, helpSpot, "staff");
        const sDepart = Math.max(spec.t, tl.t - sPath.secs + 3);
        if (sDepart + sPath.secs + 40 < horizon) {
          const sArrive = spec.walk(helpSpot, sDepart, `going to help a customer with ${best.kind}s`);
          tl.stand(sArrive, `looking at ${best.kind}s`, "observe", "curious", best.face);
          const dur = 9 + rand(i * 5 + 1) * 6;
          tl.act(dur, "chat", 0, 2, helpSpot, `asking about ${best.kind}s`, 0, spec.id);
          spec.act(dur, "chat", 1, 2, best.at, `helping with ${best.kind}s`, 0, tl.id);
          spec.walk(POSTS[spec.id], spec.t + 0.8, "back to their lane");
        } else {
          tl.stand(tl.t + 6, `looking at ${best.kind}s`, "observe", "curious", best.face);
        }
        stationFree.set(best.id, tl.t + 0.5);
        // pay at the bar
        checkout(i, tl, "paying", 7);
      }
    } else if (c.purpose === "consult" && TABLE_SEATS.length > 0) {
      sitDownAt(i, tl);
    } else if (c.purpose === "repair" || c.purpose === "pickup") {
      checkout(i, tl, c.purpose === "repair" ? "repair" : "pickup", c.purpose === "repair" ? 13 : 5);
    } else {
      // just looking: a couple of tables, no help wanted
      const picks = [0, 1].map((k) => STATIONS[Math.floor(rand(i * 13 + k) * STATIONS.length)]);
      for (const s of picks) {
        const arrive = tl.walk(s.at, Math.max(tl.t, stationFree.get(s.id) ?? 0), "wandering the store");
        tl.stand(arrive + 6 + rand(i + s.id.length) * 5, `just looking at ${s.kind}s`, "observe", "curious", s.face);
        stationFree.set(s.id, tl.t);
      }
    }

    // 3. out of the door
    tl.walk({ x: entryX, z: SHOP_FRONT + 0.4 }, tl.t + 0.5, "leaving");
    tl.walk({ x: entryX, z: SHOP_FRONT - 1.7 }, tl.t, "leaving");
    tl.away(CYCLE);
  });

  // a sit-down discussion at a square table with a genius, devices out
  function sitDownAt(i: number, tl: Timeline): void {
    let k = 0;
    let when = Infinity;
    TABLE_SEATS.forEach((_, j) => {
      const t = Math.max(tableFree[j], tl.t) + rand(i * 11 + j) * 0.3;
      if (t < when) {
        when = t;
        k = j;
      }
    });
    const table = TABLE_SEATS[k];
    const genius = geniuses.reduce((a, b) => (a.t <= b.t ? a : b));
    const gPath = planPath(genius.pos, table.host.at, "staff");
    const arrive = tl.walk(table.guest.at, Math.max(tl.t, tableFree[k]), "going to a table to sit down");
    const gDepart = Math.max(genius.t, arrive - gPath.secs + 0.5);
    if (gDepart + gPath.secs + 40 > horizon) return;
    const gArrive = genius.walk(table.host.at, gDepart, "going to sit down with a customer");
    const sit = Math.max(arrive, gArrive) + 0.4;
    tl.seated = true;
    genius.seated = true;
    tl.stand(sit, "taking a seat", "idle", "smile", table.guest.face);
    genius.stand(sit, "taking a seat", "idle", "smile", table.host.face);
    const dur = 24 + rand(i * 5 + 2) * 6;
    tl.act(dur, "sitdown", 0, 2, table.guest.face, "talking it through, device out", 0, genius.id);
    genius.act(dur, "sitdown", 1, 2, table.host.face, "walking a customer through their device", 0, tl.id);
    tableFree[k] = tl.t + 0.5;
    genius.walk(POSTS[genius.id], genius.t + 0.6, "back to the bar");
  }

  // paying at the bar, collecting, or dropping off a repair
  function checkout(i: number, tl: Timeline, what: "paying" | "repair" | "pickup", serviceSecs: number): void {
    let slotIx = 0;
    let when = Infinity;
    BAR_SLOTS.forEach((_, k) => {
      const t = Math.max(barFree[k], tl.t) + rand(i * 3 + k) * 0.4;
      if (t < when) {
        when = t;
        slotIx = k;
      }
    });
    // a repair takes a while, so they sit on a bar stool for it; paying and
    // collecting are quick, so they stand
    const sitting = what === "repair" && BAR_SEATS.length > 0;
    const seat = sitting ? BAR_SEATS.reduce((a, b) => (Math.abs(a.at.x - BAR_SLOTS[slotIx]) <= Math.abs(b.at.x - BAR_SLOTS[slotIx]) ? a : b)) : null;
    const x = seat ? seat.at.x : BAR_SLOTS[slotIx];
    const stand: Pt = seat ? seat.at : { x, z: BAR_FRONT_Z - 0.55 };
    const genius = geniuses.reduce((a, b) => (Math.abs(a.post.x - x) + Math.max(0, a.t - tl.t) * 0.3 <= Math.abs(b.post.x - x) + Math.max(0, b.t - tl.t) * 0.3 ? a : b));
    const behind: Pt = { x, z: BEHIND_BAR_Z }; // directly opposite them, across the counter
    const intentWait = what === "pickup" ? "waiting to collect an order" : what === "repair" ? "waiting to book a repair" : "waiting to pay";
    const tArrive = tl.walk(stand, Math.max(tl.t, barFree[slotIx]), "going to the bar");
    // the genius comes to the customer's place behind the bar
    const gPath = planPath(genius.pos, behind, "staff");
    const gDepart = Math.max(genius.t, tArrive - gPath.secs + 0.5);
    if (gDepart + gPath.secs + serviceSecs + 40 > horizon + 40) {
      barFree[slotIx] = tl.t;
      return; // the day is nearly over: they give up and leave
    }
    const gArrive = genius.walk(behind, gDepart, "going to serve the bar");
    const start = Math.max(tArrive, gArrive);
    tl.seated = sitting;
    tl.stand(start, intentWait, "phone", "neutral", behind);
    genius.stand(start, "serving the bar", "idle", "smile", stand);
    // an order or a repair needs something from the back: the stock runner brings it
    if (what !== "paying") {
      const rDepart = Math.max(runner.t, start - 4);
      const via: Pt[] = [{ x: DOOR_X, z: FLOOR.maxZ - 0.3 }];
      const handOver: Pt = { x: behind.x + 0.8, z: BEHIND_BAR_Z };
      const rArrive = runner.walk(handOver, rDepart, "fetching an order for the bar", via);
      const meetAt = Math.max(start, rArrive);
      const dur = 3;
      genius.stand(meetAt, "waiting for stock", "idle", "neutral", handOver);
      runner.stand(meetAt, "handing the bar an order", "idle", "neutral", behind);
      runner.act(dur, "chat", 1, 2, behind, "handing the bar an order", 0, genius.id);
      genius.act(dur, "chat", 0, 2, handOver, "taking an order from stock", 0, runner.id);
      runner.walk(POSTS["stock-runner"], runner.t + 0.5, "back to the stock room", [{ x: DOOR_X, z: FLOOR.maxZ - 0.3 }]);
      tl.stand(genius.t, intentWait, "phone", "neutral", behind);
    }
    const dur = sitting ? serviceSecs + 9 : serviceSecs;
    const kind = sitting ? "sitdown" : "chat";
    tl.act(dur, kind, 0, 2, behind, what === "paying" ? "paying" : what === "repair" ? "booking a repair, showing the device" : "collecting an order", 0, genius.id);
    genius.act(dur, kind, 1, 2, stand, what === "paying" ? "taking payment" : what === "repair" ? "booking in a repair, checking the device" : "handing over an order", 0, tl.id);
    tl.seated = false; // up again to say thanks
    tl.act(2.6, "handshake", 0, 2, behind, "thanking them", 0.7, genius.id);
    genius.act(2.6, "handshake", 1, 2, stand, "thanking the customer", 0.7, tl.id);
    barFree[slotIx] = tl.t + 0.5;
    genius.walk(POSTS[genius.id], genius.t + 0.6, "back to their post");
  }

  // those who stay at their posts
  for (const tl of staff.values()) {
    const c = meta.get(tl.id)!;
    if (c.role === "technician") {
      tl.stand(CYCLE, "repairing devices", "work", "focused", BENCH_FACE[c.id]);
    } else if (c.id === "stock-1" || c.id === "stock-2") {
      // restocking: go to a shelf bank along their aisle, stand square on to
      // it and work, then on to the next one (never facing empty floor)
      const first = c.id === "stock-1";
      const aisle = BR + STOCK_AISLE_V[first ? 0 : 1];
      // the face of the bank they work: the front of the first run, the back of the second
      const faceZ = first ? BACK_SHELF_ROW_Z[0] - 0.31 : BACK_SHELF_ROW_Z[1] + 0.31;
      const order = first ? [0, 1, 2, 1] : [2, 1, 0, 1];
      let t = tl.t;
      let k = 0;
      while (t < CYCLE - 30) {
        const unit = order[k % order.length];
        const spot = { x: BACK_SHELF_UNIT_X[unit] + (k % 2 === 0 ? -0.5 : 0.5), z: aisle };
        t = tl.walk(spot, tl.t, "moving to the next shelf");
        tl.stand(t + 9 + rand(k + c.id.length) * 6, "restocking shelves", "work", "focused", { x: spot.x, z: faceZ });
        t = tl.t;
        k++;
      }
    }
    // the day ends with everyone back at their post, so it loops cleanly
    if (c.role !== "technician" && c.id !== "stock-1" && c.id !== "stock-2") {
      const post = POSTS[c.id];
      if (Math.hypot(tl.pos.x - post.x, tl.pos.z - post.z) > 0.2) tl.walk(post, tl.t, "back to their post", c.role === "stock" ? [{ x: DOOR_X, z: FLOOR.maxZ - 0.3 }] : []);
    } else if (c.id === "stock-1" || c.id === "stock-2") {
      const post = POSTS[c.id];
      if (Math.hypot(tl.pos.x - post.x, tl.pos.z - post.z) > 0.2) tl.walk(post, tl.t, "back to their place");
    }
    tl.stand(CYCLE);
    timelines.set(tl.id, tl);
  }
}

function idleFor(c: CastMember): string {
  switch (c.role) {
    case "greeter":
      return "watching the door";
    case "specialist":
      return `ready to help with ${c.specialty}`;
    case "genius":
      return "ready at the bar";
    case "stock":
      return "waiting in the stock room";
    default:
      return "";
  }
}

build();

// ---- reading it ----

export const NPC_IDS = CAST.map((c) => c.id);
export { BAR_SEATS as SEATS_AT_BAR, TABLE_SEATS as SEATS_AT_TABLES };
export const castOf = (id: string): CastMember => meta.get(id)!;

function at(seg: Seg, tau: number): Moment {
  const u = (tau - seg.t0) / Math.max(1e-6, seg.t1 - seg.t0);
  if (seg.kind === "away") {
    const p = seg.at!;
    return { present: false, x: p.x, z: p.z, ry: 0, walking: false, mode: "idle", mood: "neutral", seated: false, device: false, intent: seg.intent };
  }
  if (seg.kind === "walk") {
    const path = seg.path!;
    const f = Math.min(path.pts.length - 1, Math.max(0, (tau - seg.t0) / STEP));
    const i = Math.floor(f);
    const a = path.pts[i];
    const b = path.pts[Math.min(path.pts.length - 1, i + 1)];
    const k = f - i;
    const x = a.x + (b.x - a.x) * k;
    const z = a.z + (b.z - a.z) * k;
    // face where they are going: a few samples ahead smooths the corners
    const ahead = path.pts[Math.min(path.pts.length - 1, i + 4)];
    const behind = path.pts[Math.max(0, i - 1)];
    const dx = ahead.x - behind.x;
    const dz = ahead.z - behind.z;
    const ry = Math.hypot(dx, dz) > 1e-6 ? headingTo(0, 0, dx, dz) : 0;
    return { present: true, x, z, ry, walking: true, mode: "walk", mood: seg.mood, seated: false, device: false, intent: seg.intent };
  }
  const p = seg.at!;
  const face = seg.face ?? p;
  const target = Math.hypot(face.x - p.x, face.z - p.z) > 1e-6 ? headingTo(p.x, p.z, face.x, face.z) : (seg.fromHeading ?? 0);
  // turn from how they arrived to what they face, over most of a second
  const turn = Math.min(1, (tau - seg.t0) / 0.7);
  const e = turn * turn * (3 - 2 * turn);
  const from = seg.fromHeading ?? target;
  const ry = from + wrap(target - from) * e;
  let mode = seg.mode;
  let mood = seg.mood;
  if (seg.kind === "act" && seg.act) {
    const pose = playPose(seg.act.kind, seg.act.index, seg.act.n, seg.act.from + (tau - seg.t0), seg.act.dur);
    mode = pose.mode;
    mood = pose.mood;
  }
  void u;
  // what the head is on: down at a product or their hands, up at a shelf,
  // otherwise at the face of whoever they are with
  const looksDown = mode === "observe" || mode === "work" || mode === "phone" || mode === "device" || mode === "think";
  const gaze = seg.face && Math.hypot(face.x - p.x, face.z - p.z) > 1e-6 ? { x: face.x, y: looksDown ? 0.85 : 1.5, z: face.z } : undefined;
  return { present: true, x: p.x, z: p.z, ry, walking: false, mode, mood, seated: seg.seated ?? false, device: mode === "device", intent: seg.intent, gaze };
}

// Where this person is and what they are doing at server time `nowMs`.
export function momentOf(id: string, nowMs: number): Moment {
  const tl = timelines.get(id);
  if (!tl) throw new Error(`no timeline for ${id}`);
  const tau = (((nowMs / 1000) % CYCLE) + CYCLE) % CYCLE;
  const segs = tl.segs;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].t0 <= tau) lo = mid;
    else hi = mid - 1;
  }
  return at(segs[lo], tau);
}

export function timelineOf(id: string): ReadonlyArray<Readonly<Seg>> {
  return timelines.get(id)?.segs ?? [];
}

// A debugging handle on the generated paths, for specs.
export const OBSTACLES = { customer: CUSTOMER_OBS, staff: STAFF_OBS };
