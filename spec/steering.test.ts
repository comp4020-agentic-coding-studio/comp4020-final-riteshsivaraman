import { describe, expect, it } from "vitest";
import { KINDS, KIND_LIST, stepInteractions, zoneOf, type Active, type SimAgent } from "../src/shared/interaction.ts";
import { clearance, freePoint, goalBlocked, headingTo, pushOutOfHard, stepWalker, wrap, type Obstacle, type Walker } from "../src/shared/steering.ts";
import { BODY_RADIUS, separateFromPeople } from "../src/shared/world.ts";

// Promise: walkers go round things instead of through them, two meeting head
// on get past each other, nobody cuts through an interaction, and the people
// in an interaction end up where they should be, facing the way they should.
const seeded = (n: number) => {
  let a = n;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
};
const person = (x: number, z: number, r = 0.32): Obstacle => ({ kind: "disc", x, z, r });

function walk(w: Walker, goal: { x: number; z: number }, obstacles: Obstacle[] | (() => Obstacle[]), seconds: number, onStep?: () => void): number {
  const dt = 0.05;
  let t = 0;
  for (; t < seconds; t += dt) {
    const obs = typeof obstacles === "function" ? obstacles() : obstacles;
    stepWalker(w, dt, { walkTo: goal }, obs);
    onStep?.();
    if (Math.hypot(goal.x - w.x, goal.z - w.z) < 0.15) break;
  }
  return t;
}

describe("walking round things", () => {
  it("reaches a goal in the open without a detour", () => {
    const w: Walker = { x: 0, z: 0, heading: 0 };
    const t = walk(w, { x: 0, z: -6 }, [], 20);
    expect(Math.hypot(w.x - 0, w.z + 6)).toBeLessThan(0.2);
    expect(t).toBeLessThan(6.5); // 6 m at about 1.15 m/s
  });

  it("goes round a round table that sits on the straight line", () => {
    const table: Obstacle = { kind: "disc", x: 0, z: -3, r: 0.8, hard: true };
    const w: Walker = { x: 0.05, z: 0, heading: 0 };
    let minClear = Infinity;
    walk(w, { x: 0, z: -6 }, [table], 30, () => {
      minClear = Math.min(minClear, clearance(table, w.x, w.z).d);
    });
    expect(Math.hypot(w.x, w.z + 6)).toBeLessThan(0.2);
    expect(minClear).toBeGreaterThan(0.1); // never touched it
  });

  it("goes round a wall instead of into it", () => {
    const wall: Obstacle = { kind: "rect", minX: -2, maxX: 2, minZ: -3.2, maxZ: -2.8, hard: true };
    const w: Walker = { x: 0, z: 0, heading: 0 };
    let minClear = Infinity;
    walk(w, { x: 0, z: -6 }, [wall], 40, () => {
      minClear = Math.min(minClear, clearance(wall, w.x, w.z).d);
    });
    expect(Math.hypot(w.x, w.z + 6)).toBeLessThan(0.3);
    expect(minClear).toBeGreaterThan(0);
  });

  it("two walkers meeting head on get past each other without touching", () => {
    const a: Walker = { x: 0, z: 0, heading: Math.PI }; // facing +z
    const b: Walker = { x: 0, z: 8, heading: 0 }; // facing -z
    let closest = Infinity;
    for (let t = 0; t < 20; t += 0.05) {
      stepWalker(a, 0.05, { walkTo: { x: 0, z: 8 } }, [person(b.x, b.z)]);
      stepWalker(b, 0.05, { walkTo: { x: 0, z: 0 } }, [person(a.x, a.z)]);
      closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
    }
    expect(closest).toBeGreaterThan(0.45);
    expect(Math.hypot(a.x, a.z - 8)).toBeLessThan(0.5);
    expect(Math.hypot(b.x, b.z)).toBeLessThan(0.5);
  });

  it("goes round the ground an interaction is using, not through it", () => {
    const group = [
      { x: 0, z: -3, faceX: 0, faceZ: -3.9 },
      { x: 1, z: -3, faceX: 0, faceZ: -3 },
      { x: -1, z: -3, faceX: 0, faceZ: -3 },
    ];
    const zone = zoneOf({ kind: "circle", members: [0, 1, 2], slots: group, duration: 10 });
    const w: Walker = { x: 0, z: 0, heading: 0 };
    let inside = 0;
    walk(w, { x: 0, z: -7 }, [zone], 40, () => {
      if (clearance(zone, w.x, w.z).d < 0) inside++;
    });
    expect(inside).toBe(0);
    expect(Math.hypot(w.x, w.z + 7)).toBeLessThan(0.3);
  });

  it("turns on the spot to face where it is asked to, without moving", () => {
    const w: Walker = { x: 1, z: 1, heading: 0 };
    const goal = { faceTo: { x: 5, z: 1 } };
    let res = stepWalker(w, 0.05, goal, []);
    for (let i = 0; i < 80 && !res.arrived; i++) res = stepWalker(w, 0.05, goal, []);
    expect(res.arrived).toBe(true);
    expect(Math.abs(wrap(headingTo(1, 1, 5, 1) - w.heading))).toBeLessThan(0.2);
    expect(w.x).toBeCloseTo(1);
    expect(w.z).toBeCloseTo(1);
  });
});

