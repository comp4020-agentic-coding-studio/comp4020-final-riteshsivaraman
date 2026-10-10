// The wall-level dimensions of the store, in metres. The 3D scene and the
// blueprints (src/shared/blueprint.ts) are both built from these and from
// world.ts, so a drawing Ritesh has approved and the model cannot differ.
//
// Heights are above the floor. Positions along a side wall are z (0 is the
// middle of the shop, negative is the glass front).

// Brushed-grey wall in three tones: dark below the bench, mid above it, then
// the light upper wall. The lightboxes start at the top of the mid band.
export const WALL_BANDS = { low: 0.95, mid: 1.9 } as const;

// Recessed lightboxes on both side walls, toward the front.
export const LIGHTBOXES = [
  { z: -5.0, w: 3.2 },
  { z: -1.9, w: 2.0 },
  { z: 0.2, w: 0.9 },
] as const;
export const LIGHTBOX_H = 1.4;
export const LIGHTBOX_BOTTOM = WALL_BANDS.mid + 0.05;

// Two monitors standing on each side bench.
export const MONITORS_Z = [-2.4, -1.4] as const;
export const MONITOR = { w: 0.7, h: 0.42, standH: 0.5 } as const;

// Product bays: the back panel runs from the floor, shelves stand out from it.
export const BAY_SHELVES = { count: 9, first: 0.45, step: 0.33, panelH: 3.4 } as const;
export const BAY_SIGN_Y = 3.55;

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

// The glass front: mullions and a header band across the top.
export const GLASS = { mullionX: [-6, -3, 0, 3, 6], headerH: 0.6 } as const;

export const DOOR_H = 2.6;
// The card reader sits just outside the door, away from the bar (dx is
// added to the door's outer edge, so it is positive in +x).
export const CARD_READER = { dx: 0.25, y: 1.2, w: 0.08, h: 0.12 } as const;

export const STOOLS = { x: [-2.4, -1.2, 0, 1.2, 2.4], seatH: 0.7 } as const;
export const TRACK_LIGHT_Y = 3.76;
