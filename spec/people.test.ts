import { expect, it } from "vitest";
import { NPCS, npcPose } from "../src/shared/npcs.ts";
import { avoidPeople, nonVisitorPeople } from "../src/shared/people.ts";
import { BODY_RADIUS, separateFromPeople } from "../src/shared/world.ts";

// Promise: people are solid (Ritesh, 2026-10-11, "have collision between
// people"). Two bodies may touch but never overlap, for other visitors and
// for the staff and customers alike. Pure functions, so these need no app.

const MIN = BODY_RADIUS * 2;
const T0 = 1_800_000_000_000;

it("leaves someone alone when nobody is within a body width", () => {
  expect(separateFromPeople(0, 0, [{ x: 1, z: 0 }])).toEqual({ x: 0, z: 0 });
});

it("pushes a person out of another along the line between them", () => {
  const p = separateFromPeople(0.1, 0, [{ x: 0, z: 0 }]);
  expect(Math.hypot(p.x, p.z)).toBeCloseTo(MIN, 9);
  expect(p.z).toBeCloseTo(0, 9);
  expect(p.x).toBeGreaterThan(0);
});

it("moves someone standing exactly on another, deterministically", () => {
  const a = separateFromPeople(3, 3, [{ x: 3, z: 3 }]);
  const b = separateFromPeople(3, 3, [{ x: 3, z: 3 }]);
  expect(a).toEqual(b);
  expect(Math.hypot(a.x - 3, a.z - 3)).toBeGreaterThanOrEqual(MIN - 1e-9);
});

// NPCs follow fixed paths and do not dodge each other, so two of them can stand
// close; a visitor dropped between them cannot clear both. Check the ones that
// stand on their own, which is every case a visitor can actually settle in.
it("keeps a visitor a body width from an NPC they walk straight at, at any moment", () => {
  let checked = 0;
  for (let t = 0; t < 120_000; t += 2000) {
    const everyone = nonVisitorPeople(T0 + t);
    for (const n of NPCS) {
      const p = npcPose(n, T0 + t);
      const alone = everyone.filter((o) => Math.hypot(o.x - p.x, o.z - p.z) > 1e-9 && Math.hypot(o.x - p.x, o.z - p.z) < 1.5);
      if (alone.length > 0) continue;
      const q = avoidPeople(p.x, p.z, [], T0 + t);
      expect(Math.hypot(q.x - p.x, q.z - p.z), `${n.id} at +${t}ms`).toBeGreaterThanOrEqual(MIN - 1e-6);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(50);
});

it("counts other visitors as solid too", () => {
  const q = avoidPeople(5, 5, [{ x: 5, z: 5.1 }], T0);
  expect(Math.hypot(q.x - 5, q.z - 5.1)).toBeGreaterThanOrEqual(MIN - 1e-9);
});
