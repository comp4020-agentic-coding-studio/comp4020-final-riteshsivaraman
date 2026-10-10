import { expect, it } from "vitest";
import { CEILING, FLOOR } from "../src/shared/protocol.ts";
import {
  BAR_STOOLS,
  BAY_START_Z,
  BENCHES,
  COLUMN_X,
  COUNTER,
  SERVICE_SIDE,
  TABLES,
  TABLE_LEN,
  TABLE_STOOLS,
  TABLE_W,
  bayCentre,
} from "../src/shared/world.ts";
import { BAY_LEDGES } from "../src/shared/plan.ts";

// Promise: the shop floor follows the Canberra reference photo, by numbers
// measured from it (SCOPE.md 3f), not by feel. The measurements are one
// person's reading of one photograph, so they are written down here, where
// they can be argued with, rather than left in someone's head.
//
// Measured from the reference (near row of tables, across the room):
//   - the glass front is about 3.8 times as wide as it is tall
//   - five evenly spaced lines: wall bench, table column, centre column,
//     table column, wall bench, so columns sit at about +-1/4 of the width
//   - a table is about 0.1 of the room width across
//   - tables run front to back (Ritesh: vertical on the plan): three down
//     each side column and two down the middle
//   - the service counter looked about three quarters of the back wall in the
//     photo, but Ritesh asked for it shorter (2026-10-11): about half
const ROOM_W = FLOOR.maxX - FLOOR.minX;

it("has three table columns at 0 and about +-1/4 of the room width", () => {
  expect([...COLUMN_X]).toHaveLength(3);
  expect(COLUMN_X[1]).toBe(0);
  expect(Math.abs(COLUMN_X[0]) / ROOM_W).toBeGreaterThan(0.2);
  expect(Math.abs(COLUMN_X[0]) / ROOM_W).toBeLessThan(0.3);
  expect(COLUMN_X[2]).toBe(-COLUMN_X[0]);
});

it("has a wall bench on each side", () => {
  expect(BENCHES).toHaveLength(2);
  expect(BENCHES[0].x).toBeLessThan(0);
  expect(BENCHES[1].x).toBeGreaterThan(0);
});

it("makes a table about a tenth of the room width", () => {
  expect(TABLE_W / ROOM_W).toBeGreaterThan(0.08);
  expect(TABLE_W / ROOM_W).toBeLessThan(0.13);
});

// Ritesh's description of the tables (2026-10-11): each side column has four
// almost-square product tables and, nearest the bar, a larger square service
// table with a stool each side; the middle column has three product tables and
// one square service table.
// Ritesh (2026-10-11): "the tables are WAY too small ... larger, and more
// elongated"; service tables 50% longer on each side.
it("makes product tables long, the long edge running front to back, and big enough for people", () => {
  const products = TABLES.filter((t) => !t.service);
  for (const t of products) {
    expect(t.d).toBeGreaterThan(t.w);
    expect(t.d / t.w, `${t.id} is elongated`).toBeGreaterThan(1.4);
    expect(t.d / t.w).toBeLessThan(2.5);
    expect(t.w).toBeGreaterThanOrEqual(1.2);
    expect(t.d).toBeGreaterThanOrEqual(2.0);
  }
});

it("makes each service table a square 1.5 times the old 1.2 m side, wider than a product table", () => {
  const service = TABLES.filter((t) => t.service);
  expect(service).toHaveLength(3);
  for (const t of service) {
    expect(t.w).toBeCloseTo(t.d, 9);
    expect(t.w).toBeCloseTo(1.2 * 1.5, 9);
    expect(t.w).toBeGreaterThan(TABLE_W);
  }
  expect(SERVICE_SIDE).toBeCloseTo(1.8, 9);
});

it("puts four product tables and a service table in each side column, three and one in the middle", () => {
  const col = (x: number) => TABLES.filter((t) => t.x === x);
  for (const x of [COLUMN_X[0], COLUMN_X[2]]) {
    expect(col(x).filter((t) => !t.service)).toHaveLength(4);
    expect(col(x).filter((t) => t.service)).toHaveLength(1);
  }
  expect(col(COLUMN_X[1]).filter((t) => !t.service)).toHaveLength(3);
  expect(col(COLUMN_X[1]).filter((t) => t.service)).toHaveLength(1);
});

it("puts a service table nearest the bar in each side column", () => {
  for (const x of [COLUMN_X[0], COLUMN_X[2]]) {
    const col = TABLES.filter((t) => t.x === x);
    const last = col.reduce((a, b) => (b.z > a.z ? b : a));
    expect(last.service).toBe(true);
  }
});

// Ritesh (2026-10-11): stools are tucked under the service tables and the bar,
// the way you actually sit; two on each of a service table's left and right.
const SEAT_R = 0.2;
it("gives every service table two stools on its left and two on its right, tucked under it", () => {
  const service = TABLES.filter((t) => t.service);
  expect(TABLE_STOOLS).toHaveLength(service.length * 4);
  for (const t of service) {
    const mine = TABLE_STOOLS.filter((s) => Math.abs(s.z - t.z) < t.d / 2 && Math.abs(s.x - t.x) < t.w / 2 + 0.5);
    expect(mine).toHaveLength(4);
    expect(mine.filter((s) => s.x < t.x)).toHaveLength(2);
    expect(mine.filter((s) => s.x > t.x)).toHaveLength(2);
    for (const s of mine) {
      // the seat reaches under the table edge by some, but not past the middle
      const under = t.w / 2 - (Math.abs(s.x - t.x) - SEAT_R);
      expect(under, `${s.id} tucked under ${t.id}`).toBeGreaterThan(0.05);
      expect(under).toBeLessThan(0.35);
    }
  }
  for (const t of TABLES.filter((t) => !t.service)) {
    expect(TABLE_STOOLS.some((s) => Math.abs(s.x - t.x) < t.w / 2 + 0.7 && Math.abs(s.z - t.z) < t.d / 2)).toBe(false);
  }
});