describe("a crowd moving about, using the same walking and the same rules", () => {
  interface Mover extends SimAgent {
    heading: number;
    roam: { x: number; z: number };
  }
  const BOUNDS = { minX: -7, maxX: 7, minZ: -1, maxZ: 9 };
  const STATIC: Obstacle[] = [
    { kind: "disc", x: -3.5, z: 3.5, r: 0.8, hard: true },
    { kind: "disc", x: 3.5, z: 5.5, r: 0.8, hard: true },
    { kind: "rect", minX: -1.5, maxX: 1.5, minZ: 6.5, maxZ: 7.2, hard: true },
  ];

  function simulate(seconds: number, seed: number, count = 16) {
    const r = seeded(seed);
    const pick = (extra: Obstacle[] = []): { x: number; z: number } =>
      freePoint(r, BOUNDS, [...STATIC, ...extra], 0.9) ?? { x: 0, z: 2 };
    const agents: Mover[] = Array.from({ length: count }, (_, i) => {
      const p = pick();
      return { id: i, x: p.x, z: p.z, heading: r() * 6.28, plan: null, directive: null, nextConsider: 1 + r() * 4, roam: pick() };
    });
    let active: Active[] = [];
    const out = {
      played: 0,
      inStaticObstacle: 0,
      throughZone: 0,
      overlap: 0,
      samples: 0,
      badPlay: [] as string[],
      started: 0,
    };
    const dt = 0.05;
    for (let now = 0; now < seconds; now += dt) {
      const step = stepInteractions(agents, active, now, r);
      active = step.active;
      out.started += step.events.started.length;
      // when it begins to play, everyone must be in place and facing the right way
      for (const ap of step.events.played) {
        out.played++;
        const slots = ap.plan.slots;
        ap.plan.members.forEach((id, i) => {
          const a = agents[id];
          const s = slots[i];
          const place = Math.hypot(a.x - s.x, a.z - s.z);
          const turn = Math.abs(wrap(headingTo(a.x, a.z, s.faceX, s.faceZ) - a.heading));
          if (place > 0.3) out.badPlay.push(`${ap.plan.kind} member ${i} ${place.toFixed(2)} m from place`);
          if (turn > 0.45) out.badPlay.push(`${ap.plan.kind} member ${i} ${turn.toFixed(2)} rad off facing`);
        });
      }
      const zones = active.map((ap) => ({ ap, disc: zoneOf(ap.plan) }));
      for (const a of agents) {
        const mine = zones.filter((z) => z.ap !== a.plan).map((z) => z.disc);
        const others = agents
          .filter((o) => o.id !== a.id && !(a.plan && o.plan === a.plan))
          .map((o) => person(o.x, o.z));
        const obstacles = [...STATIC, ...mine, ...others];
        const w: Walker = { x: a.x, z: a.z, heading: a.heading };
        const d = a.directive;
        let goal: { walkTo?: { x: number; z: number }; faceTo?: { x: number; z: number } } = {};
        if (d) goal = { walkTo: d.walkTo, faceTo: d.faceTo };
        else {
          // roaming: walk to a waypoint, then pick another; and pick another if
          // an interaction has formed on top of it
          if (Math.hypot(a.roam.x - a.x, a.roam.z - a.z) < 0.4 || goalBlocked(a.roam, [...STATIC, ...mine])) a.roam = pick(mine);
          goal = { walkTo: a.roam };
        }
        stepWalker(w, dt, goal, obstacles);
        a.x = w.x;
        a.z = w.z;
        a.heading = w.heading;
      }
      // the same backstop as the stage: bodies cannot overlap
      const placed: Array<{ x: number; z: number }> = [];
      for (const a of agents) {
        let q = separateFromPeople(a.x, a.z, placed);
        q = pushOutOfHard(q.x, q.z, STATIC); // shoves cannot put anyone in a table
        a.x = q.x;
        a.z = q.z;
        placed.push(q);
      }
      // measure
      for (const a of agents) {
        out.samples++;
        if (STATIC.some((o) => clearance(o, a.x, a.z).d < 0)) out.inStaticObstacle++;
        for (const z of zones) {
          if (z.ap === a.plan) continue;
          if (clearance(z.disc, a.x, a.z).d < -0.05) out.throughZone++;
        }
      }
      const raw = agents.map((a) => ({ x: a.x, z: a.z }));
      for (let i = 0; i < raw.length; i++) for (let j = i + 1; j < raw.length; j++) {
        if (Math.hypot(raw[i].x - raw[j].x, raw[i].z - raw[j].z) < BODY_RADIUS * 2 - 0.05) out.overlap++;
      }
    }
    return out;
  }

  it("interactions do start and play, with everyone in place and facing the right way when they do", () => {
    let played = 0;
    const problems: string[] = [];
    for (const seed of [1, 2, 3, 4]) {
      const o = simulate(150, seed);
      played += o.played;
      problems.push(...o.badPlay);
    }
    expect(played).toBeGreaterThan(8);
    expect(problems).toEqual([]);
  });

  it("people never end up inside a table or a counter", () => {
    for (const seed of [1, 2, 3]) {
      const o = simulate(120, seed);
      // a tolerance of a handful of frames out of tens of thousands
      expect(o.inStaticObstacle / o.samples).toBeLessThan(0.002);
    }
  });

  it("people who are not in it do not walk through an interaction", () => {
    let through = 0;
    let samples = 0;
    for (const seed of [1, 2, 3]) {
      const o = simulate(120, seed);
      through += o.throughZone;
      samples += o.samples;
    }
    expect(through / samples).toBeLessThan(0.003);
  });

  it("bodies are not overlapping before the collision backstop has to push them", () => {
    const o = simulate(90, 6);
    // the pair count per step is large; allow a small fraction
    expect(o.overlap / (o.samples * 8)).toBeLessThan(0.02);
  });

  it("every kind of interaction was exercised", () => {
    const kinds = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      // re-run just to collect kinds started
      const r = seeded(seed);
      const agents: SimAgent[] = Array.from({ length: 15 }, (_, i) => ({ id: i, x: (i % 5) * 2.0, z: Math.floor(i / 5) * 2.0, plan: null, directive: null, nextConsider: 0.5 }));
      let active: Active[] = [];
      for (let now = 0; now < 40; now += 0.1) {
        const s = stepInteractions(agents, active, now, r, { chance: 1 });
        active = s.active;
        s.events.started.forEach((ap) => kinds.add(ap.plan.kind));
        for (const a of agents) {
          const w = a.directive?.walkTo;
          if (w) {
            const d = Math.hypot(w.x - a.x, w.z - a.z);
            const k = Math.min(d, 0.115);
            if (d > 1e-6) {
              a.x += ((w.x - a.x) / d) * k;
              a.z += ((w.z - a.z) / d) * k;
            }
          }
        }
      }
    }
    expect([...kinds].sort()).toEqual([...KIND_LIST].sort());
    expect(KINDS.chat.cardinality).toBe("1:1");
  });
});
