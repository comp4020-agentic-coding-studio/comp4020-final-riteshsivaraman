import { NPC_NAME } from "./duty.ts";
import { FLOOR, type HeldCpu } from "./protocol.ts";
import { headingTo } from "./steering.ts";
import { momentOf, planPath, type Moment } from "./storeday.ts";

// A promoted timetable customer (issue #20, ADR 10, D56) as every client draws
// it (issue #41). While the store's rules have it, the server holds it at the
// spot it was promoted on, so it is drawn there and not along its timetable;
// once it has left it walks out of the door from there, and is not drawn
// again until its timetable day has it out of the store too. After that it is
// an ordinary timetable customer again (the next day's visit is a new visit).
//
// Pure functions of what the server sent (service.ts heldCpuCustomers) and the
// clock, like engage.ts, so every client draws the same thing and a spec can
// check it without a renderer.

const DOOR_Z = FLOOR.minZ - 1.7; // where a timetable customer goes when it leaves (storeday.ts)

// the walk from where it was held out of the door
const walkOut = (h: HeldCpu): { pts: Array<{ x: number; z: number }>; secs: number } =>
  planPath(h.at, { x: Math.max(-0.9, Math.min(0.9, h.at.x)), z: DOOR_Z }, "customer");

// Where a held (or leaving) timetable customer is at server time `now`, and
// what it is doing; null once it is out of the door (draw nothing). `chatWith`
// is where the person it is talking with stands, if anyone.
export function heldMoment(h: HeldCpu, now: number, chatWith?: { x: number; z: number }): Moment | null {
  if (h.leftAt === undefined || now < h.leftAt) {
    // how it stood when it was promoted: looking at the table it was waiting at
    const was = momentOf(h.id, h.since);
    return {
      present: true,
      x: h.at.x,
      z: h.at.z,
      ry: chatWith ? headingTo(h.at.x, h.at.z, chatWith.x, chatWith.z) : was.ry,
      walking: false,
      mode: chatWith || was.walking ? "idle" : was.mode,
      mood: was.mood,
      seated: false,
      device: false,
      gaze: chatWith ? { x: chatWith.x, y: 1.55, z: chatWith.z } : was.gaze,
      intent: chatWith ? "talking with a member of staff" : "waiting for someone to come over",
    };
  }
  const path = walkOut(h);
  const t = (now - h.leftAt) / 1000;
  if (t >= path.secs || path.pts.length < 2) return null;
  const step = path.secs / (path.pts.length - 1);
  const f = Math.max(0, t / step);
  const i = Math.min(path.pts.length - 2, Math.floor(f));
  const a = path.pts[i]!;
  const b = path.pts[i + 1]!;
  const k = Math.min(1, f - i);
  const ahead = path.pts[Math.min(path.pts.length - 1, i + 4)]!;
  return {
    present: true,
    x: a.x + (b.x - a.x) * k,
    z: a.z + (b.z - a.z) * k,
    ry: headingTo(a.x, a.z, ahead.x, ahead.z),
    walking: true,
    mode: "walk",
    mood: "neutral",
    seated: false,
    device: false,
    intent: "leaving",
  };
}

// Whether a departed one is finished with: out of the door, and its day no
// longer has it in the store, so its timetable may draw it again.
export function heldDone(h: HeldCpu, now: number): boolean {
  return h.leftAt !== undefined && heldMoment(h, now) === null && !momentOf(h.id, now).present;
}

// Where each held (or departed) one stands now, for people.ts's collisions,
// which otherwise put a timetable customer where its timetable has it. One
// out of the door but not yet back on its timetable is placed far off the
// map, so nobody bumps into a person who is not drawn.
const NOWHERE = { x: 1e4, z: 1e4 };
export function heldPlaces(held: Iterable<HeldCpu>, now: number): Map<string, { x: number; z: number }> {
  const out = new Map<string, { x: number; z: number }>();
  for (const h of held) {
    const m = heldMoment(h, now);
    out.set(h.id, m ? { x: m.x, z: m.z } : NOWHERE);
  }
  return out;
}

// The promoted customers a member of staff may walk up to and press E at:
// held (not left) and not already talking with someone. The same rule Store.tsx's
// hint loop applies to a real visitor customer (`!net.chats.has(id)`).
export function heldTalkCandidates(
  held: Iterable<HeldCpu>,
  chatting: { has(id: string): boolean },
  now: number,
): Array<{ id: string; name: string; x: number; z: number }> {
  const out: Array<{ id: string; name: string; x: number; z: number }> = [];
  for (const h of held) {
    if (h.leftAt !== undefined && now >= h.leftAt) continue;
    if (chatting.has(h.id)) continue;
    out.push({ id: h.id, name: NPC_NAME[h.id] ?? h.id, x: h.at.x, z: h.at.z });
  }
  return out;
}
