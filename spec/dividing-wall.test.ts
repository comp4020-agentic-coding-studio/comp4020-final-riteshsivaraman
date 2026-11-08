import { describe, expect, it } from "vitest";
import { planPath } from "../src/shared/storeday.ts";
import { DOOR } from "../src/shared/world.ts";
import { FLOOR } from "../src/shared/protocol.ts";

// the wall between the shop and the back of house: staff cross it by the staff door, never through it
describe("the wall between the shop and the back", () => {
  const wall = { from: FLOOR.maxZ + 0.25, to: FLOOR.maxZ + 0.45 };
  const trips: Array<[string, { x: number; z: number }, { x: number; z: number }]> = [
    ["the genius bar to a technician", { x: -1, z: 9 }, { x: 4.6, z: 21.6 }],
    ["the far side of the bar to the stock shelves", { x: 3, z: 9 }, { x: -4, z: 14 }],
    ["the left of the shop to the break room", { x: -5, z: 6 }, { x: -4.8, z: 16 }],
    ["the stock room back to the shop", { x: 0, z: 19 }, { x: -3, z: 5 }],
  ];
  for (const [label, a, b] of trips) {
    it(`${label}: only through the door`, () => {
      const p = planPath(a, b, "staff");
      const crossing = p.pts.filter((q) => q.z >= wall.from && q.z <= wall.to);
      expect(crossing.length, "the path never got through the wall at all").toBeGreaterThan(0);
      for (const q of crossing) {
        expect(q.x, `walked through the wall at x=${q.x.toFixed(2)}`).toBeGreaterThan(DOOR.minX - 0.05);
        expect(q.x).toBeLessThan(DOOR.maxX + 0.05);
      }
    });
  }
});
