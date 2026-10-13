import type { Rng } from "./rng.ts";

// One NPC's bias toward every probabilistic hook in the sim (grilling
// session, 2026-10-13: "everyone doesn't always act rationally, otherwise
// everybody would act the same way"). Drawn once per NPC from a seed, so the
// same NPC answers consistently with itself across a conversation instead of
// re-rolling a different personality every turn — the variance this models
// is between people, not within one person's own answers.
export interface Traits {
  impulsiveness: number; // wants an upsell item, acts on a whim
  priceSensitivity: number; // picks the cheaper option, more likely to want a trade-in
  decisiveness: number; // low = more likely to hesitate or change their mind before committing
  attentiveness: number; // staff only: notices a waiting customer promptly
}

export function rollTraits(rng: Rng): Traits {
  return { impulsiveness: rng(), priceSensitivity: rng(), decisiveness: rng(), attentiveness: rng() };
}
