import type { Product } from "../../src/shared/catalogue.ts";
import { priceOf, SIM_PRODUCTS } from "./catalogue.ts";
import { closeCase, openCase, setFact, type SimCase } from "./case.ts";
import { log } from "./io.ts";
import { pick, roll, type Rng } from "./rng.ts";
import { nextSlot, npcAnswer, type SlotKey } from "./slots.ts";
import { rollTraits, type Traits } from "./traits.ts";

export interface NpcCustomer {
  id: string;
  name: string;
  traits: Traits;
  product: Product;
}

const NAMES = ["Priya", "Tom", "Noah", "Kemal", "Rin", "Hamza", "Greg", "Elena", "Derek"];

export function spawnCustomer(rng: Rng, idSeed: number): NpcCustomer {
  return { id: `npc-${idSeed}`, name: pick(rng, NAMES), traits: rollTraits(rng), product: pick(rng, SIM_PRODUCTS) };
}

// Staff noticing a waiting customer promptly is itself probabilistic (the
// sim's fourth hook): low attentiveness means a short, visible delay before
// anyone comes over, echoing T2's "nobody comes" -- never a permanent
// block, just friction, since a staff approach is only ever the secondary
// way a conversation starts (ADR 6; a customer's own request is the main
// one, and isn't gated on anyone's attentiveness).
export function noticeDelay(rng: Rng, staff: Traits, who: string): void {
  let tries = 0;
  while (tries < 2 && !roll(rng, 0.35 + staff.attentiveness * 0.65)) {
    log(`${who} is busy with someone else -- nobody comes over yet.`);
    tries++;
  }
}

// Runs a whole conversation for an NPC customer against an NPC staff
// member, entirely automatically -- this is what "everyone else is an NPC"
// looks like with no human in the loop. Same slots, same ordering policy,
// same probabilistic hooks as the human-played flow in index.ts; both
// sides are rolled instead of asked.
export function runAmbientConversation(rng: Rng, staffName: string, staffTraits: Traits, customer: NpcCustomer): SimCase {
  const c = openCase(customer.id, "phone", staffName);
  noticeDelay(rng, staffTraits, staffName);
  log(`${staffName} greets ${customer.name}.`);
  let slot: SlotKey | null;
  while ((slot = nextSlot(c.facts))) {
    setFact(c, slot, npcAnswer(slot, customer.product, customer.traits, rng));
  }
  // mind-change hook, right before committing: a less decisive customer may
  // add an extra item on a whim, or walk away instead of buying at all.
  if (roll(rng, (1 - customer.traits.decisiveness) * 0.35)) {
    if (roll(rng, 0.5 + customer.traits.impulsiveness * 0.3)) {
      setFact(c, "accessories", "case and charger");
      log(`${customer.name} hesitates, then decides to grab a case and charger too.`);
    } else {
      closeCase(c, "abandoned");
      log(`${customer.name} says they'll think about it and leaves without buying.`);
      return c;
    }
  }
  if (roll(rng, 0.08)) log(`${customer.name}'s payment doesn't go through on the first try -- ${staffName} sorts it out.`);
  closeCase(c, "fulfilled");
  const price = priceOf(customer.product, c.facts.storage);
  log(`${customer.name} buys the ${customer.product.name} (${c.facts.colour}, ${c.facts.storage}) for $${price}.`);
  return c;
}
