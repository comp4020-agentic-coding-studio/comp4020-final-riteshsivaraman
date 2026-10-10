import { ROUTES, routePose } from "./mall.ts";
import { NPCS, npcPose } from "./npcs.ts";
import { STORE_Y } from "./protocol.ts";
import { separateFromPeople } from "./world.ts";

// Where the people who are not visitors stand at server time `nowMs`: the
// store's staff and customers, and the mall's walkers who are on the store's
// floor (the first-floor walkway). Ground-floor walkers are a floor below and
// cannot be bumped into. The server and the browser both use this, so the same
// bodies stop a visitor in both places.
export function nonVisitorPeople(nowMs: number): Array<{ x: number; z: number }> {
  const list: Array<{ x: number; z: number }> = [];
  for (const n of NPCS) {
    const p = npcPose(n, nowMs);
    list.push({ x: p.x, z: p.z });
  }
  for (const r of ROUTES) {
    if (r.y !== STORE_Y) continue;
    const p = routePose(r, nowMs);
    list.push({ x: p.x, z: p.z });
  }
  return list;
}

// A visitor's position after bumping into everyone else: visitors, staff,
// customers and walkers alike.
export function avoidPeople(
  x: number,
  z: number,
  visitors: ReadonlyArray<{ x: number; z: number }>,
  nowMs: number,
): { x: number; z: number } {
  return separateFromPeople(x, z, [...visitors, ...nonVisitorPeople(nowMs)]);
}
