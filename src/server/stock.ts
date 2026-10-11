import type Database from "better-sqlite3";
import { START_STOCK } from "../shared/catalogue.ts";

// Puts the starting stock in, once. A product and colour that are already
// there keep whatever the shop has now (the file outlives every deploy), so
// this only ever adds what is missing.
export function seedStock(db: Database.Database): void {
  const insert = db.prepare("INSERT OR IGNORE INTO stock (product, colour, qty) VALUES (?, ?, ?)");
  db.transaction(() => {
    for (const [product, byColour] of Object.entries(START_STOCK)) {
      for (const [colour, qty] of Object.entries(byColour)) insert.run(product, colour, qty);
    }
  })();
}

// Takes one unit if there is one. True when the visitor got it, false when
// someone else got there first. One statement, so two visitors cannot both
// take the last one.
export function takeOne(db: Database.Database, product: string, colour: string): boolean {
  const r = db.prepare("UPDATE stock SET qty = qty - 1 WHERE product = ? AND colour = ? AND qty > 0").run(product, colour);
  return r.changes === 1;
}

export function stockOf(db: Database.Database, product: string, colour: string): number {
  const row = db.prepare("SELECT qty FROM stock WHERE product = ? AND colour = ?").get(product, colour) as { qty: number } | undefined;
  return row?.qty ?? 0;
}
