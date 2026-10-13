// The conversation engine ADR 6 decided but has not built yet (slot-filling
// + an ordering policy, not an authored node graph): this sim is the cheap
// way to check that design feels right before it gets built for real.
import type { Product } from "../../src/shared/catalogue.ts";
import { BUDGET_OPTIONS } from "./product.ts";
import { pick, roll, type Rng } from "./rng.ts";
import type { Traits } from "./traits.ts";

export type SlotKey = "use_case" | "budget" | "storage" | "colour" | "tradein" | "accessories" | "careplan" | "setup";

export const SLOT_ORDER: SlotKey[] = ["use_case", "budget", "storage", "colour", "tradein", "accessories", "careplan", "setup"];

// The ordering policy: the next unfilled slot, in priority order. A fact
// already on the case (carried by a handoff) is skipped, not re-asked.
export function nextSlot(facts: Record<string, string>): SlotKey | null {
  return SLOT_ORDER.find((k) => facts[k] === undefined) ?? null;
}

// A slot's question text may cite another already-known fact -- this is
// T1's "don't go back to 128" moment, not a flourish.
export function questionFor(slot: SlotKey, facts: Record<string, string>): string {
  switch (slot) {
    case "use_case":
      return "What will you mostly use it for?";
    case "budget":
      return "Have you got a number in mind for budget? No wrong answer.";
    case "storage": {
      const hint = facts.use_case === "photos" ? " You said photos and video, so I'd say don't go back to the smallest size." : "";
      return `How much storage are you after?${hint}`;
    }
    case "colour":
      return "Any colour you had in mind?";
    case "tradein":
      return "Trading in your current phone? It comes off the price.";
    case "accessories":
      return "Want a case or a charger with that?";
    case "careplan":
      return "A care plan covers accidental damage for a monthly fee -- want it?";
    case "setup":
      return "Want me to set it up with you now, or will you do it at home?";
  }
}

export function optionsFor(slot: SlotKey, product: Product): string[] {
  switch (slot) {
    case "use_case":
      return ["photos", "work", "games", "mostly calls and texts"];
    case "budget":
      return [...BUDGET_OPTIONS];
    case "storage":
      return product.storageOptions;
    case "colour":
      return product.colours;
    case "tradein":
      return ["yes", "no"];
    case "accessories":
      return ["case only", "case and charger", "nothing"];
    case "careplan":
      return ["yes", "no"];
    case "setup":
      return ["now, while I'm here", "I'll do it at home"];
  }
}

// How an NPC answers a slot for itself, biased by its own traits: two NPCs
// with different traits answer differently, but the same NPC stays
// consistent with itself across the whole conversation.
export function npcAnswer(slot: SlotKey, product: Product, traits: Traits, rng: Rng): string {
  const opts = optionsFor(slot, product);
  switch (slot) {
    case "budget":
      return traits.priceSensitivity > 0.6 ? opts[0] : traits.priceSensitivity < 0.3 ? pick(rng, opts.slice(2)) : opts[1];
    case "tradein":
      return roll(rng, 0.3 + traits.priceSensitivity * 0.4) ? "yes" : "no";
    case "accessories":
      return traits.impulsiveness > 0.6 ? "case and charger" : roll(rng, 0.5) ? "case only" : "nothing";
    case "careplan":
      return roll(rng, 0.25 + (1 - traits.priceSensitivity) * 0.3) ? "yes" : "no";
    default:
      return pick(rng, opts);
  }
}
