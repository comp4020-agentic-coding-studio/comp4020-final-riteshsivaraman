import { expect, it } from "vitest";
import { NPCS, isStaff, npcPose, type Zone } from "../src/shared/npcs.ts";
import { SOLIDS } from "../src/shared/world.ts";

// Promise: the store's staff and customers are the same for everyone and move
// like people, not like glitches. They are a pure function of the server
// clock, so these run with no app and no randomness.

const T0 = 1_800_000_000_000;

const inside = (z: Zone, x: number, y: number): boolean =>
  x >= z.minX - 1e-6 && x <= z.maxX + 1e-6 && y >= z.minZ - 1e-6 && y <= z.maxZ + 1e-6;

it("puts every NPC in the same place for the same moment", () => {
  for (const n of NPCS) {
    expect(npcPose(n, T0 + 12_345)).toEqual(npcPose(n, T0 + 12_345));
  }
});

it("keeps every NPC inside its own zone (or on the line between two), all day", () => {
  for (const n of NPCS) {
    for (let t = 0; t < 600_000; t += 700) {
      const p = npcPose(n, T0 + t);
      if (n.zones.length === 1) {
        expect(inside(n.zones[0], p.x, p.z), `${n.id} at +${t}ms`).toBe(true);
      } else {
        // between two zones the bounding box of both is the limit
        const all = {
          minX: Math.min(...n.zones.map((z) => z.minX)),
          maxX: Math.max(...n.zones.map((z) => z.maxX)),
          minZ: Math.min(...n.zones.map((z) => z.minZ)),
          maxZ: Math.max(...n.zones.map((z) => z.maxZ)),
        };
        expect(inside(all, p.x, p.z), `${n.id} at +${t}ms`).toBe(true);
      }
    }
  }
});

it("never teleports: no step is faster than a brisk walk", () => {
  const dt = 100;
  for (const n of NPCS) {
    let prev = npcPose(n, T0);
    for (let t = dt; t < 300_000; t += dt) {
      const p = npcPose(n, T0 + t);
      const speed = Math.hypot(p.x - prev.x, p.z - prev.z) / (dt / 1000);
      expect(speed, `${n.id} at +${t}ms`).toBeLessThan(3.2);
      prev = p;
    }
  }
});

it("keeps every NPC zone clear of every table, bench, bar, shelf and desk", () => {
  for (const n of NPCS) {
    for (const z of n.zones) {
      for (const b of SOLIDS) {
        const overlapsX = z.maxX > b.x - b.w / 2 && z.minX < b.x + b.w / 2;
        const overlapsZ = z.maxZ > b.z - b.d / 2 && z.minZ < b.z + b.d / 2;
        expect(overlapsX && overlapsZ, `${n.id} zone overlaps a solid at (${b.x}, ${b.z})`).toBe(false);
      }
    }
  }
});

it("has staff in each role the store needs, and customers", () => {
  const roles = new Set(NPCS.map((n) => n.role));
  for (const r of ["greeter", "specialist", "genius", "stock", "technician", "customer"]) {
    expect(roles.has(r as never), r).toBe(true);
  }
  expect(NPCS.filter(isStaff).every((n) => n.cap)).toBe(true);
  expect(new Set(NPCS.map((n) => n.id)).size).toBe(NPCS.length);
});

it("marks technicians as working, not walking", () => {
  for (const n of NPCS.filter((x) => x.role === "technician")) {
    expect(n.working).toBe(true);
    expect(npcPose(n, T0 + 3000).walking).toBe(false);
  }
});
