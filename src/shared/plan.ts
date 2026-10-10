// The wall-level dimensions of the store, in metres. The 3D scene and the
// blueprints (src/shared/blueprint.ts) are both built from these and from
// world.ts, so a drawing Ritesh has approved and the model cannot differ.
//
// Heights are above the floor. Positions along a side wall are z (0 is the
// middle of the shop, negative is the glass front).

// Brushed-grey wall in three tones: dark below the bench, mid above it, then
// the light upper wall. Lightboxes start at the top of the mid band.
export const WALL_BANDS = { low: 0.95, mid: 1.9 } as const;
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
    { kind: "lightbox", z: -4.9, w: 3.2, art: "phones" },
    { kind: "lightbox", z: -1.8, w: 1.9, art: "phones" },
    { kind: "lightbox", z: 0.2, w: 0.9, art: "card" },
    { kind: "monitors", zs: [-2.3, -1.3] },
  ],
  "-x": [
    { kind: "lightbox", z: -4.9, w: 3.2, art: "phones" },
    { kind: "display", z: -1.9, w: 2.4, h: 1.3 },
    { kind: "lightbox", z: 0.2, w: 1.2, art: "laptops" },
    { kind: "desktops", z0: 1.7, count: 5, pitch: 0.6 },
    { kind: "headphones", z0: -6.0, count: 3, pitch: 0.45 },
  ],
};
export const LIGHTBOX_H = 1.4;
export const LIGHTBOX_BOTTOM = WALL_BANDS.mid + 0.05;
export const MONITOR = { w: 0.7, h: 0.42, standH: 0.5 } as const;
export const DESKTOP = { w: 0.5, h: 0.34, standH: 0.28 } as const;

// Product bays sit above the bench, between full-height piers; the grey panel
// carries on unbroken below the bench to the floor.
export const BAY_SHELVES = { count: 7, first: 1.05, step: 0.3, panelBottom: WALL_BANDS.low, panelTop: 3.15 } as const;
export const BAY_SIGN_Y = 3.5;

// The bar's back wall: three screens with a service mark between them, and a
// sign above.
export const BACK_WALL = {
  screenX: [-3, 0, 3],
  screenY: 2.6,
  screenW: 1.9,
  screenH: 1.1,
  markX: [-1.5, 1.5],
  markSize: 0.9,
  signY: 3.5,
  signW: 2.0,
} as const;

// The glass front: mullions, a header band across the top, and an entrance
// opening (assumed 3 m wide, in the middle: [TK] until the real door is known).
export const GLASS = { mullionX: [-6, -3, 0, 3, 6], headerH: 0.6, entranceX: [-1.5, 1.5] } as const;

export const DOOR_H = 2.6;
// The card reader sits just outside the door, away from the bar (dx is added
// to the door's outer edge, so it is positive in +x).
export const CARD_READER = { dx: 0.25, y: 1.2, w: 0.08, h: 0.12 } as const;

export const STOOLS = { x: [-2.4, -1.2, 0, 1.2, 2.4], seatH: 0.7 } as const;

// Ceiling and lights, from the front-on photograph and the close-ups: grey
// slats run ACROSS the room (along x), long light panels sit in paired rows
// either side of the centre, track rails with spot lights run along the front
// and down both sides, and a mark hangs near the front.
export const CEILING_SPEC = {
  slatPitch: 0.3,
  panelRowsZ: [-5.6, -3.6, -1.6, 0.4, 2.4, 4.4],
  panelX: [-3.6, 3.6],
  panelW: 2.6, // along x
  panelD: 0.5, // along z
  spotPitch: 1.5,
  trackInset: 0.6, // rails run this far inside the walls
  hangingMark: { x: 0, z: -6.6, y: 3.05, size: 1.0 },
} as const;
export const TRACK_LIGHT_Y = 3.76;
