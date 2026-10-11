import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { MIGRATIONS, migrate } from "../src/server/migrate.ts";

// Promise: the app meets a database file that already exists, as it will on
// the Fly volume after every deploy and restart. These run against throwaway
// in-memory databases, so they need no running app.

const columns = (db: Database.Database, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);

it("builds the schema on an empty database", () => {
  const db = new Database(":memory:");
  expect(migrate(db)).toBe(MIGRATIONS.length);
  expect(columns(db, "events")).toContain("ts");
  expect(columns(db, "visitors")).toContain("token");
});

it("is idempotent: a second run changes nothing and does not throw", () => {
  const db = new Database(":memory:");
  migrate(db);
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES ('a','t','n','c',1,1)").run();
  migrate(db);
  expect(db.prepare("SELECT COUNT(*) AS n FROM visitors").get()).toEqual({ n: 1 });
});

it("picks up only the steps a database has not seen", () => {
  const db = new Database(":memory:");
  migrate(db, MIGRATIONS.slice(0, 1));
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES ('a','t','n','c',1,1)").run();
  migrate(db, [...MIGRATIONS, "ALTER TABLE visitors ADD COLUMN note TEXT;"]);
  expect(columns(db, "visitors")).toContain("note");
  expect(db.prepare("SELECT COUNT(*) AS n FROM visitors").get()).toEqual({ n: 1 });
});

it("fails loudly when a file already holds a different 'events' table", () => {
  // The case that took the live app down: another app's table of the same name.
  const db = new Database(":memory:");
  db.exec("CREATE TABLE events (id INTEGER PRIMARY KEY, kind TEXT)");
  expect(() => migrate(db)).toThrow(/events/);
});
