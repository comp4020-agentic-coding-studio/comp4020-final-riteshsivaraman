// The WebSocket protocol, shared by the server and the client so both sides
// type-check against one definition. Positions are in metres on the store
// floor (x to the right, z towards the back), `ry` is the heading in radians
// (0 faces -z, towards the glass front; PI faces +z, into the store).

export interface Pose {
  x: number;
  z: number;
  ry: number;
}

export interface VisitorInfo {
  id: string;
  name: string;
  colour: string;
}

// Who a visitor is acting as. Customers stay on the shop floor; staff may also
// go behind the bar and into the back room. For now a dev button switches
// between them (the server trusts the claim); real roles come later.
export type Role = "customer" | "staff";

export type ClientMessage =
  | { type: "hello"; token: string | null }
  | { type: "move"; x: number; z: number; ry: number }
  | { type: "role"; role: Role }
  // Sent as an ordinary message just before closing. A clean WebSocket close
  // takes about 5 s to reach the server through Fly's proxy (measured), while
  // a message arrives at once, so this is what makes a departure prompt.
  | { type: "bye" };

export type Present = VisitorInfo & Pose & { role: Role };

export type ServerMessage =
  | {
      type: "welcome";
      you: VisitorInfo;
      token: string;
      others: Present[];
      // The server's clock, so every client moves the NPCs to the same place.
      serverTime: number;
    }
  | { type: "joined"; visitor: Present }
  | { type: "moved"; id: string; x: number; z: number; ry: number }
  | { type: "role"; id: string; role: Role }
  | { type: "left"; id: string };

// The walkable shop floor. Positions are clamped to the walkable areas in
// world.ts (clampToWalkable), which start from this box.
// The rectified reference photos gave about 10 m by 10 m under a 3 m wall.
// Ritesh then asked for more room so the tables can be about a metre apart and
// the bar can seat 13 (2026-10-11, "option A"): 11 m wide and 15.4 m deep, the
// wall height unchanged. The 3.3x / 3.35x height ratios are therefore no longer
// the shop's; they stay in SCOPE.md as the evidence the first size came from.
export const FLOOR = { minX: -5.5, maxX: 5.5, minZ: -7.7, maxZ: 7.7 } as const;

// Ceiling height in metres (drawn by the client; kept here beside the floor).
export const CEILING = 3.0;

// Where a visitor appears: just inside the glass front, facing into the store.
export const SPAWN: Pose = { x: 0, z: FLOOR.minZ + 0.4, ry: Math.PI };
