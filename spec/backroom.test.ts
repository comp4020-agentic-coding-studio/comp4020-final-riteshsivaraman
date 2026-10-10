import { expect, it } from "vitest";
import { FLOOR } from "../src/shared/protocol.ts";
import {
  BACK_AREAS,
  BACK_DOORWAYS,
  BACK_FURNITURE,
  BACK_ROOM_Z0,
  BACK_ROOM_Z1,
  BACK_SHELVES,
  BACK_WALLS,
  DOOR,
  DOORWAY_W,
  SERVICE_DESKS,
  clampToWalkable,
  resolveCollisions,
} from "../src/shared/world.ts";

// Promise: the back room has what a real store's back of house has (Ritesh,
// 2026-10-11): inventory on rolling shelves, a repair room, an office, a break
// and training room, lockers and restrooms, and a back door to a loading dock;
// and staff can actually walk to every part of it from the staff door.

it("has every kind of area from the description", () => {
  const ids = BACK_AREAS.map((a) => a.id);
  for (const want of ["storage", "repair", "office", "break", "dock"]) expect(ids).toContain(want);
  const kinds = BACK_FURNITURE.map((f) => f.kind);
  for (const want of ["desk", "table", "computers", "lockers", "restroom", "pallet"] as const) expect(kinds).toContain(want);
  expect(SERVICE_DESKS.length).toBeGreaterThanOrEqual(2);
  expect(BACK_SHELVES.length).toBeGreaterThanOrEqual(9);
});

it("keeps everything inside the back room's footprint", () => {
  for (const b of [...BACK_WALLS, ...BACK_FURNITURE, ...BACK_SHELVES, ...SERVICE_DESKS]) {
    expect(b.x - b.w / 2).toBeGreaterThanOrEqual(FLOOR.minX - 1e-6);
    expect(b.x + b.w / 2).toBeLessThanOrEqual(FLOOR.maxX + 1e-6);
    expect(b.z - b.d / 2).toBeGreaterThanOrEqual(BACK_ROOM_Z0 - 1e-6);
    expect(b.z + b.d / 2).toBeLessThanOrEqual(BACK_ROOM_Z1 + 1e-6);
  }
});

it("makes every doorway wide enough to walk through", () => {
  expect(DOORWAY_W).toBeGreaterThanOrEqual(0.9);
  expect(BACK_DOORWAYS.length).toBeGreaterThanOrEqual(4);
});

// A grid search from the staff door, stepping only where a person's body fits.
it("lets staff walk from the staff door to every area", () => {
  const STEP = 0.1;
  const key = (i: number, j: number): string => `${i},${j}`;
  const free = (x: number, z: number): boolean => {
    const c = clampToWalkable("staff", x, z);
    if (Math.abs(c.x - x) > 1e-9 || Math.abs(c.z - z) > 1e-9) return false;
    const r = resolveCollisions(x, z, "staff");
    return Math.abs(r.x - x) < 1e-9 && Math.abs(r.z - z) < 1e-9;
  };
  const x0 = FLOOR.minX;
  const z0 = BACK_ROOM_Z0;
  const toIJ = (x: number, z: number): [number, number] => [Math.round((x - x0) / STEP), Math.round((z - z0) / STEP)];
  const start = toIJ((DOOR.minX + DOOR.maxX) / 2, z0 + 0.35);
  expect(free(x0 + start[0] * STEP, z0 + start[1] * STEP), "the staff door opens onto free floor").toBe(true);
  const seen = new Set<string>([key(...start)]);
  const queue: Array<[number, number]> = [start];
  while (queue.length) {
    const [i, j] = queue.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      const x = x0 + ni * STEP;
      const z = z0 + nj * STEP;
      if (x < FLOOR.minX || x > FLOOR.maxX || z < z0 || z > BACK_ROOM_Z1) continue;
      if (!free(x, z)) continue;
      seen.add(k);
      queue.push([ni, nj]);
    }
  }
  const reaches = (x: number, z: number): boolean => seen.has(key(...toIJ(x, z)));
  for (const a of BACK_AREAS) {
    // somewhere inside the area that a person can stand and is reachable
    let found = false;
    for (let x = a.x0 + 0.4; x <= a.x1 - 0.4 && !found; x += 0.2) {
      for (let z = a.z0 + 0.4; z <= a.z1 - 0.4 && !found; z += 0.2) {
        if (free(x, z) && reaches(x, z)) found = true;
      }
    }
    expect(found, `staff can reach the ${a.name}`).toBe(true);
  }
});
