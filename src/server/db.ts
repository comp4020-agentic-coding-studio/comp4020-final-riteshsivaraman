import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "./migrate.ts";
import { seedStock } from "./stock.ts";

// One SQLite file on the Fly volume (/data in the container, .data/ locally).
// Only things that must outlive a restart live here: who a visitor is, and a
// log of what happened. Where people are standing is memory-only.
//
// store.db, not app.db: an earlier app on this volume left an app.db with
// tables of its own, and this one starts clean beside it.
const path = process.env.DATABASE_PATH ?? ".data/store.db";
mkdirSync(dirname(path), { recursive: true });

export const db = new Database(path);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

migrate(db);
// what is on the shelves at the start; never resets what the shop has now
seedStock(db);
