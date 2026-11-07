// The store's daylight, as a pure function of the server clock (issue #12).
// No store timezone is pinned in SCOPE.md or the ADRs, so the builder's call
// (documented in the PR, not hidden here): the store's "local" clock is read
// straight off the UTC calendar day, i.e. UTC 12:00 is local midday, UTC
// 00:00 is local midnight. This is an arbitrary but stated choice, easy to
// change later by shifting `LOCAL_OFFSET_HOURS` below; it never depends on
// the machine's own timezone, which would make two viewers in different
// places see two different skies for the same instant - the one thing the
// spec and CLAUDE.md's event-time rules both forbid.
//
// Deliberately NOT read from `Date.now()` or any clock of its own: the only
// input is the server time handed in, so every viewer computes the identical
// sun for the identical instant, and nothing here needs a timer (CLAUDE.md,
// "No background processes").

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// Shift applied to UTC to get the store's local hour. 0 = UTC is local.
const LOCAL_OFFSET_HOURS = 0;

export interface SunState {
  direction: { x: number; y: number; z: number };
  colour: string;
}

// Continuous local hour-of-day, 0 (midnight) to 24 (next midnight), for a
// given server timestamp. Uses UTC getters only, so it never depends on the
// machine running it.
function localHour(serverTimeMs: number): number {
  const shiftedMs = serverTimeMs + LOCAL_OFFSET_HOURS * HOUR_MS;
  const msOfDay = ((shiftedMs % DAY_MS) + DAY_MS) % DAY_MS;
  return msOfDay / HOUR_MS;
}

// Colour stops keyed by the sun's elevation (direction.y), from a bright
// overhead peak down through a warm low sun to a dark, near-absent night
// (interior lights are implied, not drawn here). Linearly interpolated, so
// the colour sweeps smoothly rather than snapping between a handful of
// named states.
const COLOUR_STOPS: Array<{ e: number; rgb: [number, number, number] }> = [
  { e: -1.0, rgb: [16, 20, 40] }, // the dead of night: near-black navy
  { e: -0.3, rgb: [40, 55, 92] }, // late twilight, cool blue
  { e: -0.05, rgb: [96, 84, 120] }, // dusk, the sun just gone
  { e: 0.0, rgb: [255, 140, 92] }, // right on the horizon: warm orange
  { e: 0.12, rgb: [255, 176, 120] }, // just risen/about to set
  { e: 0.35, rgb: [255, 221, 180] }, // mid-morning/afternoon, golden-white
  { e: 1.0, rgb: [235, 244, 255] }, // overhead midday, cool bright white
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function colourFor(elevation: number): string {
  const e = Math.max(-1, Math.min(1, elevation));
  let lo = COLOUR_STOPS[0];
  let hi = COLOUR_STOPS[COLOUR_STOPS.length - 1];
  for (let i = 0; i < COLOUR_STOPS.length - 1; i++) {
    if (e >= COLOUR_STOPS[i].e && e <= COLOUR_STOPS[i + 1].e) {
      lo = COLOUR_STOPS[i];
      hi = COLOUR_STOPS[i + 1];
      break;
    }
  }
  const span = hi.e - lo.e;
  const t = span > 1e-9 ? (e - lo.e) / span : 0;
  const r = Math.round(lerp(lo.rgb[0], hi.rgb[0], t));
  const g = Math.round(lerp(lo.rgb[1], hi.rgb[1], t));
  const b = Math.round(lerp(lo.rgb[2], hi.rgb[2], t));
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// The sun's direction and colour at a given instant of server time. A pure
// function: same input, same output, forever - no clock read, no randomness,
// no module state. One full day/night cycle every 24 real hours, local
// midday (see LOCAL_OFFSET_HOURS above) at the overhead peak and local
// midnight at the trough, with everything between sweeping smoothly rather
// than snapping between a few fixed states.
export function sunStateAt(serverTimeMs: number): SunState {
  const hour = localHour(serverTimeMs);
  // Elevation: a sinusoid over the 24 h day, peaking (1, straight overhead)
  // at local noon and bottoming out (-1, straight underfoot - the sun is on
  // the other side of the world) at local midnight. Zero at 6 am and 6 pm,
  // i.e. sunrise and sunset.
  const elevationAngle = ((hour - 6) / 24) * 2 * Math.PI;
  const elevation = Math.sin(elevationAngle);
  // Azimuth: a full sweep of the compass once a day, independent of
  // elevation, so the sun also visibly moves sideways through the glass
  // front rather than just rising and sinking on the spot.
  const azimuth = (hour / 24) * 2 * Math.PI;
  // |cos(elevationAngle)|, i.e. the horizontal share of a unit vector whose
  // vertical share is `elevation` - keeps {x, y, z} a unit-length direction
  // without azimuth and elevation fighting each other.
  const horiz = Math.sqrt(Math.max(0, 1 - elevation * elevation));
  const direction = {
    x: horiz * Math.sin(azimuth),
    y: elevation,
    z: horiz * Math.cos(azimuth),
  };
  return { direction, colour: colourFor(elevation) };
}
