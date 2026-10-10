import type Database from "better-sqlite3";

// Schema changes are numbered steps applied in order, with the number of the
// last applied step kept in the database itself (PRAGMA user_version). The
// file on the Fly volume outlives every deploy, so the code has to meet it as
// it is, not as an empty file.
//
// Never edit a step that has shipped: add a new one at the end.
export const MIGRATIONS: string[] = [
  // 1: who a visitor is, and a log of what happened
  `
  CREATE TABLE visitors (
    id         TEXT PRIMARY KEY,
    token      TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    colour     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
  );
  CREATE TABLE events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         INTEGER NOT NULL,
    visitor_id TEXT REFERENCES visitors(id),
    type       TEXT NOT NULL,
    data       TEXT
  );
  `,
];

// Applies every step the database has not seen yet, each in its own
// transaction. A step that collides with something already in the file (a
// table left by an older app, say) throws and boot stops: loud beats a
// schema that quietly differs from what the code expects.
export function migrate(db: Database.Database, steps: string[] = MIGRATIONS): number {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let i = current; i < steps.length; i++) {
    db.transaction(() => {
      db.exec(steps[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
  return steps.length;
}
