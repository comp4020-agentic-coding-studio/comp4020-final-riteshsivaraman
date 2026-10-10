import { expect, it } from "vitest";
import { FLOOR, SPAWN } from "../src/shared/protocol.ts";
import {
  BACK_ROOM_Z0,
  BACK_ROOM_Z1,
  BODY_RADIUS,
  DOOR,
  SOLIDS,
  TABLES,
  TABLE_W,
  clampToWalkable,
  resolveCollisions,
  solidsFor,
} from "../src/shared/world.ts";

// Promise: the room is laid out sensibly, and only staff can reach the staff
// areas. One list of boxes feeds both what is drawn and what you bump into.

it("keeps every shop-floor table, bench and the bar inside the walls", () => {
  const shop = SOLIDS.filter((b) => b.z < FLOOR.maxZ + 0.5);
  for (const b of shop) {
    expect(b.x - b.w / 2, "left edge").toBeGreaterThanOrEqual(FLOOR.minX);
    expect(b.x + b.w / 2, "right edge").toBeLessThanOrEqual(FLOOR.maxX);
    expect(b.z - b.d / 2, "front edge").toBeGreaterThanOrEqual(FLOOR.minZ);
    expect(b.z + b.d / 2, "back edge").toBeLessThanOrEqual(FLOOR.maxZ);
  }
});

it("spawns a visitor where they are not inside anything", () => {
  expect(resolveCollisions(SPAWN.x, SPAWN.z)).toEqual({ x: SPAWN.x, z: SPAWN.z });
});

it("pushes a visitor out of a table instead of letting them stand in it", () => {
  const t = TABLES[0];
  const out = resolveCollisions(t.x, t.z);
  const stillInside =
    Math.abs(out.x - t.x) < t.w / 2 + BODY_RADIUS - 1e-6 &&
    Math.abs(out.z - t.z) < t.d / 2 + BODY_RADIUS - 1e-6;
  expect(stillInside).toBe(false);
});

it("leaves room for a person at each product: 1 m or more between neighbours", () => {
  // two products along each long side of a table: spacing = (length - 0.6) / (n - 1)
  expect(TABLE_W - 0.6).toBeGreaterThanOrEqual(1.0);
});

it("keeps customers out of the back room and behind the bar", () => {
  const inBackRoom = clampToWalkable("customer", -3, BACK_ROOM_Z0 + 5);
  expect(inBackRoom.z).toBeLessThanOrEqual(FLOOR.maxZ);
  const behindBar = clampToWalkable("customer", 0, 6.8);
  expect(behindBar.z).toBeLessThanOrEqual(5.35 + 1e-6);
});

it("lets staff go behind the bar and through the door into the back room", () => {
  expect(clampToWalkable("staff", 0, 6.8)).toEqual({ x: 0, z: 6.8 });
  const doorX = (DOOR.minX + DOOR.maxX) / 2;
  expect(clampToWalkable("staff", doorX, 8)).toEqual({ x: doorX, z: 8 });
  expect(clampToWalkable("staff", 0, 15)).toEqual({ x: 0, z: 15 });
});

it("keeps staff inside the building", () => {
  const p = clampToWalkable("staff", 100, 100);
  expect(p.x).toBeLessThanOrEqual(FLOOR.maxX);
  expect(p.z).toBeLessThanOrEqual(BACK_ROOM_Z1);
});

it("stops customers at the bar partitions, which staff may pass", () => {
  const partitions = solidsFor("customer").length - solidsFor("staff").length;
  expect(partitions).toBe(2);
});
