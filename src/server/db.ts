// Server-only: opens the SQLite file and migrates at boot. Same pattern as
// crit 7's src/lib/db.ts --- foreign keys OFF while migrating (better-sqlite3
// turns them ON by default, which breaks a table rebuild mid-migration),
// back ON + checked after. See CLAUDE.md "Known gotchas".
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
client.pragma("busy_timeout = 5000");

export const db = drizzle(client, { schema: {} });
export const rawClient = client;

const migrationsFolder = "./drizzle";
if (existsSync(migrationsFolder)) {
  client.pragma("foreign_keys = OFF");
  migrate(db, { migrationsFolder });
  client.pragma("foreign_keys = ON");
  const fkProblems = client.pragma("foreign_key_check") as unknown[];
  if (fkProblems.length > 0) {
    throw new Error(`foreign_key_check after migrate: ${JSON.stringify(fkProblems)}`);
  }
} else {
  console.warn(`no ${migrationsFolder} yet --- run \`pnpm db:generate\` and commit it`);
}

export function inTransaction<T>(fn: () => T): T {
  return client.transaction(fn)();
}
