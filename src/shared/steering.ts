// Walking that goes round things, instead of through them. Pure, so the demo,
// the store's NPCs and a spec all walk the same way.
//
// A walker has a goal and a list of obstacles (round things, rectangles, other
// people, and the ground an interaction is using). Each frame it is pulled
// towards the goal and pushed away from anything near, with a push sideways as
// well so it slides round rather than stopping. When two meet head on they both
// pass on the same side of themselves, so neither deadlocks. Heading follows the
// convention used everywhere: forward is (-sin h, -cos h), so 0 faces -z.

// `hard` obstacles (tables, walls) can never be walked into: a step that would
// go inside is pushed back out. Soft ones (people, the ground an interaction
// is using) are steered round but can be brushed past.
export type Obstacle =
  | { kind: "disc"; x: number; z: number; r: number; hard?: boolean }
  | { kind: "rect"; minX: number; maxX: number; minZ: number; maxZ: number; hard?: boolean };

export interface Walker {
  x: number;
  z: number;
  heading: number;
  side?: number; // +1 or -1 while going round something, 0 when the way is clear
}

export const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
export const headingTo = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z));

// Distance from (x, z) to the edge of an obstacle (negative inside) and the
// unit vector pointing away from it there.
export function clearance(o: Obstacle, x: number, z: number): { d: number; nx: number; nz: number } {
  if (o.kind === "disc") {
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return { d: -o.r, nx: 1, nz: 0 };
    return { d: d - o.r, nx: dx / d, nz: dz / d };
  }
  const cx = Math.min(o.maxX, Math.max(o.minX, x));
  const cz = Math.min(o.maxZ, Math.max(o.minZ, z));
  const dx = x - cx;
  const dz = z - cz;
  const d = Math.hypot(dx, dz);
  if (d > 1e-6) return { d, nx: dx / d, nz: dz / d };
  // inside: out through the nearest side
  const l = x - o.minX;
  const r = o.maxX - x;
  const t = z - o.minZ;
  const b = o.maxZ - z;
  const m = Math.min(l, r, t, b);
  if (m === l) return { d: -l, nx: -1, nz: 0 };
  if (m === r) return { d: -r, nx: 1, nz: 0 };
  if (m === t) return { d: -t, nx: 0, nz: -1 };
  return { d: -b, nx: 0, nz: 1 };
}

export interface SteerOpts {
  lookAhead?: number; // how far away something starts to matter
  margin?: number; // the room they try to keep from it
  turnRate?: number; // radians per second
}

// The heading to walk at, and how fast (0 to 1), to get from (x, z) to `goal`.
export function steerTo(
  w: Walker,
  goal: { x: number; z: number },
  obstacles: ReadonlyArray<Obstacle>,
  dt: number,
  opts: SteerOpts = {},
): { heading: number; speed: number } {
  const lookAhead = opts.lookAhead ?? 1.5;
  const margin = opts.margin ?? 0.45;
  const turnRate = opts.turnRate ?? 4.5;
  const dx = goal.x - w.x;
  const dz = goal.z - w.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return { heading: w.heading, speed: 0 };
  const gx = dx / dist;
  const gz = dz / dist;
  let sx = gx;
  let sz = gz;
  let slow = 1;
  let blocked = 0; // how much something is straight in the way
  const reach = margin + lookAhead;
  for (const o of obstacles) {
    const c = clearance(o, w.x, w.z);
    if (c.d >= reach) continue;
    const strength = Math.min(1, (reach - c.d) / reach);
    // how much it is in the way of where we are going: 1 straight ahead
    const ahead = Math.max(0, -(c.nx * gx + c.nz * gz));
    // away from it
    sx += c.nx * strength * 1.4;
    sz += c.nz * strength * 1.4;
    // and round it: along its edge, on the side that goes our way. When it is
    // straight ahead either side is as good, so always take the same one (the
    // left, rotating the away vector a quarter turn) so a head-on pair pass
    // each other instead of stopping.
    let tx = -c.nz;
    let tz = c.nx;
    const along = tx * gx + tz * gz;
    // once something is in the way, a side is chosen and kept (otherwise the
    // push left and right balance, and the walker shuffles into it)
    let side = along < -1e-3 ? -1 : 1;
    if (ahead > 0.15) {
      if (!w.side) w.side = side;
      side = w.side;
    }
    tx *= side;
    tz *= side;
    blocked = Math.max(blocked, strength * ahead);
    sx += tx * strength * (0.5 + ahead * 1.6);
    sz += tz * strength * (0.5 + ahead * 1.6);
    // slow down as it gets close, rather than only inside the margin
    slow = Math.min(slow, Math.max(0.25, Math.min(1, c.d / margin + 0.25)));
  }
  if (blocked < 0.05) w.side = 0;
  const want = headingTo(0, 0, sx, sz);
  const err = wrap(want - w.heading);
  const step = Math.max(-turnRate * dt, Math.min(turnRate * dt, err));
  const heading = w.heading + step;
  // do not stride off sideways: slow down until pointing roughly the right way
  const align = Math.max(0, Math.cos(wrap(want - heading)));
  return { heading, speed: slow * (align > 0.6 ? 1 : align / 0.6) };
}

