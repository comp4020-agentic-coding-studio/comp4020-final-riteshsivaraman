// The vocabulary shared by every scene on this engine: two parties taking
// turns, every line tagged with a tone that shows on the speaker's face.
// Nothing here knows about phones, laptops or any specific pool shape -- a
// scene's own types.ts (see scenes/phone/types.ts) adds Scene, Pending,
// StaffAct and the rest, which do depend on that scene's pool.

export type Tone = "friendly" | "neutral" | "impatient" | "unsure";
export const TONES: Tone[] = ["friendly", "neutral", "impatient", "unsure"];

// In the store the tone shows on the speaker's face. These are names from the
// character's own expression set (EXPRESSIONS in src/client/src/gfx/character.ts),
// so the shop reads them off the line without a lookup of its own. There is no
// "annoyed" face yet: focused (brows pulled down, mouth flat) is the nearest to
// impatient, and a proper one would be graphics' to add.
export const TONE_EXPRESSION: Record<Tone, "smile" | "neutral" | "focused" | "worried"> = {
  friendly: "smile",
  neutral: "neutral",
  impatient: "focused",
  unsure: "worried",
};

export type Role = "staff" | "customer";

// A menu item. Most are fixed; `param` makes one take a number the picker
// types in (e.g. "set my own ceiling"), in which case a pick is
// `prefix + value`.
export interface Option {
  id: string;
  label: string;
  group?: string; // the UI may fold a long group away ("other colours")
  neutral?: boolean; // "Not sure", "none of these": a pick that changes nothing
  param?: { prefix: string; min: number; max: number; step: number };
}

export interface Answer {
  picks: string[];
  turn: number;
}
