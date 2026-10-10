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
// From the rectified reference photos: the back wall is about 3.3 times as wide
// as it is high and the side walls about 3.35 times as long as high; with the
// 3 m wall height Ritesh gave, the shop is about 10 m wide by 10 m deep.
export const FLOOR = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } as const;

// Ceiling height in metres (drawn by the client; kept here beside the floor).
export const CEILING = 3.0;

// Where a visitor appears: just inside the glass front, facing into the store.
export const SPAWN: Pose = { x: 0, z: -4.6, ry: Math.PI };
