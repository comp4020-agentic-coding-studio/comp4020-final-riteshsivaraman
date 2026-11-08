import { engagedMoment } from "./engage.ts";
import { ROUTES, routePose } from "./mall.ts";
import { NPCS, isStaff, npcPose } from "./npcs.ts";
import { STORE_Y, type Engagement } from "./protocol.ts";
import { resolveCollisions, separateFromPeople } from "./world.ts";

// People are solid (Ritesh, 2026-10-11): visitors cannot walk through staff,
// customers or each other, and the staff and customers cannot walk through
// each other either.
//
// NPCs and mall walkers move along fixed paths that are a pure function of the
// server clock, with no simulation to bump them. So their collision is a pure
// function too: take every path position at this instant, then settle them in
// a fixed order. Anyone working at a bench stays put; each other person is
// pushed out of everyone already placed and out of furniture. Every client and
// the server compute the same answer for the same moment.

export interface Settled {
  x: number;
  z: number;
}

export interface SettledPeople {
  npc: Map<string, Settled>; // NPC id -> where they actually stand
  walkway: Map<string, Settled>; // mall walker id -> same, for those on the store's floor
}

// `visitors`: real visitors to treat as fixed obstacles too, so an NPC's
// drawn position gives way to someone standing in its path instead of
// visually walking straight through them (Ritesh, 2026-10-12: "some npc just
// shove you to walk around... have npc treat other people as obstacles
// too"). Cosmetic only — an NPC's authoritative path (npcPose/routePose) is
// still a pure function of time alone, unaffected by where visitors stand;
// this only changes where it is drawn. Defaults to none, so every existing
// caller (nonVisitorPeople, resolving a visitor's own position) is unchanged.
// Where each NPC who is with someone stands (walking over, waving, talking),
// which is not where its timetable has it. Solid there, and not at its post.
export function engagedPlaces(engs: Iterable<Engagement>, nowMs: number): Map<string, Settled> {
  const out = new Map<string, Settled>();
  for (const e of engs) {
    const m = engagedMoment(e.npcId, e, nowMs);
    out.set(e.npcId, { x: m.x, z: m.z });
  }
  return out;
}

export function settledPeople(nowMs: number, visitors: ReadonlyArray<{ x: number; z: number }> = [], engaged: ReadonlyMap<string, Settled> = new Map()): SettledPeople {
  const npc = new Map<string, Settled>();
  const walkway = new Map<string, Settled>();
  const placed: Settled[] = visitors.map((v) => ({ x: v.x, z: v.z }));
  const place = (x: number, z: number, staff: boolean, fixed: boolean): Settled => {
    let p = { x, z };
    if (!fixed) {
      p = separateFromPeople(p.x, p.z, placed);
      p = resolveCollisions(p.x, p.z, staff ? "staff" : "customer");
      p = separateFromPeople(p.x, p.z, placed);
    }
    placed.push(p);
    return p;
  };
  // someone with a visitor stands where they are with them, and does not move for anyone
  for (const [id, at] of engaged) npc.set(id, place(at.x, at.z, true, true));
  // people at a bench first: they do not move for anyone
  for (const n of NPCS) {
    if (engaged.has(n.id)) continue;
    if (!n.working) continue;
    const b = npcPose(n, nowMs);
    npc.set(n.id, place(b.x, b.z, true, true));
  }
  for (const n of NPCS) {
    if (n.working || engaged.has(n.id)) continue;
    const b = npcPose(n, nowMs);
    if (!b.present) continue; // not in the store: nothing to collide with
    npc.set(n.id, place(b.x, b.z, isStaff(n), false));
  }
  for (const r of ROUTES) {
    if (r.y !== STORE_Y) continue;
    const b = routePose(r, nowMs);
    walkway.set(r.id, place(b.x, b.z, false, false));
  }
  return { npc, walkway };
}

// Where the people who are not visitors stand at server time `nowMs`, after
// colliding with each other. The ground-floor walkers are a floor below and
// cannot be bumped into.
export function nonVisitorPeople(
  nowMs: number,
  engaged: ReadonlyMap<string, Settled> = new Map(),
  visitors: ReadonlyArray<{ x: number; z: number }> = [],
): Array<{ x: number; z: number }> {
  // issue #38: pass the real visitor list through, so an NPC's position here
  // matches the visitor-aware position it is actually drawn at (Npcs.tsx) --
  // not a "nobody's around" fallback that disagreed with the real picture.
  const s = settledPeople(nowMs, visitors, engaged);
  return [...s.npc.values(), ...s.walkway.values()];
}

// A visitor's position after bumping into everyone else: visitors, staff,
// customers and walkers alike.
export function avoidPeople(
  x: number,
  z: number,
  visitors: ReadonlyArray<{ x: number; z: number }>,
  nowMs: number,
  engaged: ReadonlyMap<string, Settled> = new Map(),
): { x: number; z: number } {
  return separateFromPeople(x, z, [...visitors, ...nonVisitorPeople(nowMs, engaged, visitors)]);
}

// Bends a wanted walk direction (wx, wz, already a unit vector or zero) away
// from anyone nearby, before it is applied, so a person you are heading
// straight at is curved round like a table -- not just shoved apart after
// your positions already overlap (Ritesh, 2026-11-09: "treats every other
// customer as an obstacle you walk AROUND not into, like a TABLE"). Same
// steerTo geometry (steering.ts) used for furniture, applied to people: the
// push grows as you get close, and a push to the side (always the same side
// once committed, so a head-on pair pass each other rather than deadlock)
// is strongest for someone directly ahead.
const LOOK_AHEAD = 1.6; // metres: where a nearby person starts to bend your path
const MARGIN = 0.5; // metres: the gap this tries to keep clear

export function bendAroundPeople(
  wx: number,
  wz: number,
  x: number,
  z: number,
  others: ReadonlyArray<{ x: number; z: number }>,
): { x: number; z: number } {
  if (wx === 0 && wz === 0) return { x: wx, z: wz };
  let sx = wx;
  let sz = wz;
  const reach = MARGIN + LOOK_AHEAD;
  for (const o of others) {
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= reach || d < 1e-6) continue;
    const nx = dx / d;
    const nz = dz / d;
    const strength = Math.min(1, (reach - d) / reach);
    const ahead = Math.max(0, -(nx * wx + nz * wz)); // 1 when directly in the way
    sx += nx * strength * 1.2;
    sz += nz * strength * 1.2;
    // round it: always the same side once in the way, so a head-on pair pass
    // each other instead of both dodging the same way forever
    const side = -nz * wx + nx * wz >= 0 ? 1 : -1;
    sx += -nz * side * strength * ahead * 1.4;
    sz += nx * side * strength * ahead * 1.4;
  }
  const len = Math.hypot(sx, sz);
  if (len < 1e-6) return { x: wx, z: wz };
  return { x: sx / len, z: sz / len };
}
