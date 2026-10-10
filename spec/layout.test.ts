import { expect, it } from "vitest";
import { CEILING, FLOOR } from "../src/shared/protocol.ts";
import {
  BENCHES,
  COLUMN_X,
  COUNTER,
  TABLES,
  TABLE_LEN,
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

it("runs tables front to back: longer in z than in x", () => {
  expect(TABLE_LEN).toBeGreaterThan(TABLE_W);
  for (const t of TABLES) expect(t.d).toBeGreaterThan(t.w);
});

it("puts three tables in each side column and two down the middle", () => {
  const count = (x: number) => TABLES.filter((t) => t.x === x).length;
  expect(count(COLUMN_X[0])).toBe(3);
  expect(count(COLUMN_X[2])).toBe(3);
  expect(count(COLUMN_X[1])).toBe(2);
});

it("makes the service bar about half the wall width (shorter than the photo, by request)", () => {
  expect(COUNTER.w / ROOM_W).toBeGreaterThan(0.4);
  expect(COUNTER.w / ROOM_W).toBeLessThan(0.6);
});

it("keeps at least 2 m of clear aisle between table columns", () => {
  const aisle = COLUMN_X[1] - TABLE_W / 2 - (COLUMN_X[0] + TABLE_W / 2);
  expect(aisle).toBeGreaterThanOrEqual(2);
});

it("is about as wide as the glass front is tall times 4 (photo: 3.8 to 1)", () => {
  // measured: the glass front is about 3.8 times as wide as it is high
  const ratio = ROOM_W / CEILING;
  expect(ratio).toBeGreaterThan(3.4);
  expect(ratio).toBeLessThan(4.6);
});
