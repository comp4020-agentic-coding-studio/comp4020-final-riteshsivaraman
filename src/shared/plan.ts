// The wall-level dimensions of the store, in metres. The 3D scene and the
// blueprints (src/shared/blueprint.ts) are both built from these and from
// world.ts, so a drawing Ritesh has approved and the model cannot differ.
//
// Heights are above the floor (the walls are 3 m). Positions along a side wall
// are z (0 is the middle of the shop, negative is the glass front).
//
// Scale: the wall features were placed from the rectified reference
// photographs (SCOPE.md 3f) for a shop 10 m deep. The shop is now 15.4 m deep
// (Ritesh, 2026-10-11), so the features keep their order and proportions along
// the wall: positions are stretched from the old front-to-bay span to the new
// one (wallZ), widths by WALL_W_STRETCH. Heights are unchanged.
import { ENTRANCE_HALF, FLOOR } from "./protocol.ts";
import { BAY_START_Z } from "./world.ts";

// Brushed-grey wall in three tones: dark below the bench, mid above it, then
// the light upper wall. Lightboxes start at the top of the mid band.
export const WALL_BANDS = { low: 0.95, mid: 1.5 } as const;
export const FLOOR_REVEAL = 0.05; // dark gap between the wall panels and the floor

const OLD_FRONT = -4.6; // where the old wall features started (z, 10 m shop)
const OLD_BAYS = 0.7; // and where the old bays started
const WALL_STRETCH = (BAY_START_Z - (FLOOR.minZ + 0.4)) / (OLD_BAYS - OLD_FRONT);
const WALL_W_STRETCH = 1 + (WALL_STRETCH - 1) * 0.5; // widths grow half as much as the spacing
const wallZ = (z: number): number => Math.round((FLOOR.minZ + 0.4 + (z - OLD_FRONT) * WALL_STRETCH) * 100) / 100;
const wallW = (w: number): number => Math.round(w * WALL_W_STRETCH * 100) / 100;

// What hangs on each side wall, front to back, read from the two close-up
// photographs. The two walls are not the same.
export type WallFeature =
  | { kind: "lightbox"; z: number; w: number; art: "phones" | "laptops" | "card" }
  | { kind: "display"; z: number; w: number; h: number }
  | { kind: "monitors"; zs: readonly number[] } // monitors on stands, on the bench
  | { kind: "desktops"; z0: number; count: number; pitch: number }
  | { kind: "headphones"; z0: number; count: number; pitch: number };

// "+x" is the visitor's LEFT wall as they enter; "-x" is their right.
export const SIDE_WALL: Record<"+x" | "-x", readonly WallFeature[]> = {
  "+x": [
    { kind: "lightbox", z: wallZ(-3.6), w: wallW(2.0), art: "phones" },
    { kind: "lightbox", z: wallZ(-1.55), w: wallW(1.25), art: "phones" },
    { kind: "lightbox", z: wallZ(-0.2), w: wallW(0.6), art: "card" },
    { kind: "monitors", zs: [wallZ(-1.85), wallZ(-1.25)] },
  ],
  "-x": [
    { kind: "lightbox", z: wallZ(-3.6), w: wallW(2.0), art: "phones" },
    { kind: "display", z: wallZ(-1.55), w: wallW(1.5), h: 0.8 },
    { kind: "lightbox", z: wallZ(-0.2), w: wallW(0.8), art: "laptops" },
    // the bench stops where the bays start, so the desktops end 0.5 m short of it
    { kind: "desktops", z0: Math.round((BAY_START_Z - 0.5 - 4 * 0.5) * 100) / 100, count: 5, pitch: 0.5 },
    { kind: "headphones", z0: wallZ(-4.2), count: 3, pitch: 0.3 },
  ],
};
export const LIGHTBOX_H = 1.0;
export const LIGHTBOX_BOTTOM = WALL_BANDS.mid + 0.05;
export const MONITOR = { w: 0.5, h: 0.3, standH: 0.36 } as const;
export const DESKTOP = { w: 0.36, h: 0.25, standH: 0.2 } as const;

