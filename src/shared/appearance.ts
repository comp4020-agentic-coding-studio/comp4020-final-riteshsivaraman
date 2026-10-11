// What a person looks like, as a pure function of their id. Cosmetic only:
// collision, paths and the server never read it, so a heavier or taller
// person still occupies the same BODY_RADIUS (world.ts). Same id, same look,
// on every client and on every visit.
//
// Each field draws from its own salted hash, so features vary independently
// (a tall person is not always also broad, or dark-haired).

export type HairStyle = "bald" | "buzz" | "short" | "side" | "long" | "bun" | "curly";

export interface Appearance {
  height: number; // scale on the whole figure; 1 is about 1.7 m
  build: number; // width scale on torso and limbs
  headScale: number;
  skin: string;
  hairStyle: HairStyle;
  hairColour: string;
  browColour: string;
  eyeColour: string;
  eyeSpacing: number; // scale on the distance between the eyes
  noseSize: number;
  mouthWidth: number;
  pants: string;
  shoes: string;
  // face and frame (nothing gendered: a range, so any mix can turn up)
  faceWidth: number; // 1 is typical
  jaw: number; // how much the lower face tapers
  cheek: number;
  chin: number;
  brow: number;
  eyeSize: number;
  shoulderHip: number; // shoulders against hips: low is pear-shaped, high is broad-shouldered
}

// Ranges are exported so the spec can check what is drawn against them.
export const HEIGHT_RANGE = [0.9, 1.1] as const;
// Capped by the arms: their outer edge sits 0.272 m from the centre at build 1,
// and BODY_RADIUS is 0.3 m, so anything past about 1.10 would visibly overlap
// the next person even though collision keeps them apart.
export const BUILD_RANGE = [0.82, 1.1] as const;

const SKIN_TONES = ["#f1c9a5", "#e3b68d", "#d9a679", "#b9835a", "#8d5a3b", "#5e3b27"];
const HAIR_COLOURS = ["#15110e", "#2a1d14", "#4a3322", "#6b4a2e", "#8a3b1f", "#c9a25a", "#8f8f92", "#d8d6d0"];
const EYE_COLOURS = ["#1b1b1f", "#3a2616", "#5a3d1f", "#4d6b3a", "#4f6f8f"];
const SHOES = ["#1d1f24", "#3b3b3f", "#e9e9e9", "#5b4636", "#7a2e2e", "#2f4057"];
const PANTS = ["#2b2f3a", "#3a3d45", "#4a4036", "#2f3e52", "#53575f"];
// repeated entries are weights: short is common, bald and bun are not
const HAIR_STYLES: HairStyle[] = [
  "short", "short", "short", "side", "side", "buzz", "long", "long", "curly", "bun", "bald",
];

// FNV-1a over the id and a salt, then an avalanche step, to a number in [0, 1).
function rand(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const pick = <T>(list: readonly T[], r: number): T => list[Math.floor(r * list.length)];
const between = (lo: number, hi: number, r: number): number => lo + (hi - lo) * r;

export function appearanceFor(id: string): Appearance {
  const hairColour = pick(HAIR_COLOURS, rand(id, 4));
  return {
    height: between(HEIGHT_RANGE[0], HEIGHT_RANGE[1], rand(id, 1)),
    build: between(BUILD_RANGE[0], BUILD_RANGE[1], rand(id, 2)),
    headScale: between(0.94, 1.07, rand(id, 3)),
    skin: pick(SKIN_TONES, rand(id, 5)),
    hairStyle: pick(HAIR_STYLES, rand(id, 6)),
    hairColour,
    browColour: hairColour,
    eyeColour: pick(EYE_COLOURS, rand(id, 7)),
    eyeSpacing: between(0.88, 1.12, rand(id, 8)),
    noseSize: between(0.8, 1.3, rand(id, 9)),
    mouthWidth: between(0.85, 1.15, rand(id, 10)),
    pants: pick(PANTS, rand(id, 11)),
    shoes: pick(SHOES, rand(id, 12)),
    faceWidth: between(0.94, 1.1, rand(id, 13)),
    jaw: between(0.55, 1.1, rand(id, 14)),
    cheek: between(0.7, 1.35, rand(id, 15)),
    chin: between(0.6, 1.3, rand(id, 16)),
    brow: between(0.5, 1.2, rand(id, 17)),
    eyeSize: between(0.92, 1.18, rand(id, 18)),
    shoulderHip: between(0.95, 1.45, rand(id, 19)),
  };
}
