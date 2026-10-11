import type { Behaviour } from "./behaviour.ts";
import { CAST, momentOf, type Purpose, type SpecialtyGroup, type StaffRole } from "./storeday.ts";
import type { Pose } from "./protocol.ts";

// The people who work in or visit the store, other than the visitors. Each has
// a role and a purpose, and the day they follow comes from it (storeday.ts):
// customers come in for something and are helped by the right member of staff;
// the greeter meets them at the door; specialists look after one kind of
// product; geniuses serve the bar; stock fetch from the back.
//
// Like everything here, it is a pure function of the server's clock, not a
// simulation: every client computes the same people in the same places, nothing
// needs a server tick (the Fly machine stops when idle), and a restart changes
// nothing.

export type NpcRole = StaffRole | "customer";

export interface Zone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface NpcDef {
  id: string;
  role: NpcRole;
  colour: string; // shirt
  cap?: string; // staff cap colour
  purpose?: Purpose; // why a customer is here
  specialty?: SpecialtyGroup; // what a specialist knows about
  // Stays at a station and works (technicians): never walks.
  working?: boolean;
}

export const isStaff = (n: NpcDef): boolean => n.role !== "customer";

export const NPCS: NpcDef[] = CAST.map((c) => ({
  id: c.id,
  role: c.role,
  colour: c.shirt,
  cap: c.cap,
  purpose: c.purpose,
  specialty: c.specialty,
  working: c.role === "technician",
}));

export interface NpcPose extends Pose {
  walking: boolean;
  present: boolean; // inside the store (or its doorway) at this moment
  mode: Behaviour; // what they are doing
  mood: string; // the face to wear
  seated: boolean; // sitting on a stool
  device: boolean; // a phone or tablet is out
  intent: string; // what they are up to, in words
  gaze?: { x: number; y: number; z: number }; // what the head is on, if anything
}

// Where an NPC is, which way it faces, what it is doing and whether it is
// mid-stride, at server time `nowMs`.
export function npcPose(def: NpcDef, nowMs: number): NpcPose {
  const m = momentOf(def.id, nowMs);
  return { x: m.x, z: m.z, ry: m.ry, walking: m.walking, present: m.present, mode: m.mode, mood: m.mood, seated: m.seated, device: m.device, intent: m.intent, gaze: m.gaze };
}
