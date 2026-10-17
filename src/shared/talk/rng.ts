// Re-exported from core/rng.ts, which is scene-agnostic (used by every scene's
// NPCs, not just phones). Kept here so every existing import path
// ("./rng.ts") still resolves after the core extraction.
export { makeRng, chance, pickOne, weighted, type Rng } from "./core/rng.ts";
