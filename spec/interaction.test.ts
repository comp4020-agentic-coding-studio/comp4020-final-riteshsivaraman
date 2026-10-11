import { describe, expect, it } from "vitest";
import { BEHAVIOURS } from "../src/shared/behaviour.ts";
import { INTERACTION_RANGE, KINDS, KIND_LIST, layout, playPose, propose, type Agent } from "../src/shared/interaction.ts";
import { BODY_RADIUS } from "../src/shared/world.ts";

// Promise: an interaction only starts between free people who are near; each
// end's role fits the other's; and everyone has room to stand, so the
// collision rule never has to fight the layout. How it looks is judged by eye.
const agent = (id: number, x: number, z: number, free = true): Agent => ({ id, x, z, free });
const always = (): number => 0; // r() = 0: passes the chance roll, picks the first kind
const seeded = (n: number) => {
  let a = n;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
};

describe("propose", () => {
  it("needs someone free and within range", () => {
    const me = agent(0, 0, 0);
    expect(propose(me, [], always)).toBeNull();
    expect(propose(me, [agent(1, INTERACTION_RANGE + 1, 0)], always)).toBeNull(); // too far
    expect(propose(me, [agent(1, 1, 0, false)], always)).toBeNull(); // busy
    expect(propose(agent(0, 0, 0, false), [agent(1, 1, 0)], always)).toBeNull(); // initiator busy
    expect(propose(me, [agent(1, 1, 0)], always)).not.toBeNull();
  });

  it("does not always start, even when everyone is near", () => {
    const me = agent(0, 0, 0);
    const others = [agent(1, 1, 0), agent(2, 0, 1)];
    expect(propose(me, others, () => 0.99)).toBeNull();
    const r = seeded(7);
    let started = 0;
    for (let i = 0; i < 400; i++) if (propose(me, others, r)) started++;
    expect(started).toBeGreaterThan(80);
    expect(started).toBeLessThan(260);
  });

  it("puts the initiator first, and keeps to each kind's size", () => {
    const people = Array.from({ length: 9 }, (_, i) => agent(i, Math.cos(i) * 1.5, Math.sin(i) * 1.5));
    const r = seeded(3);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const plan = propose(people[0], people, r, 1)!;
      expect(plan.members[0]).toBe(0);
      expect(new Set(plan.members).size).toBe(plan.members.length);
      const [lo, hi] = KINDS[plan.kind].people;
      expect(plan.members.length).toBeGreaterThanOrEqual(lo);
      expect(plan.members.length).toBeLessThanOrEqual(hi);
      expect(plan.slots.length).toBe(plan.members.length);
      seen.add(plan.kind);
    }
    expect([...seen].sort()).toEqual([...KIND_LIST].sort());
  });

  it("never plans a group bigger than who is there", () => {
    const plan = propose(agent(0, 0, 0), [agent(1, 1, 0)], seeded(1), 1)!;
    expect(plan.members.length).toBe(2);
    expect(KINDS[plan.kind].cardinality).toBe("1:1");
  });
});

