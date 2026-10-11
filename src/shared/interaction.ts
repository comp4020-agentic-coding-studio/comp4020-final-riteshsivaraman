import type { Behaviour } from "./behaviour.ts";
import { headingTo, wrap, type Obstacle } from "./steering.ts";

// Interactions between people: things that only work with a partner and where
// each end does something that fits the other. Like behaviours, the decisions
// are pure (they take positions and random numbers), so a crowd, a test and
// later the store's NPCs can all use them and agree.
//
//   chat       1 to 1     they take turns: one talks while the other listens
//   handshake  1 to 1     both reach out at the same moment
//   address    1 to many  one speaks, the others listen, and applaud at the end
//   applaud    many to 1  an audience claps for one who waves and bows
//   circle     many to many  a ring of people, each taking a turn to speak
//
// An interaction only starts between people who are free and within range, and
// even then only some of the time: being near is necessary, not sufficient.

export type InteractionKind = "chat" | "handshake" | "address" | "applaud" | "circle";

export interface KindSpec {
  cardinality: "1:1" | "1:n" | "n:1" | "n:n";
  people: [number, number]; // fewest and most, counting the initiator
  weight: number;
  duration: [number, number]; // seconds of playing, after everyone is in place
}

export const KINDS: Record<InteractionKind, KindSpec> = {
  chat: { cardinality: "1:1", people: [2, 2], weight: 5, duration: [9, 18] },
  handshake: { cardinality: "1:1", people: [2, 2], weight: 2, duration: [3.5, 5] },
  address: { cardinality: "1:n", people: [3, 6], weight: 2, duration: [10, 18] },
  applaud: { cardinality: "n:1", people: [3, 7], weight: 1.5, duration: [5, 8] },
  circle: { cardinality: "n:n", people: [3, 5], weight: 2.5, duration: [10, 20] },
};

export const KIND_LIST = Object.keys(KINDS) as InteractionKind[];

// The default distance within which someone might start one.
export const INTERACTION_RANGE = 3.2;

export interface Agent {
  id: number;
  x: number;
  z: number;
  free: boolean;
}

export interface Slot {
  x: number;
  z: number;
  faceX: number; // the point they look at while it plays
  faceZ: number;
}

export interface Plan {
  kind: InteractionKind;
  members: number[]; // members[0] started it, and is the focus of a 1:n or n:1
  slots: Slot[]; // slots[i] is where members[i] stands
  duration: number;
}

const norm = (x: number, z: number): [number, number] => {
  const d = Math.hypot(x, z);
  return d < 1e-6 ? [1, 0] : [x / d, z / d];
};

export function durationFor(kind: InteractionKind, r: number): number {
  const [lo, hi] = KINDS[kind].duration;
  return lo + (hi - lo) * r;
}

// Decides whether `initiator` starts something with the free people near them,
// and what, and where everyone will stand. `r` is a random source in [0, 1).
// Returns null when nothing can happen (nobody free and near, or the roll says
// not now).
export function propose(initiator: Agent, others: ReadonlyArray<Agent>, r: () => number, chance = 0.4, range = INTERACTION_RANGE): Plan | null {
  if (!initiator.free) return null;
  const near = others
    .filter((o) => o.id !== initiator.id && o.free && Math.hypot(o.x - initiator.x, o.z - initiator.z) <= range)
    .sort((a, b) => Math.hypot(a.x - initiator.x, a.z - initiator.z) - Math.hypot(b.x - initiator.x, b.z - initiator.z));
  if (near.length === 0) return null;
  if (r() >= chance) return null; // near enough, but not every time
  const total = near.length + 1;
  const eligible = KIND_LIST.filter((k) => KINDS[k].people[0] <= total);
  const wsum = eligible.reduce((a, k) => a + KINDS[k].weight, 0);
  let x = r() * wsum;
  let kind = eligible[eligible.length - 1];
  for (const k of eligible) {
    x -= KINDS[k].weight;
    if (x < 0) {
      kind = k;
      break;
    }
  }
  const [lo, hi] = KINDS[kind].people;
  const n = Math.min(total, lo + Math.floor(r() * (hi - lo + 1)));
  const members = [initiator, ...near.slice(0, n - 1)];
  return { kind, members: members.map((m) => m.id), slots: layout(kind, members), duration: durationFor(kind, r()) };
}

