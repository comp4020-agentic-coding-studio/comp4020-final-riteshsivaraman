import type { Behaviour } from "./behaviour.ts";
import type { Engagement } from "./protocol.ts";
import { headingTo, wrap } from "./steering.ts";
import { momentOf, planPath, type Moment } from "./storeday.ts";

// An NPC being served by a visitor (D1): it drops its timetable, walks to the
// visitor, stands facing them while they talk, and when released walks back and
// rejoins the day at the current time. All of it is a pure function of facts the
// server already sent (when it began, where the visitor stood, when it ended),
// so every client draws the same NPC in the same place.

const SPEED = 1.15;
export const STAND_OFF = 1.15; // how far from the visitor the NPC stands

interface Pt {
  x: number;
  z: number;
}

// where the NPC stands to talk: in front of the visitor, towards where it came from
export function servicePoint(from: Pt, visitor: Pt): Pt {
  const dx = from.x - visitor.x;
  const dz = from.z - visitor.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: visitor.x + (dx / d) * STAND_OFF, z: visitor.z + (dz / d) * STAND_OFF };
}

function along(path: { pts: Pt[]; secs: number }, t: number): { x: number; z: number; ry: number; walking: boolean } {
  const STEP = path.secs / Math.max(1, path.pts.length - 1);
  const f = Math.min(path.pts.length - 1, Math.max(0, t / STEP));
  const i = Math.floor(f);
  const a = path.pts[i];
  const b = path.pts[Math.min(path.pts.length - 1, i + 1)];
  const k = f - i;
  const ahead = path.pts[Math.min(path.pts.length - 1, i + 4)];
  const behind = path.pts[Math.max(0, i - 1)];
  const dx = ahead.x - behind.x;
  const dz = ahead.z - behind.z;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, ry: Math.hypot(dx, dz) > 1e-6 ? headingTo(0, 0, dx, dz) : 0, walking: t < path.secs - 1e-6 };
}

const asMoment = (p: { x: number; z: number; ry: number; walking: boolean }, mode: Behaviour, mood: string, intent: string): Moment => ({
  present: true,
  x: p.x,
  z: p.z,
  ry: p.ry,
  walking: p.walking,
  mode: p.walking ? "walk" : mode,
  mood,
  seated: false,
  device: false,
  intent,
});

// Where an engaged NPC is at server time `nowMs`.
export function engagedMoment(npcId: string, e: Engagement, nowMs: number): Moment {
  const start = momentOf(npcId, e.since);
  const goal = servicePoint(start, e.at);
  const path = planPath({ x: start.x, z: start.z }, goal, "staff");
  const t = Math.max(0, (nowMs - e.since) / 1000);
  const p = along(path, t);
  if (p.walking) return asMoment(p, "idle", "smile", "going over to help a visitor");
  // arrived: facing the visitor, talking
  const ry = headingTo(goal.x, goal.z, e.at.x, e.at.z);
  return asMoment({ x: goal.x, z: goal.z, ry, walking: false }, "talk", "smile", "helping a visitor");
}

export interface Release {
  at: number; // server time it was let go
  from: Pt; // where it stood then
}

// Where an NPC is after being let go: walking back to where the day has got
// to. The target moves while it walks, so the walk is planned to where the
// timetable will have the NPC when it arrives (a couple of passes settle it).
export function rejoinMoment(npcId: string, r: Release, nowMs: number): Moment | null {
  let secs = 0;
  let target: Pt = { x: momentOf(npcId, r.at).x, z: momentOf(npcId, r.at).z };
  let path = planPath(r.from, target, "staff");
  for (let pass = 0; pass < 3; pass++) {
    secs = path.secs;
    const m = momentOf(npcId, r.at + secs * 1000);
    target = { x: m.x, z: m.z };
    path = planPath(r.from, target, "staff");
  }
  const t = (nowMs - r.at) / 1000;
  if (t >= path.secs) return null; // back in step with the day
  const p = along(path, Math.max(0, t));
  return asMoment(p, "idle", "neutral", "going back to their post");
}

export const speedOf = SPEED;
export { wrap };
