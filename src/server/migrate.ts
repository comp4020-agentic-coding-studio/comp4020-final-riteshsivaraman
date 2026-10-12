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
  // 4: storage joins colour as a real axis of a SKU (ADR 5, SCOPE D37/D38):
  // a product is sold in more than one storage size, each its own price and
  // stock count. `stock`'s primary key widens to (product, colour, storage);
  // SQLite cannot alter a primary key in place, so the table is rebuilt (safe
  // without the foreign_keys dance in CLAUDE.md's gotcha note: nothing
  // references `stock` via a foreign key, and `stock` itself has none).
  // `reservations` only gains a plain column, since its key is `id`. No
  // picker exists yet in the conversation script (`src/shared/conversation.ts`
  // still asks for a colour only); the server resolves a default storage per
  // product until a later session adds the real choice — see ADR 5.
  `
  CREATE TABLE stock_new (
    product TEXT NOT NULL,
    colour  TEXT NOT NULL,
    storage TEXT NOT NULL DEFAULT '',
    qty     INTEGER NOT NULL CHECK (qty >= 0),
    PRIMARY KEY (product, colour, storage)
  );
  INSERT INTO stock_new (product, colour, storage, qty) SELECT product, colour, '', qty FROM stock;
  DROP TABLE stock;
  ALTER TABLE stock_new RENAME TO stock;
  ALTER TABLE reservations ADD COLUMN storage TEXT NOT NULL DEFAULT '';
  `,
  // 5: who is inspecting a device right now (D39, first pass: phone only, the
  // device stays on the table). One open row per slot: starting a second
  // inspection on an occupied slot is refused at the service layer, not by
  // this schema, so the race is caught with the same transactional
  // read-then-write the stock code already uses. `ended_at` closes the row;
  // closed rows are kept (not deleted) as the event history a later
  // "who looked at this today" feature could read.
  `
  CREATE TABLE inspections (
    id         TEXT PRIMARY KEY,
    slot_id    TEXT NOT NULL,
    visitor_id TEXT NOT NULL REFERENCES visitors(id),
    started_at INTEGER NOT NULL,
    ended_at   INTEGER
  );
  CREATE INDEX inspections_open ON inspections (slot_id, ended_at);
  `,
  // 6: a customer's goal outlives any one conversation (SCOPE D42, ADR 4
  // option B, built): a `case` (buying a phone, a repair, a pickup) has an
  // owner that a handoff reassigns, and `case_facts` holds what has been
  // learned so the next owner does not have to re-ask. `conversations`
  // becomes one exchange within a case, many per case; the column is
  // nullable so every conversation written before this step stays valid.
  `
  CREATE TABLE cases (
    id          TEXT PRIMARY KEY,
    visitor_id  TEXT NOT NULL REFERENCES visitors(id),
    kind        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open',
    owner_id    TEXT,
    owner_kind  TEXT,
    deadline_at INTEGER,
    created_at  INTEGER NOT NULL,
    ended_at    INTEGER
  );
  CREATE INDEX cases_visitor ON cases (visitor_id, ended_at);
  CREATE INDEX cases_owner ON cases (owner_id, status);
  CREATE TABLE case_facts (
    case_id    TEXT NOT NULL REFERENCES cases(id),
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    learned_by TEXT,
    learned_at INTEGER NOT NULL,
    PRIMARY KEY (case_id, key)
  );
  ALTER TABLE conversations ADD COLUMN case_id TEXT REFERENCES cases(id);
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
