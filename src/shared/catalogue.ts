// What the store sells, as data. Real, current, sourced names/colours/prices
// (SCOPE D37) — never invented, never from memory. See
// references/product-line.md for the full researched line-up (every family)
// and its sources; only phones are catalogued here so far, because the
// conversation/stock system (src/shared/conversation.ts, src/server/service.ts)
// only sells phones today. Widening to other families is a later session's
// job once their geometry and a conversation script for them exist.
//
// Storage is a real axis (ADR 5, docs/adr/0005-storage-sku-key.md) but there
// is no picker in the conversation script yet: `defaultStorage` is what the
// server sells until one exists. `START_STOCK`'s quantities are still a
// placeholder — deliberately uneven, and sometimes zero, so "sold out"
// and "someone else got the last one" can actually happen in a spec.

export interface Product {
  id: string;
  name: string;
  family: "phones";
  tier: string;
  colours: string[]; // Apple's own colour names, as listed
  storageOptions: string[]; // first entry is what `defaultStorage` sells until a picker exists
  priceByStorage: Record<string, number>; // AUD, Apple's own listed price
  source: string; // URL(s) + fetch date — SCOPE D37: never invented
}

export const PRODUCTS: Product[] = [
  {
    id: "iphone-duo",
    name: "iPhone Duo",
    family: "phones",
    tier: "foldable",
    colours: ["Star White", "Night Sky"],
    storageOptions: ["256GB", "512GB", "1TB", "2TB"],
    priceByStorage: { "256GB": 3499, "512GB": 3899, "1TB": 4699, "2TB": 5899 },
    source: "apple.com/au/shop/buy-iphone/iphone-duo (fetched 2026-10-12)",
  },
  {
    id: "iphone-18-pro",
    name: "iPhone 18 Pro",
    family: "phones",
    tier: "pro",
    colours: ["Burgundy", "Glacier", "Silver", "Black"],
    storageOptions: ["256GB", "512GB", "1TB", "2TB"],
    priceByStorage: { "256GB": 2099, "512GB": 2499, "1TB": 3299, "2TB": 4499 },
    source: "apple.com/au/shop/buy-iphone/iphone-18-pro, apple.com/au/iphone-18-pro/specs (fetched 2026-10-12)",
  },
  {
    id: "iphone-air",
    name: "iPhone Air",
    family: "phones",
    tier: "slim",
    colours: ["Sky Blue", "Cloud White", "Space Black", "Light Gold"],
    storageOptions: ["256GB", "512GB", "1TB"],
    priceByStorage: { "256GB": 1899, "512GB": 2299, "1TB": 3099 },
    source: "apple.com/au/shop/buy-iphone/iphone-air (fetched 2026-10-12)",
  },
  {
    id: "iphone-17",
    name: "iPhone 17",
    family: "phones",
    tier: "standard",
    colours: ["Lavender", "Mist Blue", "White", "Sage", "Black"],
    storageOptions: ["256GB", "512GB"],
    priceByStorage: { "256GB": 1549, "512GB": 1949 },
    source: "apple.com/au/shop/buy-iphone/iphone-17 (fetched 2026-10-12)",
  },
  {
    id: "iphone-17e",
    name: "iPhone 17e",
    family: "phones",
    tier: "value",
    colours: ["Soft Pink", "White", "Black"],
    storageOptions: ["256GB", "512GB"],
    priceByStorage: { "256GB": 1149, "512GB": 1549 },
    source: "apple.com/au/shop/buy-iphone/iphone-17e (fetched 2026-10-12)",
  },
  {
    id: "iphone-16",
    name: "iPhone 16",
    family: "phones",
    tier: "carryover",
    colours: ["Ultramarine", "Teal", "Pink", "White", "Black"],
    storageOptions: ["128GB"],
    priceByStorage: { "128GB": 1349 },
    source: "apple.com/au/shop/buy-iphone/iphone-16 (fetched 2026-10-12)",
  },
];

export const productById = (id: string): Product | undefined => PRODUCTS.find((p) => p.id === id);

// The SKU the server sells until the conversation script offers a real
// storage choice (ADR 5) — the cheapest/first option Apple lists.
export const defaultStorage = (product: Product): string => product.storageOptions[0] ?? "";

// The units on the shelf at the start (placeholder). Keyed product -> colour ->
// storage -> qty; only the `defaultStorage` tier is reachable through
// today's conversation flow, so other tiers are left thin or at zero on
// purpose, not because they are estimated to sell that way.
export const START_STOCK: Record<string, Record<string, Record<string, number>>> = {
  "iphone-duo": {
    "Star White": { "256GB": 2 },
    "Night Sky": { "256GB": 1 },
  },
  "iphone-18-pro": {
    Burgundy: { "256GB": 2 },
    Glacier: { "256GB": 4 },
    Silver: { "256GB": 2 },
    Black: { "256GB": 3 },
  },
  "iphone-air": {
    "Sky Blue": { "256GB": 2 },
    "Cloud White": { "256GB": 2 },
    "Space Black": { "256GB": 1 },
    "Light Gold": { "256GB": 0 },
  },
  "iphone-17": {
    Lavender: { "256GB": 2 },
    "Mist Blue": { "256GB": 3 },
    White: { "256GB": 0 },
    Sage: { "256GB": 2 },
    Black: { "256GB": 1 },
  },
  "iphone-17e": {
    "Soft Pink": { "256GB": 2 },
    White: { "256GB": 2 },
    Black: { "256GB": 2 },
  },
  "iphone-16": {
    Ultramarine: { "128GB": 2 },
    Teal: { "128GB": 1 },
    Pink: { "128GB": 0 },
    White: { "128GB": 2 },
    Black: { "128GB": 2 },
  },
};
