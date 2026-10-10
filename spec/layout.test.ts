import { expect, it } from "vitest";
import { CEILING, FLOOR } from "../src/shared/protocol.ts";
import {
  BENCHES,
  COLUMN_X,
  COUNTER,
  SERVICE_SIDE,
  TABLES,
  TABLE_LEN,
  TABLE_STOOLS,
  TABLE_W,
} from "../src/shared/world.ts";

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
it("makes product tables almost square, the long edge running front to back", () => {
  const products = TABLES.filter((t) => !t.service);
  for (const t of products) {
    expect(t.d).toBeGreaterThan(t.w);
    expect(t.d / t.w).toBeGreaterThan(1.05); // not quite square
    expect(t.d / t.w).toBeLessThan(1.4); // but almost
  }
});

it("makes each service table a square whose side is the long edge of a product table", () => {
  const service = TABLES.filter((t) => t.service);
  expect(service).toHaveLength(3);
  for (const t of service) {
    expect(t.w).toBeCloseTo(t.d, 9);
    expect(t.w).toBeCloseTo(TABLE_LEN, 9);
    expect(t.w).toBeGreaterThan(TABLE_W); // slightly larger than a product table's width
  }
  expect(SERVICE_SIDE).toBe(TABLE_LEN);
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

it("gives every service table a stool on its left and its right, and none on product tables", () => {
  const service = TABLES.filter((t) => t.service);
  expect(TABLE_STOOLS).toHaveLength(service.length * 2);
  for (const t of service) {
    const mine = TABLE_STOOLS.filter((s) => Math.abs(s.z - t.z) < 1e-9 && Math.abs(s.x - t.x) < t.w / 2 + 0.6);
    expect(mine).toHaveLength(2);
    expect(mine.some((s) => s.x < t.x)).toBe(true);
    expect(mine.some((s) => s.x > t.x)).toBe(true);
  }
});

it("makes the service bar about half the wall width (shorter than the photo, by request)", () => {
  expect(COUNTER.w / ROOM_W).toBeGreaterThan(0.4);
  expect(COUNTER.w / ROOM_W).toBeLessThan(0.6);
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
it("is as wide as the back wall reference: about 3.3 times the ceiling height", () => {
  const ratio = ROOM_W / CEILING;
  expect(ratio).toBeGreaterThan(3.0);
  expect(ratio).toBeLessThan(3.7);
});

it("is as deep as the side wall reference: about 3.35 times the ceiling height", () => {
  const ratio = (FLOOR.maxZ - FLOOR.minZ) / CEILING;
  expect(ratio).toBeGreaterThan(3.0);
  expect(ratio).toBeLessThan(3.7);
});

it("has the 3 m wall height from the references", () => {
  expect(CEILING).toBe(3);
});
