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
      if (!p.present) continue; // not in the store at this moment
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

// NPC with NPC (Ritesh, 2026-10-11): staff, customers and first-floor walkers
// are settled in a fixed order, so no two stand inside each other.
import { settledPeople } from "../src/shared/people.ts";

it("never lets two NPCs or walkers stand inside each other", () => {
  let worst = Infinity;
  let pairs = 0;
  for (let t = 0; t < 600_000; t += 1000) {
    const s = settledPeople(T0 + t);
    const all = [...s.npc.entries(), ...s.walkway.entries()];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const d = Math.hypot(all[i][1].x - all[j][1].x, all[i][1].z - all[j][1].z);
        pairs++;
        if (d < worst) worst = d;
      }
    }
  }
  expect(pairs).toBeGreaterThan(1000);
  expect(worst, "the closest two ever got").toBeGreaterThanOrEqual(BODY_RADIUS * 2 - 0.05);
});

it("is the same answer every time for the same moment", () => {
  const a = settledPeople(T0 + 123_456);
  const b = settledPeople(T0 + 123_456);
  expect([...a.npc]).toEqual([...b.npc]);
  expect([...a.walkway]).toEqual([...b.walkway]);
});

// Two people walking straight at each other swap sides when they cross, so the
// one being pushed steps aside by up to two body widths in one tick. That is a
// side-step, not a teleport: bounded here, and the client eases it over a few
// frames so it reads as a step.
it("moves people continuously: nobody is pushed further than a side-step in a tick", () => {
  let prev = settledPeople(T0);
  for (let t = 100; t < 120_000; t += 100) {
    const cur = settledPeople(T0 + t);
    for (const [id, p] of cur.npc) {
      const q = prev.npc.get(id);
      if (!q) continue; // they have only just come in
      expect(Math.hypot(p.x - q.x, p.z - q.z), `${id} at +${t}ms`).toBeLessThan(BODY_RADIUS * 4 + 0.2);
    }
    prev = cur;
  }
});