// Where each member stands and what they look at.
export function layout(kind: InteractionKind, members: ReadonlyArray<Agent>): Slot[] {
  const n = members.length;
  const cx = members.reduce((a, m) => a + m.x, 0) / n;
  const cz = members.reduce((a, m) => a + m.z, 0) / n;
  if (kind === "chat" || kind === "handshake") {
    // face to face, on the line between them, about arm's length apart
    const [ux, uz] = norm(members[0].x - members[1].x, members[0].z - members[1].z);
    const half = (kind === "handshake" ? 0.9 : 1.1) / 2;
    const a = { x: cx + ux * half, z: cz + uz * half };
    const b = { x: cx - ux * half, z: cz - uz * half };
    return [
      { ...a, faceX: b.x, faceZ: b.z },
      { ...b, faceX: a.x, faceZ: a.z },
    ];
  }
  if (kind === "address" || kind === "applaud") {
    // the focus stays put; the rest make an arc in front of them, looking at
    // the focus
    const f = members[0];
    const rest = members.slice(1);
    const lx = rest.reduce((a, m) => a + m.x, 0) / rest.length;
    const lz = rest.reduce((a, m) => a + m.z, 0) / rest.length;
    const [dx, dz] = norm(lx - f.x, lz - f.z);
    const base = Math.atan2(dz, dx);
    const radius = kind === "applaud" ? 2.1 : 1.8;
    const spread = Math.min(1.0, 0.34 * (rest.length - 1));
    const slots: Slot[] = [{ x: f.x, z: f.z, faceX: lx, faceZ: lz }];
    rest.forEach((_, i) => {
      const t = rest.length === 1 ? 0 : -spread + (2 * spread * i) / (rest.length - 1);
      const ang = base + t;
      slots.push({ x: f.x + Math.cos(ang) * radius, z: f.z + Math.sin(ang) * radius, faceX: f.x, faceZ: f.z });
    });
    return slots;
  }
  // circle: evenly round the middle, starting near where the first person is
  const radius = Math.max(1.0, (n * 0.9) / (2 * Math.PI));
  const start = Math.atan2(members[0].z - cz, members[0].x - cx);
  return members.map((_, i) => {
    const ang = start + (i * 2 * Math.PI) / n;
    return { x: cx + Math.cos(ang) * radius, z: cz + Math.sin(ang) * radius, faceX: cx, faceZ: cz };
  });
}

// What member `index` of `n` is doing `t` seconds into playing, and the mood
// that goes with it. The two ends are written together so they fit: when one
// talks the other listens, both reach out at once, an audience claps for the
// bow.
export function playPose(kind: InteractionKind, index: number, n: number, t: number, duration: number): { mode: Behaviour; mood: string } {
  switch (kind) {
    case "chat": {
      const speaker = Math.floor(t / 3.6) % 2;
      return index === speaker ? { mode: "talk", mood: "smile" } : { mode: "listen", mood: t % 3.6 < 0.4 ? "curious" : "neutral" };
    }
    case "handshake":
      // a beat to look at each other, then both reach out, then both smile
      return t < 0.6 || t > duration - 0.5 ? { mode: "idle", mood: "smile" } : { mode: "handshake", mood: "smile" };
    case "address": {
      if (index === 0) return { mode: Math.floor(t / 5) % 3 === 2 ? "point" : "talk", mood: "neutral" };
      return duration - t < 2.2 ? { mode: "clap", mood: "smile" } : { mode: "listen", mood: Math.floor((t + index) / 4) % 2 ? "curious" : "neutral" };
    }
    case "applaud": {
      if (index === 0) return { mode: t < duration * 0.5 ? "wave" : "bow", mood: "smile" };
      return { mode: "clap", mood: "smile" };
    }
    case "circle": {
      const speaker = Math.floor(t / 3.4) % n;
      return index === speaker ? { mode: "talk", mood: "smile" } : { mode: "listen", mood: (index + Math.floor(t / 3.4)) % 3 === 0 ? "curious" : "neutral" };
    }
  }
}

// ---- running them over time ----
// stepInteractions is the whole life of an interaction in one pure function, so
// a test can run minutes of a crowd in a blink and the client only has to move
// people towards the places it is given.

export interface Directive {
  mode: Behaviour;
  mood?: string;
  walkTo?: { x: number; z: number };
  faceTo?: { x: number; z: number };
}

export interface Active {
  plan: Plan;
  state: "gather" | "play";
  startedAt: number;
  t0: number; // when playing began, in the same clock as `now`
}

export interface SimAgent {
  id: number;
  x: number;
  z: number;
  heading?: number; // if known, play waits until they face the right way
  plan: Active | null;
  directive: Directive | null;
  nextConsider: number;
}