// Product bays sit above the bench, between piers; the grey panel carries on
// unbroken below the bench to the floor.
export const BAY_SHELVES = { count: 6, first: 1.05, step: 0.27, panelBottom: WALL_BANDS.low, panelTop: 2.55 } as const;
export const BAY_SIGN_Y = 2.75;

// The wall bench stops where the bays start. In front of some bays a short
// ledge at bench height carries one product (Ritesh, 2026-10-11: "one half of
// each indented shelf may have a bench to showcase a product"). Which half and
// which product are [TK]: these are working defaults, one ledge on the front
// half of every bay, so they can be changed here and everything follows.
export interface BayLedge {
  bay: number; // 0 is the bay nearest the glass
  half: "front" | "back";
  kind: "phone" | "tablet" | "watch" | "laptop" | "headphones" | "speaker";
}
export const LEDGE_DEPTH = 0.35; // how far it stands out from the wall, metres
export const BAY_LEDGES: Record<"+x" | "-x", readonly BayLedge[]> = {
  "+x": [
    { bay: 0, half: "front", kind: "phone" },
    { bay: 1, half: "front", kind: "tablet" },
    { bay: 2, half: "front", kind: "watch" },
  ],
  "-x": [
    { bay: 0, half: "front", kind: "laptop" },
    { bay: 1, half: "front", kind: "headphones" },
    { bay: 2, half: "front", kind: "speaker" },
  ],
};

// The bar's back wall: three screens with a service mark between them, and a
// sign above.
export const BACK_WALL = {
  screenX: [-3.0, 0, 3.0],
  screenY: 1.95,
  screenW: 1.5,
  screenH: 0.75,
  markX: [-1.5, 1.5],
  markSize: 0.6,
  signY: 2.6,
  signW: 1.4,
} as const;

// The glass front: mullions, a header band across the top, and an entrance
// opening (assumed 3 m wide, in the middle: [TK] until the real door is known).
export const GLASS = { mullionX: [-4.5, 4.5], headerH: 0.45, entranceX: [-ENTRANCE_HALF, ENTRANCE_HALF] } as const;

export const DOOR_H = 2.3;
// The card reader sits just outside the door, away from the bar (dx is added
// to the door's outer edge, so it is positive in +x).
export const CARD_READER = { dx: 0.2, y: 1.1, w: 0.07, h: 0.1 } as const;

// Stool positions live in layout.json; the seat height is a fact about stools.
export const STOOL_SEAT_H = 0.7;

// Ceiling and lights, from the front-on photograph and the close-ups: grey
// slats run ACROSS the room (along x), long light panels sit in paired rows
// either side of the centre, track rails with spot lights run along the front
// and down both sides, and a mark hangs near the front.
export const CEILING_SPEC = {
  slatPitch: 0.25,
  // light panels in rows 1.4 m apart, from 1.1 m inside the glass to the back
  panelRowsZ: Array.from({ length: Math.floor((FLOOR.maxZ - FLOOR.minZ - 2.2) / 1.4) + 1 }, (_, i) => Math.round((FLOOR.minZ + 1.1 + i * 1.4) * 10) / 10),
  panelX: [-3.2, 3.2],
  panelW: 1.8, // along x
  panelD: 0.4, // along z
  spotPitch: 1.1,
  trackInset: 0.5, // rails run this far inside the walls
  hangingMark: { x: 0, z: FLOOR.minZ + 0.7, y: 2.4, size: 0.7 },
} as const;
export const TRACK_LIGHT_Y = 2.96;

// The kinds of product that can stand on a product table (one per side).
export type ProductKind =
  | "phone"
  | "tablet"
  | "tabletKb"
  | "laptop"
  | "watch"
  | "earbuds"
  | "headphones"
  | "speaker"
  | "airtag";
