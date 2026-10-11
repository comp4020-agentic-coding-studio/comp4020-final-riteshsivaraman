// What the store sells, as data. Everything here is a PLACEHOLDER [TK]: the
// names, the colours and the quantities are not decided, and are not real
// products or prices. They exist so the conversation and the stock rules have
// something to work on (SCOPE.md 3e: a product is a data row, not a model).
// Prices and budget are not here at all: where a visitor's budget comes from is
// still open in SCOPE.md.

export interface Product {
  id: string;
  name: string; // [TK]
  family: "phones";
  colours: string[]; // [TK]
}

export const PRODUCTS: Product[] = [
  { id: "phone-a", name: "Phone A", family: "phones", colours: ["Graphite", "Silver", "Blue"] },
  { id: "phone-b", name: "Phone B", family: "phones", colours: ["Graphite", "Silver", "Blue"] },
  { id: "phone-c", name: "Phone C", family: "phones", colours: ["Graphite", "Silver", "Blue"] },
];

// The units on the shelf at the start [TK]. Some are deliberately zero or one,
// so "sold out" and "someone else got the last one" can actually happen.
export const START_STOCK: Record<string, Record<string, number>> = {
  "phone-a": { Graphite: 3, Silver: 1, Blue: 0 },
  "phone-b": { Graphite: 2, Silver: 2, Blue: 1 },
  "phone-c": { Graphite: 1, Silver: 0, Blue: 2 },
};

export const productById = (id: string): Product | undefined => PRODUCTS.find((p) => p.id === id);