export const GATHER_TIMEOUT = 16; // seconds to get everyone in place, or call it off
export const ARRIVED = 0.25; // metres from their place that counts as there
export const FACING = 0.35; // radians off the way they should face that still counts

// The ground an interaction uses: everyone in it and a little room round them.
// Walkers not in it go round this, so nobody cuts through a conversation.
export function zoneOf(plan: Plan): Obstacle {
  const n = plan.slots.length;
  const cx = plan.slots.reduce((a, s) => a + s.x, 0) / n;
  const cz = plan.slots.reduce((a, s) => a + s.z, 0) / n;
  const r = Math.max(...plan.slots.map((s) => Math.hypot(s.x - cx, s.z - cz))) + 0.6;
  return { kind: "disc", x: cx, z: cz, r, hard: true }; // hard: only the people in it may stand there
}

export interface StepEvents {
  started: Active[];
  played: Active[]; // everyone got there and it began
  ended: Active[]; // played to the end
  cancelled: Active[]; // someone could not get there in time
}

// Advances every agent's interaction state to `now`. Mutates agents' plan and
// directive and returns the new list of active interactions.
export function stepInteractions(
  agents: SimAgent[],
  active: Active[],
  now: number,
  r: () => number,
  opts: { enabled?: boolean; chance?: number; range?: number } = {},
): { active: Active[]; events: StepEvents } {
  const events: StepEvents = { started: [], played: [], ended: [], cancelled: [] };
  let live = [...active];
  const release = (ap: Active): void => {
    for (const id of ap.plan.members) {
      const a = agents[id];
      a.plan = null;
      a.directive = null;
      a.nextConsider = now + 4 + r() * 6; // a rest before the next one
    }
    live = live.filter((x) => x !== ap);
  };

  if (opts.enabled ?? true) {
    const view: Agent[] = agents.map((a) => ({ id: a.id, x: a.x, z: a.z, free: a.plan === null }));
    for (const a of agents) {
      if (a.plan || now < a.nextConsider) continue;
      a.nextConsider = now + 2 + r() * 4;
      const plan = propose(view[a.id], view, r, opts.chance, opts.range);
      if (!plan) continue;
      // not on top of one that is already going: two groups cannot share ground
      const zone = zoneOf(plan) as { x: number; z: number; r: number };
      const crowded = live.some((ap) => {
        const other = zoneOf(ap.plan) as { x: number; z: number; r: number };
        return Math.hypot(zone.x - other.x, zone.z - other.z) < zone.r + other.r + 0.3;
      });
      if (crowded) continue;
      // nor round someone who is not in it: they would end up trapped in the
      // middle of a ring of people, with no way out
      const stranger = agents.some((o) => !plan.members.includes(o.id) && Math.hypot(o.x - zone.x, o.z - zone.z) < zone.r + 0.25);
      if (stranger) continue;
      const ap: Active = { plan, state: "gather", startedAt: now, t0: now };
      live.push(ap);
      events.started.push(ap);
      plan.members.forEach((id, i) => {
        agents[id].plan = ap;
        view[id].free = false; // so nobody else picks them this same step
        const s = plan.slots[i];
        agents[id].directive = { mode: "walk", walkTo: { x: s.x, z: s.z }, faceTo: { x: s.faceX, z: s.faceZ } };
      });
    }
  }

  for (const ap of [...live]) {
    const members = ap.plan.members.map((id) => agents[id]);
    if (ap.state === "gather") {
      const arrived = members.every((a, i) => {
        const s = ap.plan.slots[i];
        const there = Math.hypot(a.x - s.x, a.z - s.z) < ARRIVED;
        if (!there || a.heading === undefined) return there;
        return Math.abs(wrap(headingTo(a.x, a.z, s.faceX, s.faceZ) - a.heading)) < FACING;
      });
      if (arrived) {
        ap.state = "play";
        ap.t0 = now;
        events.played.push(ap);
      } else if (now - ap.startedAt > GATHER_TIMEOUT) {
        events.cancelled.push(ap);
        release(ap);
        continue;
      }
    }
    if (ap.state === "play") {
      const t = now - ap.t0;
      if (t > ap.plan.duration) {
        events.ended.push(ap);
        release(ap);
        continue;
      }
      members.forEach((a, i) => {
        const p = playPose(ap.plan.kind, i, members.length, t, ap.plan.duration);
        const s = ap.plan.slots[i];
        a.directive = { mode: p.mode, mood: p.mood, faceTo: { x: s.faceX, z: s.faceZ } };
      });
    }
  }
  return { active: live, events };
}
