import { expect, it } from "vitest";
import { FLOOR } from "../src/shared/protocol.ts";
import {
  BACK_AREAS,
  BACK_DOORWAYS,
  BACK_DOOR,
  BACK_FURNITURE,
  BACK_LAYOUT,
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

// ---- the redesign (docs/blueprint/back-redesign.png, SCOPE D38) ----
// Promise: the back room is not claustrophobic. The shop-side door opens onto
// clear floor; staff reach the repair room and the rooms without squeezing
// through the shelving; deliveries come in through open receiving; and no aisle
// is narrow. These are measured on the model, which the drawings are made from.

const solidsList = [...BACK_SHELVES, ...BACK_FURNITURE, ...SERVICE_DESKS, ...BACK_WALLS];
const hits = (b: { x: number; z: number; w: number; d: number }, r: { x0: number; x1: number; z0: number; z1: number }): boolean =>
  b.x + b.w / 2 > r.x0 && b.x - b.w / 2 < r.x1 && b.z + b.d / 2 > r.z0 && b.z - b.d / 2 < r.z1;
const area = (id: string) => BACK_AREAS.find((a) => a.id === id)!;

it("keeps the concourse inside the staff door clear, apart from the lockers on the far wall", () => {
  const c = area("concourse");
  const doorX = (DOOR.minX + DOOR.maxX) / 2;
  for (const b of solidsList) {
    if (!hits(b, c)) continue;
    expect(b.x + b.w / 2, "only lockers stand in the concourse, away from the door").toBeLessThan(doorX - 3);
  }
  expect(c.z1 - c.z0).toBeGreaterThanOrEqual(1.9);
});

it("keeps a staff lane at least 1.7 m wide clear from the concourse to the spine", () => {
  const lane = area("lane");
  expect(lane.x1 - lane.x0).toBeGreaterThanOrEqual(1.7);
  for (const b of solidsList) expect(hits(b, lane), "nothing stands in the staff lane").toBe(false);
});

it("leaves main aisles of at least 1.35 m and passages between banks of at least 1.0 m", () => {
  const runs = [...new Set(BACK_SHELVES.map((s) => s.z))];
  const front = (z: number): number => Math.min(...BACK_SHELVES.filter((s) => Math.abs(s.z - z) < 0.7).map((s) => s.z - s.d / 2));
  const back = (z: number): number => Math.max(...BACK_SHELVES.filter((s) => Math.abs(s.z - z) < 0.7).map((s) => s.z + s.d / 2));
  const zs = runs.sort((a, b) => a - b);
  const firstFront = Math.min(...zs.map((z) => z - 0.31));
  const lastBack = Math.max(...zs.map((z) => z + 0.31));
  expect(firstFront - (BACK_ROOM_Z0 + BACK_LAYOUT.concourseV)).toBeGreaterThanOrEqual(1.35);
  expect(BACK_ROOM_Z0 + BACK_LAYOUT.spineV0 - lastBack).toBeGreaterThanOrEqual(1.35);
  // between the two runs
  const run1Back = Math.max(...zs.filter((z) => z < BACK_ROOM_Z0 + 5).map((z) => z + 0.31));
  const run2Front = Math.min(...zs.filter((z) => z > BACK_ROOM_Z0 + 5).map((z) => z - 0.31));
  expect(run2Front - run1Back).toBeGreaterThanOrEqual(1.35);
  void front;
  void back;
  // passages between banks in a run
  const row = BACK_SHELVES.filter((s) => Math.abs(s.z - BACK_SHELVES[0].z) < 1e-6).sort((a, b) => a.x - b.x);
  for (let i = 1; i < row.length; i++) expect(row[i].x - row[i].w / 2 - (row[i - 1].x + row[i - 1].w / 2)).toBeGreaterThanOrEqual(1.0);
  expect(BACK_SHELVES.length).toBe(12);
});

it("puts the repair room near the door and reaches every room without crossing the stock hall", () => {
  const repair = area("repair");
  const doorX = (DOOR.minX + DOOR.maxX) / 2;
  const dist = Math.hypot((repair.x0 + repair.x1) / 2 - doorX, repair.z0 - BACK_ROOM_Z0);
  expect(dist, "repair is no further than the old layout's 20 m").toBeLessThan(12);
  // as the reachability search, but the hall (shelving) is closed off
  const hall = area("storage");
  const STEP = 0.1;
  const free = (x: number, z: number): boolean => {
    if (x > hall.x0 && x < hall.x1 && z > hall.z0 && z < hall.z1) return false;
    const c = clampToWalkable("staff", x, z);
    if (Math.abs(c.x - x) > 1e-9 || Math.abs(c.z - z) > 1e-9) return false;
    const r = resolveCollisions(x, z, "staff");
    return Math.abs(r.x - x) < 1e-9 && Math.abs(r.z - z) < 1e-9;
  };
  const seen = new Set<string>();
  const start: [number, number] = [Math.round(((DOOR.minX + DOOR.maxX) / 2 - FLOOR.minX) / STEP), Math.round(0.35 / STEP)];
  const queue = [start];
  seen.add(start.join());
  while (queue.length) {
    const [i, j] = queue.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (seen.has(`${ni},${nj}`)) continue;
      const x = FLOOR.minX + ni * STEP;
      const z = BACK_ROOM_Z0 + nj * STEP;
      if (x < FLOOR.minX || x > FLOOR.maxX || z < BACK_ROOM_Z0 || z > BACK_ROOM_Z1 || !free(x, z)) continue;
      seen.add(`${ni},${nj}`);
      queue.push([ni, nj]);
    }
  }
  for (const id of ["repair", "office", "break", "dock", "restroom", "cleaner", "spine"]) {
    const a = area(id);
    let found = false;
    for (let x = a.x0 + 0.4; x <= a.x1 - 0.4 && !found; x += 0.2) {
      for (let z = a.z0 + 0.4; z <= a.z1 - 0.4 && !found; z += 0.2) {
        if (free(x, z) && seen.has(`${Math.round((x - FLOOR.minX) / STEP)},${Math.round((z - BACK_ROOM_Z0) / STEP)}`)) found = true;
      }
    }
    expect(found, `${a.name} is reachable without crossing the stock hall`).toBe(true);
  }
});

it("receives deliveries through an open area that meets the spine, with the dock door inside it", () => {
  const dock = area("dock");
  expect(dock.x1 - dock.x0).toBeGreaterThanOrEqual(4.0);
  expect(BACK_DOOR.minX).toBeGreaterThanOrEqual(dock.x0);
  expect(BACK_DOOR.maxX).toBeLessThanOrEqual(dock.x1);
  const opening = BACK_DOORWAYS.find((d) => d.id === "dock")!;
  expect(opening.w, "receiving opens fully onto the spine").toBeGreaterThanOrEqual(4.0);
  // the break room and the office each have a door onto receiving
  for (const id of ["break", "office"]) {
    const d = BACK_DOORWAYS.find((k) => k.id === id)!;
    expect(d.axis).toBe("z");
    expect(Math.abs(d.x) - 2.2, `${id} door is in receiving's wall`).toBeCloseTo(0, 6);
  }
});

it("opens every room onto the spine or receiving, never through the shelving", () => {
  const spine = area("spine");
  for (const id of ["restroom", "cleaner", "repair"]) {
    const d = BACK_DOORWAYS.find((k) => k.id === id)!;
    expect(d.axis).toBe("x");
    expect(d.z).toBeCloseTo(spine.z1, 6);
  }
});
