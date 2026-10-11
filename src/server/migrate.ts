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
  // 2: who a visitor chose to be, how they look, where they are in their visit,
  // the conversations they have had with characters, and what the shop has in
  // stock (shared, finite, and so contended). Existing visitors become
  // customers with the default look.
  `
  ALTER TABLE visitors ADD COLUMN role TEXT NOT NULL DEFAULT 'customer';
  ALTER TABLE visitors ADD COLUMN specialty TEXT;
  ALTER TABLE visitors ADD COLUMN look TEXT;
  CREATE TABLE player_state (
    visitor_id TEXT PRIMARY KEY REFERENCES visitors(id),
    state      TEXT NOT NULL,
    since      INTEGER NOT NULL,
    want       TEXT,
    needs      TEXT,
    with_id    TEXT,
    data       TEXT
  );
  CREATE TABLE conversations (
    id          TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES visitors(id),
    with_id     TEXT NOT NULL,
    with_kind   TEXT NOT NULL,
    script      TEXT NOT NULL,
    node        TEXT NOT NULL,
    data        TEXT,
    started_at  INTEGER NOT NULL,
    ended_at    INTEGER
  );
  CREATE INDEX conversations_customer ON conversations (customer_id, ended_at);
  CREATE TABLE stock (
    product TEXT NOT NULL,
    colour  TEXT NOT NULL,
    qty     INTEGER NOT NULL CHECK (qty >= 0),
    PRIMARY KEY (product, colour)
  );
  `,
  // 3: a unit put aside for a visitor is held for a while, not forever. The
  // deadline is a column; the next request that touches stock gives back what
  // has expired (no timer: the machine stops when nobody is connected).
  `
  CREATE TABLE reservations (
    id         TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL REFERENCES visitors(id),
    product    TEXT NOT NULL,
    colour     TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'held',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX reservations_open ON reservations (status, expires_at);
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