// The gap kept from a hard obstacle, so a body is never inside one.
export const HARD_GAP = 0.06;

// Pushes a point out of every hard obstacle: for the rule that follows other
// pushes (people shoving each other) so they cannot put anyone in a table.
export function pushOutOfHard(x: number, z: number, obstacles: ReadonlyArray<Obstacle>): { x: number; z: number } {
  for (let pass = 0; pass < 3; pass++) {
    for (const o of obstacles) {
      if (!o.hard) continue;
      const c = clearance(o, x, z);
      if (c.d < HARD_GAP) {
        x += c.nx * (HARD_GAP - c.d);
        z += c.nz * (HARD_GAP - c.d);
      }
    }
  }
  return { x, z };
}

export interface WalkGoal {
  walkTo?: { x: number; z: number };
  faceTo?: { x: number; z: number };
}

export interface WalkResult {
  moving: boolean; // true while it is walking (animate the walk)
  arrived: boolean; // at the place, and facing the way it was asked to
  headingError: number; // radians still to turn to face `faceTo`
}

// Moves a walker one step: walks to `walkTo` if given (going round the
// obstacles), then turns to face `faceTo`. Mutates and returns the result.
export function stepWalker(
  w: Walker,
  dt: number,
  goal: WalkGoal,
  obstacles: ReadonlyArray<Obstacle>,
  // followRoute: the way is already planned round the furniture, so do not be
  // pushed off it by furniture (that stalls in a narrow gap); the hard
  // obstacles still cannot be entered.
  opts: SteerOpts & { walkSpeed?: number; arrive?: number; followRoute?: boolean } = {},
): WalkResult {
  const speed = opts.walkSpeed ?? 1.15;
  const arrive = opts.arrive ?? 0.12;
  const turnRate = opts.turnRate ?? 4.5;
  let moving = false;
  const keepOut = (): void => {
    for (let pass = 0; pass < 2; pass++) {
      for (const o of obstacles) {
        if (!o.hard) continue;
        const c = clearance(o, w.x, w.z);
        if (c.d < HARD_GAP) {
          w.x += c.nx * (HARD_GAP - c.d);
          w.z += c.nz * (HARD_GAP - c.d);
        }
      }
    }
  };
  if (goal.walkTo) {
    const dist = Math.hypot(goal.walkTo.x - w.x, goal.walkTo.z - w.z);
    if (dist > arrive) {
      const s = steerTo(w, goal.walkTo, opts.followRoute ? [] : obstacles, dt, opts);
      w.heading = s.heading;
      const step = Math.min(dist, speed * s.speed * dt);
      w.x += -Math.sin(w.heading) * step;
      w.z += -Math.cos(w.heading) * step;
      keepOut();
      moving = s.speed > 0.05;
      return { moving, arrived: false, headingError: Math.PI };
    }
  }
  if (goal.faceTo) {
    const want = headingTo(w.x, w.z, goal.faceTo.x, goal.faceTo.z);
    const err = wrap(want - w.heading);
    w.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, err));
    const left = Math.abs(wrap(want - w.heading));
    return { moving: false, arrived: left < 0.2, headingError: left };
  }
  return { moving, arrived: true, headingError: 0 };
}

// A point to wander to: inside `bounds`, and at least `room` clear of every
// obstacle (so never inside a table, or inside someone's conversation).
export function freePoint(
  r: () => number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  obstacles: ReadonlyArray<Obstacle>,
  room = 0.8,
  tries = 40,
): { x: number; z: number } | null {
  for (let i = 0; i < tries; i++) {
    const x = bounds.minX + r() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + r() * (bounds.maxZ - bounds.minZ);
    if (obstacles.every((o) => clearance(o, x, z).d > room)) return { x, z };
  }
  return null;
}

// True when a goal has ended up in someone's way (inside, or too close to, an
// obstacle), so a walker should pick another.
export function goalBlocked(goal: { x: number; z: number }, obstacles: ReadonlyArray<Obstacle>, room = 0.4): boolean {
  return obstacles.some((o) => clearance(o, goal.x, goal.z).d < room);
}
