// The WebSocket protocol, shared by the server and the client so both sides
// type-check against one definition. Positions are in metres on the store
// floor (x to the right, z towards the back), `ry` is the heading in radians
// (0 faces -z, towards the glass front; PI faces +z, into the store).

export interface Pose {
  x: number;
  z: number;
  ry: number;
}

import type { PlayerStateName } from "./conversation.ts";
import type { LookChoice } from "./look.ts";
import type { Kind, Profile, Specialty } from "./profile.ts";

export interface VisitorInfo {
  id: string;
  name: string;
  colour: string;
}

// What everyone else may know about a visitor: who they chose to be, and how
// they look (so their character can be drawn).
export interface Identity {
  kind: Kind;
  specialty?: Specialty;
  look?: LookChoice;
}

// One customer as an employee sees them: where they are in their visit.
export interface CustomerView {
  id: string;
  name: string;
  state: PlayerStateName;
  want: string | null;
  needs: string | null; // the post they are waiting for, if any
  sinceMs: number; // how long they have been in this state
  withName: string | null; // who is dealing with them now
  note: string | null; // a note left when they were handed on
}

// The menu a visitor is shown, and whose turn it is.
export interface TurnView {
  conversationId: string;
  withId: string;
  withName: string;
  say: string;
  choices: Array<{ id: string; label: string }>;
  ended: boolean;
  awaiting: "customer" | "staff"; // whose turn: a customer waits on staff, shown no menu
}

// The employee's side of a menu conversation: what the customer picked, and
// the reply the script would give, to send or change.
export interface StaffTurnView {
  conversationId: string;
  customerId: string;
  customerName: string;
  customerPicked: string;
  scripted: string; // the scripted reply, if they just reply
  actions: Array<{ id: "reply" | "hand_to_genius" | "end"; label: string }>;
}

export interface Engagement {
  npcId: string;
  visitorId: string;
  since: number; // server time
  at: { x: number; z: number }; // where the visitor stood when it began
}

// Someone inspecting a device (D39, first pass: phone only, stays on the
// table). One per slot, server-authoritative, mirroring Engagement, so a
// visitor who joins mid-inspection still sees it (welcome.inspections).
export interface Inspection {
  slotId: string;
  visitorId: string;
  since: number; // server time
}

// Who a visitor is acting as. Customers stay on the shop floor; staff may also
// go behind the bar and into the back room. For now a dev button switches
// between them (the server trusts the claim); real roles come later.
export type Role = "customer" | "staff";

export type ClientMessage =
  | { type: "hello"; token: string | null; profile?: Profile }
  | { type: "move"; x: number; z: number; ry: number }
  | { type: "role"; role: Role }
  // start a conversation with an NPC or an employee (E near them)
  | { type: "talk_start"; withId: string }
  | { type: "talk_choose"; conversationId: string; choice: string }
  // walk away mid-conversation, from either side (Esc)
  | { type: "talk_leave" }
  // an employee's side
  | { type: "staff_respond"; conversationId: string; action: "reply" | "hand_to_genius" | "end" }
  | { type: "claim"; customerId: string }
  | { type: "hand_on"; customerId: string; to: string; note?: string }
  // look at a device on a table (E near it); ends on Esc, tap-away, walking
  // off, or starting anything else
  | { type: "inspect_start"; slotId: string }
  | { type: "inspect_end" }
  // Sent as an ordinary message just before closing. A clean WebSocket close
  // takes about 5 s to reach the server through Fly's proxy (measured), while
  // a message arrives at once, so this is what makes a departure prompt.
  | { type: "bye" };

export type Present = VisitorInfo & Pose & Identity & { role: Role };

export type ServerMessage =
  | {
      type: "welcome";
      you: VisitorInfo;
      token: string;
      others: Present[];
      // The server's clock, so every client moves the NPCs to the same place.
      serverTime: number;
      // who you are (as validated), where you are in your visit, and the
      // state of the NPCs: who is off duty and who is with a visitor
      identity: Identity;
      state: PlayerStateName | null;
      offDuty: string[];
      engaged: Engagement[];
      inspecting: Inspection[];
    }
  | { type: "joined"; visitor: Present }
  | { type: "moved"; id: string; x: number; z: number; ry: number }
  | { type: "role"; id: string; role: Role }
  | { type: "left"; id: string }
  | { type: "state"; state: PlayerStateName; want: string | null; needs: string | null }
  | ({ type: "turn" } & TurnView)
  | ({ type: "staff_turn" } & StaffTurnView)
  | { type: "staff_view"; customers: CustomerView[] }
  | { type: "duty"; offDuty: string[] }
  | ({ type: "engaged" } & Engagement)
  | { type: "released"; npcId: string }
  | ({ type: "inspecting" } & Inspection)
  | { type: "inspect_ended"; slotId: string }
  | { type: "notice"; text: string };

// The walkable shop floor. Positions are clamped to the walkable areas in
// world.ts (clampToWalkable), which start from this box.
// The rectified reference photos gave about 10 m by 10 m under a 3 m wall.
// Ritesh then asked for more room so the tables can be about a metre apart and
// the bar can seat 13 (2026-10-11, "option A"), then for larger, longer tables
// (1.2 x 2.0 m, service tables 1.8 m square), 1.5 m clear inside the glass and
// a 4+1 row count kept: 12 m wide and 18.2 m deep, the wall height unchanged. The 3.3x / 3.35x height ratios are therefore no longer
// the shop's; they stay in SCOPE.md as the evidence the first size came from.
export const FLOOR = { minX: -6, maxX: 6, minZ: -9.1, maxZ: 9.1 } as const;

// The store is on the first floor of the mall (Ritesh, 2026-10-11): its floor
// is this high above the ground-floor concourse. Everything in the store is
// drawn this far up; x and z are unchanged, so every other model is unaffected.
export const STORE_Y = 4.4;

// The first-floor walkway outside the glass: this deep, with a balustrade at
// its far edge looking down into the atrium, reached through the entrance
// opening (half-width in metres).
export const WALKWAY_DEPTH = 3.4;
export const ENTRANCE_HALF = 1.5;

// Ceiling height in metres (drawn by the client; kept here beside the floor).
export const CEILING = 3.0;

// Where a visitor appears: just inside the glass front, facing into the store.
export const SPAWN: Pose = { x: 0, z: FLOOR.minZ + 0.4, ry: Math.PI };