describe("layout", () => {
  const group = (n: number): Agent[] => Array.from({ length: n }, (_, i) => agent(i, i * 0.4, (i % 2) * 0.3));

  it("leaves everyone room: no two slots closer than two body radii", () => {
    for (const kind of KIND_LIST) {
      const [lo, hi] = KINDS[kind].people;
      for (let n = lo; n <= hi; n++) {
        const slots = layout(kind, group(n));
        for (let i = 0; i < slots.length; i++) {
          for (let j = i + 1; j < slots.length; j++) {
            expect(Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z)).toBeGreaterThanOrEqual(BODY_RADIUS * 2 + 0.05);
          }
        }
      }
    }
  });

  it("a pair stand face to face, each looking at the other", () => {
    for (const kind of ["chat", "handshake"] as const) {
      const [a, b] = layout(kind, [agent(0, 0, 0), agent(1, 0.2, 2)]);
      expect(a.faceX).toBeCloseTo(b.x);
      expect(a.faceZ).toBeCloseTo(b.z);
      expect(b.faceX).toBeCloseTo(a.x);
      expect(b.faceZ).toBeCloseTo(a.z);
    }
  });

  it("an audience all look at the one they are watching, who stays put", () => {
    for (const kind of ["address", "applaud"] as const) {
      const people = group(5);
      const slots = layout(kind, people);
      expect(slots[0].x).toBeCloseTo(people[0].x);
      expect(slots[0].z).toBeCloseTo(people[0].z);
      for (const s of slots.slice(1)) {
        expect(s.faceX).toBeCloseTo(people[0].x);
        expect(s.faceZ).toBeCloseTo(people[0].z);
      }
    }
  });

  it("a circle faces the middle, evenly", () => {
    const slots = layout("circle", group(4));
    const cx = slots.reduce((a, s) => a + s.x, 0) / 4;
    const cz = slots.reduce((a, s) => a + s.z, 0) / 4;
    const radii = slots.map((s) => Math.hypot(s.x - cx, s.z - cz));
    for (const r of radii) expect(r).toBeCloseTo(radii[0]);
    for (const s of slots) {
      expect(s.faceX).toBeCloseTo(cx);
      expect(s.faceZ).toBeCloseTo(cz);
    }
  });
});

describe("playPose: both ends fit", () => {
  const ts = Array.from({ length: 80 }, (_, i) => i * 0.25);

  it("only uses behaviours and moods that exist", () => {
    const moods = ["neutral", "smile", "curious", "focused", "surprised", "worried"];
    for (const kind of KIND_LIST) {
      for (let n = KINDS[kind].people[0]; n <= KINDS[kind].people[1]; n++) {
        for (let i = 0; i < n; i++) {
          for (const t of ts) {
            const p = playPose(kind, i, n, t, 12);
            expect(BEHAVIOURS).toContain(p.mode);
            expect(moods).toContain(p.mood);
          }
        }
      }
    }
  });

  it("in a chat exactly one talks and the other listens, and they swap", () => {
    const talkers = new Set<number>();
    for (const t of ts) {
      const a = playPose("chat", 0, 2, t, 12).mode;
      const b = playPose("chat", 1, 2, t, 12).mode;
      expect([a, b].filter((m) => m === "talk").length).toBe(1);
      expect([a, b].filter((m) => m === "listen").length).toBe(1);
      talkers.add(a === "talk" ? 0 : 1);
    }
    expect(talkers.size).toBe(2);
  });

  it("in a circle exactly one speaks at a time, and everyone gets a turn", () => {
    const speakers = new Set<number>();
    for (const t of ts) {
      const modes = [0, 1, 2, 3].map((i) => playPose("circle", i, 4, t, 15).mode);
      expect(modes.filter((m) => m === "talk").length).toBe(1);
      expect(modes.filter((m) => m === "listen").length).toBe(3);
      speakers.add(modes.indexOf("talk"));
    }
    expect(speakers.size).toBe(4);
  });

  it("a handshake has both reaching out at the same moment", () => {
    for (const t of ts.filter((x) => x < 4)) {
      expect(playPose("handshake", 0, 2, t, 4).mode).toBe(playPose("handshake", 1, 2, t, 4).mode);
    }
    expect(playPose("handshake", 0, 2, 2, 4).mode).toBe("handshake");
  });

  it("an audience claps while the one they watch waves and bows", () => {
    const performer = new Set<string>();
    for (const t of ts.filter((x) => x < 6)) {
      performer.add(playPose("applaud", 0, 5, t, 6).mode);
      for (let i = 1; i < 5; i++) expect(playPose("applaud", i, 5, t, 6).mode).toBe("clap");
    }
    // they do both across the performance, not just one of them
    expect([...performer].sort()).toEqual(["bow", "wave"]);
  });

  it("an address has the speaker speak and the rest listen, then clap at the end", () => {
    expect(["talk", "point"]).toContain(playPose("address", 0, 4, 3, 14).mode);
    expect(playPose("address", 2, 4, 3, 14).mode).toBe("listen");
    expect(playPose("address", 2, 4, 13, 14).mode).toBe("clap");
  });
});

