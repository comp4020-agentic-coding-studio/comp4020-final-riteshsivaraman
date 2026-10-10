// The wall-level dimensions of the store, in metres. The 3D scene and the
// blueprints (src/shared/blueprint.ts) are both built from these and from
// world.ts, so a drawing Ritesh has approved and the model cannot differ.
//
// Heights are above the floor (the walls are 3 m). Positions along a side wall
// are z (0 is the middle of the shop, negative is the glass front).
//
// Scale: everything here follows from the rectified reference photographs
// (SCOPE.md 3f): the shop is about 10 m wide and deep and 3 m high. Features
// on the walls are placed by their proportion of the wall in the photographs.

// Brushed-grey wall in three tones: dark below the bench, mid above it, then
// the light upper wall. Lightboxes start at the top of the mid band.
export const WALL_BANDS = { low: 0.95, mid: 1.5 } as const;
export const FLOOR_REVEAL = 0.05; // dark gap between the wall panels and the floor

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
    { kind: "lightbox", z: -3.6, w: 2.0, art: "phones" },
    { kind: "lightbox", z: -1.55, w: 1.25, art: "phones" },
    { kind: "lightbox", z: -0.2, w: 0.6, art: "card" },
    { kind: "monitors", zs: [-1.85, -1.25] },
  ],
  "-x": [
    { kind: "lightbox", z: -3.6, w: 2.0, art: "phones" },
    { kind: "display", z: -1.55, w: 1.5, h: 0.8 },
    { kind: "lightbox", z: -0.2, w: 0.8, art: "laptops" },
    { kind: "desktops", z0: 0.75, count: 5, pitch: 0.42 },
    { kind: "headphones", z0: -4.2, count: 3, pitch: 0.3 },
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

// The bar's back wall: three screens with a service mark between them, and a
// sign above.
export const BACK_WALL = {
  screenX: [-1.8, 0, 1.8],
  screenY: 1.95,
  screenW: 1.3,
  screenH: 0.75,
  markX: [-0.9, 0.9],
  markSize: 0.6,
  signY: 2.6,
  signW: 1.4,
} as const;

// The glass front: mullions, a header band across the top, and an entrance
// opening (assumed 3 m wide, in the middle: [TK] until the real door is known).
export const GLASS = { mullionX: [-3.7, 3.7], headerH: 0.45, entranceX: [-1.5, 1.5] } as const;

export const DOOR_H = 2.3;
// The card reader sits just outside the door, away from the bar (dx is added
// to the door's outer edge, so it is positive in +x).
export const CARD_READER = { dx: 0.2, y: 1.1, w: 0.07, h: 0.1 } as const;

export const STOOLS = { x: [-1.6, -0.8, 0, 0.8, 1.6], seatH: 0.7 } as const;

// Ceiling and lights, from the front-on photograph and the close-ups: grey
// slats run ACROSS the room (along x), long light panels sit in paired rows
// either side of the centre, track rails with spot lights run along the front
// and down both sides, and a mark hangs near the front.
export const CEILING_SPEC = {
  slatPitch: 0.25,
  panelRowsZ: [-3.6, -2.2, -0.8, 0.6, 2.0, 3.4],
  panelX: [-2.3, 2.3],
  panelW: 1.8, // along x
  panelD: 0.4, // along z
  spotPitch: 1.1,
  trackInset: 0.5, // rails run this far inside the walls
  hangingMark: { x: 0, z: -4.3, y: 2.4, size: 0.7 },
} as const;
export const TRACK_LIGHT_Y = 2.96;

// What stands on each column of tables (by the column's x), one entry per
// product position around a table (side one first, then the other side).
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

export const COLUMN_PRODUCTS: Record<string, readonly ProductKind[]> = {
  "-2.5": ["phone", "phone", "watch", "earbuds"],
  "0": ["laptop", "laptop", "tablet", "tabletKb"],
  "2.5": ["headphones", "speaker", "airtag", "earbuds"],
};
