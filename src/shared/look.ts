import { appearanceFor, HAIR_COLOURS, SKIN_TONES, type Appearance, type BeardStyle, type HairStyle } from "./appearance.ts";

// What a visitor may choose about how their character looks. These lists are
// the same ones the character builder offers (gfx/character.ts), kept here so
// the server can check a profile without importing three.js. Anything not on a
// list is dropped, so a client cannot put an arbitrary string in the database
// or in front of other visitors.

export const BODY_STYLES = ["friendly", "natural", "canon", "sturdy", "toon", "chibi"] as const;
export const EYE_STYLES = ["dots", "soft", "glossy", "lidded", "almond", "bean", "round", "sparkle", "happy"] as const;
export const FACE_SHAPES = ["oval", "round", "square", "heart", "long", "diamond", "pear"] as const;
export const BEARDS = ["none", "stubble", "moustache", "goatee", "full"] as const satisfies readonly BeardStyle[];
export const HAIR_STYLES = ["bald", "buzz", "short", "side", "long", "bun", "curly"] as const satisfies readonly HairStyle[];
export const SHIRT_COLOURS = ["#2f62b5", "#4a7c59", "#b5503a", "#6b5b95", "#3a3d45", "#c9a24a", "#2a7f8a", "#c46f8a", "#6f8f4a", "#e07a5f"] as const;
export { HAIR_COLOURS, SKIN_TONES };

export interface LookChoice {
  // what the base appearance (face, height, build, eyes) is drawn from; a new
  // one is a different person. Without one, the visitor's id is used.
  seed?: string;
  body?: (typeof BODY_STYLES)[number];
  eyes?: (typeof EYE_STYLES)[number];
  face?: (typeof FACE_SHAPES)[number];
  beard?: BeardStyle;
  hairStyle?: HairStyle;
  hairColour?: string;
  skin?: string;
  shirt?: string;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined;

// Keeps only what is allowed.
export function validateLook(raw: unknown): LookChoice {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: LookChoice = {};
  if (typeof r.seed === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(r.seed)) out.seed = r.seed;
  const body = oneOf(BODY_STYLES, r.body);
  const eyes = oneOf(EYE_STYLES, r.eyes);
  const face = oneOf(FACE_SHAPES, r.face);
  const beard = oneOf(BEARDS, r.beard);
  const hairStyle = oneOf(HAIR_STYLES, r.hairStyle);
  const hairColour = oneOf(HAIR_COLOURS as readonly string[], r.hairColour);
  const skin = oneOf(SKIN_TONES as readonly string[], r.skin);
  const shirt = oneOf(SHIRT_COLOURS, r.shirt);
  if (body) out.body = body;
  if (eyes) out.eyes = eyes;
  if (face) out.face = face;
  if (beard) out.beard = beard;
  if (hairStyle) out.hairStyle = hairStyle;
  if (hairColour) out.hairColour = hairColour;
  if (skin) out.skin = skin;
  if (shirt) out.shirt = shirt;
  return out;
}

// The appearance of a visitor or NPC: generated from their seed (or id), with
// their choices laid over it. Everyone's client builds it the same way, so a
// visitor looks the same in the entry preview as to everyone else.
export function lookFor(id: string, look: LookChoice | undefined): Appearance {
  return withLook(appearanceFor(look?.seed ?? id), look);
}

// A generated appearance with the visitor's choices laid over it. (body, eyes,
// face and shirt are build options, not part of the appearance.)
export function withLook(base: Appearance, look: LookChoice | undefined): Appearance {
  if (!look) return base;
  const a = { ...base };
  if (look.hairStyle) a.hairStyle = look.hairStyle;
  if (look.hairColour) {
    a.hairColour = look.hairColour;
    a.browColour = look.hairColour;
  }
  if (look.skin) a.skin = look.skin;
  if (look.beard) a.beard = look.beard;
  return a;
}