// A crowd over two minutes, walkers modelled as moving straight at their slot.
import { INTERACTION_RANGE as RANGE, stepInteractions, type Active, type SimAgent } from "../src/shared/interaction.ts";

describe("stepInteractions over time", () => {
  function run(seconds: number, seed: number, count = 14) {
    const r = seeded(seed);
    const agents: SimAgent[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: (i % 5) * 1.8,
      z: Math.floor(i / 5) * 2.0,
      plan: null,
      directive: null,
      nextConsider: 1 + (i % 7) * 0.5,
    }));
    let active: Active[] = [];
    const log = { started: [] as Array<{ kind: string; members: number[]; dists: number[] }>, played: 0, ended: 0, cancelled: 0, doubleBooked: 0, maxActive: 0 };
    const dt = 0.1;
    for (let now = 0; now < seconds; now += dt) {
      const before = agents.map((a) => ({ x: a.x, z: a.z }));
      const step = stepInteractions(agents, active, now, r);
      active = step.active;
      for (const ap of step.events.started) {
        const init = before[ap.plan.members[0]];
        log.started.push({ kind: ap.plan.kind, members: ap.plan.members, dists: ap.plan.members.slice(1).map((id) => Math.hypot(before[id].x - init.x, before[id].z - init.z)) });
      }
      log.played += step.events.played.length;
      log.ended += step.events.ended.length;
      log.cancelled += step.events.cancelled.length;
      // nobody is in two at once
      const seen = new Set<number>();
      for (const ap of active) for (const id of ap.plan.members) {
        if (seen.has(id)) log.doubleBooked++;
        seen.add(id);
      }
      log.maxActive = Math.max(log.maxActive, active.length);
      // walk each directed agent towards where they were asked to be
      for (const a of agents) {
        const w = a.directive?.walkTo;
        if (!w) continue;
        const d = Math.hypot(w.x - a.x, w.z - a.z);
        const s = Math.min(d, 1.15 * dt);
        if (d > 1e-6) {
          a.x += ((w.x - a.x) / d) * s;
          a.z += ((w.z - a.z) / d) * s;
        }
      }
    }
    return { agents, active, log };
  }

  it("starts interactions on its own, and they play out and end", () => {
    const { log } = run(120, 11);
    expect(log.started.length).toBeGreaterThan(5);
    expect(log.played).toBeGreaterThan(3);
    expect(log.ended).toBeGreaterThan(3);
    expect(log.doubleBooked).toBe(0);
  });

  it("only starts between people who were within range of whoever started it", () => {
    const { log } = run(120, 5);
    expect(log.started.length).toBeGreaterThan(0);
    for (const s of log.started) for (const d of s.dists) expect(d).toBeLessThanOrEqual(RANGE + 1e-9);
  });

  it("does not always start one: some people near each other just carry on", () => {
    const { log } = run(60, 2);
    // fourteen people packed within range could have started far more than this
    expect(log.started.length).toBeLessThan(40);
  });

  it("shows a spread of kinds across a crowd", () => {
    const kinds = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) for (const s of run(120, seed).log.started) kinds.add(s.kind);
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it("lets everyone go when it is over: nobody is left stuck with a directive", () => {
    const { agents, active } = run(120, 9);
    const inActive = new Set(active.flatMap((ap) => ap.plan.members));
    for (const a of agents) {
      if (!inActive.has(a.id)) {
        expect(a.plan).toBeNull();
        expect(a.directive).toBeNull();
      }
    }
  });

  it("calls it off when someone cannot get there, rather than waiting forever", () => {
    // everyone is rooted to the spot, so no one can reach a slot
    const r = seeded(4);
    const agents: SimAgent[] = [0, 1, 2].map((i) => ({ id: i, x: i * 1.5, z: 0, plan: null, directive: null, nextConsider: 0 }));
    let active: Active[] = [];
    let cancelled = 0;
    for (let now = 0; now < 40; now += 0.1) {
      const step = stepInteractions(agents, active, now, r, { chance: 1 });
      active = step.active;
      cancelled += step.events.cancelled.length;
    }
    expect(cancelled).toBeGreaterThan(0);
    expect(active.length).toBeLessThanOrEqual(1);
  });
});
