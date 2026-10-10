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

it("keeps at least 1.3 m of clear aisle between table columns and beside the benches", () => {
  const aisle = COLUMN_X[1] - TABLE_W / 2 - (COLUMN_X[0] + TABLE_W / 2);
  expect(aisle).toBeGreaterThanOrEqual(1.3);
  const outer = Math.abs(BENCHES[0].x) - BENCHES[0].w / 2 - (Math.abs(COLUMN_X[0]) + TABLE_W / 2);
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
