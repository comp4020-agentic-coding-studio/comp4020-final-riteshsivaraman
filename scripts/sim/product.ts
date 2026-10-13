// Picking a model is a real conversation move, not a dice roll the
// customer only finds out about at the end (Ritesh, 2026-10-13: "you don't
// just ask 10 questions and give them a single choice"). This holds the
// narrowing/compare step both playCustomer and the employee POV's
// NPC-customer branch use: ask budget, shortlist two real candidates by
// price, and let the engine explain the trade-off it actually knows about
// (tier and price -- not invented spec claims) rather than one it doesn't.
import type { Product } from "../../src/shared/catalogue.ts";
import { SIM_PRODUCTS } from "./catalogue.ts";

export const BUDGET_OPTIONS = ["under $700", "around $1,100", "around $1,600", "no real limit"] as const;

const BUDGET_CAP: Record<string, number> = {
  "under $700": 700,
  "around $1,100": 1100,
  "around $1,600": 1600,
  "no real limit": Infinity,
};

const basePrice = (p: Product): number => p.priceByStorage[p.storageOptions[0]];

// Two real candidates near the stated budget: the best fit at or under it,
// and the next tier up, the same "standard vs pro, one's a bit more" shape
// T1 actually uses -- never a single silent pick.
export function shortlistFor(budgetAnswer: string): [Product, Product] {
  const cap = BUDGET_CAP[budgetAnswer] ?? Infinity;
  const byPrice = [...SIM_PRODUCTS].sort((a, b) => basePrice(a) - basePrice(b));
  const affordable = byPrice.filter((p) => basePrice(p) <= cap);
  const a = affordable[affordable.length - 1] ?? byPrice[0];
  const i = byPrice.indexOf(a);
  const b = byPrice[i + 1] ?? byPrice[Math.max(0, i - 1)];
  return [a, b];
}

export const candidateLine = (p: Product): string => `${p.name} (${p.tier}) -- from $${basePrice(p)}`;

// Only what's actually known (tier, price) -- never a fabricated spec
// difference. A real salesperson doesn't always have exact numbers to
// hand either; staying honest about that is the point, not a cop-out.
export function compareLine(a: Product, b: Product): string {
  const diff = basePrice(b) - basePrice(a);
  return (
    `The ${a.name} is the ${a.tier} option. The ${b.name} is ${b.tier}, ` +
    `$${diff} more. I'd need the spec sheet for exact numbers, but the ` +
    `higher tier is usually where the newer camera and display upgrades land.`
  );
}