it("makes the service bar run almost from the far edge of one service table to the other", () => {
  const edges = TABLES.filter((t) => t.service).map((t) => Math.abs(t.x) + t.w / 2);
  const outer = Math.max(...edges);
  expect(COUNTER.w / 2).toBeLessThan(outer);
  expect(COUNTER.w / 2).toBeGreaterThan(outer - 0.25);
});

it("seats 13 at the bar, each tucked under the overhang and inside its ends", () => {
  expect(BAR_STOOLS).toHaveLength(13);
  const front = COUNTER.z - COUNTER.d / 2;
  for (const s of BAR_STOOLS) {
    expect(Math.abs(s.z - front), `${s.id} against the bar edge`).toBeLessThanOrEqual(0.1);
    expect(Math.abs(s.x) + SEAT_R).toBeLessThanOrEqual(COUNTER.w / 2);
  }
  const xs = BAR_STOOLS.map((s) => s.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1], "seats not on top of each other").toBeGreaterThanOrEqual(0.4);
});

it("leaves a metre-wide aisle behind people seated at the bar", () => {
  const seatedBack = Math.min(...BAR_STOOLS.map((s) => s.z)) - 0.3; // a person's back is ~0.3 m behind the seat centre
  const tablesBack = Math.max(...TABLES.map((t) => t.z + t.d / 2));
  expect(seatedBack - tablesBack).toBeGreaterThanOrEqual(1.0 - 1e-6);
});

it("keeps at least 1.3 m of clear aisle between table columns and beside the benches", () => {
  // measured from the wider service tables, which are the tightest
  const aisle = COLUMN_X[1] - SERVICE_SIDE / 2 - (COLUMN_X[0] + SERVICE_SIDE / 2);
  expect(aisle).toBeGreaterThanOrEqual(1.29);
  const outer = Math.abs(BENCHES[0].x) - BENCHES[0].w / 2 - (Math.abs(COLUMN_X[0]) + SERVICE_SIDE / 2);
  expect(outer).toBeGreaterThanOrEqual(1.2);
});

// Ritesh's rectified references (docs/blueprint/rectify.json): the back wall is
// about 3.3 times as wide as high, the side walls about 3.35 times as long as
// high, and he gave the wall height as 3 m. These are the checks that tie the
// model to them.
// Ritesh chose to enlarge the room for free movement (2026-10-11, "option A"):
// the references' proportions (3.3x and 3.35x the wall height, so 10 x 10 m)
// are now a floor, not a target.
it("is at least as wide and deep as the 10 x 10 m the references gave, and about 12 x 18 m", () => {
  expect(ROOM_W).toBeGreaterThanOrEqual(10);
  expect(FLOOR.maxZ - FLOOR.minZ).toBeGreaterThanOrEqual(10);
  expect(ROOM_W).toBeGreaterThan(11);
  expect(ROOM_W).toBeLessThan(13);
  expect(FLOOR.maxZ - FLOOR.minZ).toBeGreaterThan(17);
  expect(FLOOR.maxZ - FLOOR.minZ).toBeLessThan(19.5);
});

it("keeps a metre clear between tables, front to back and side to side", () => {
  const ts = TABLES;
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) {
      const a = ts[i], b = ts[j];
      const gapX = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
      const gapZ = Math.abs(a.z - b.z) - (a.d + b.d) / 2;
      const gap = gapX > 0 && gapZ > 0 ? Math.hypot(gapX, gapZ) : Math.max(gapX, gapZ);
      expect(gap, `${a.id} to ${b.id}`).toBeGreaterThanOrEqual(1.0 - 1e-6);
    }
  }
});

// "this is where customers are received" (Ritesh, 2026-10-11); first asked for
// 2.5 m, then "too much space at the front": 1.5 m.
it("keeps 1.5 m clear inside the glass, and no more: customers are received there", () => {
  const limit = FLOOR.minZ + 1.5;
  const first = Math.min(...TABLES.map((t) => t.z - t.d / 2));
  expect(first - FLOOR.minZ, "not wasting the front").toBeLessThan(1.5 + 0.25);
  for (const t of TABLES) expect(t.z - t.d / 2, t.id).toBeGreaterThanOrEqual(limit - 1e-6);
  for (const s of [...TABLE_STOOLS, ...BAR_STOOLS]) expect(s.z - 0.2, s.id).toBeGreaterThanOrEqual(limit - 1e-6);
});

it("stops the wall benches where the indented bays start, with a short ledge in front of half of each bay", () => {
  for (const b of BENCHES) expect(b.z + b.d / 2).toBeLessThanOrEqual(BAY_START_Z + 1e-6);
  for (const side of ["+x", "-x"] as const) {
    expect(BAY_LEDGES[side]).toHaveLength(3);
    for (const l of BAY_LEDGES[side]) {
      expect(l.bay).toBeGreaterThanOrEqual(0);
      expect(l.bay).toBeLessThan(3);
      expect(bayCentre(l.bay)).toBeGreaterThan(BENCHES[0].z + BENCHES[0].d / 2);
    }
  }
});

it("has the 3 m wall height from the references", () => {
  expect(CEILING).toBe(3);
});
