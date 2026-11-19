import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type VisorDb = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/** `VISOR_DB` overrides the location (useful for demos and CI). */
export const DEFAULT_DB_PATH = process.env.VISOR_DB || join(homedir(), ".visor", "traces.db");

/** Finds the generated migrations whether running from src/ (tsx) or dist/ (bundle). */
function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, "../../../drizzle"), join(here, "../drizzle"), join(here, "drizzle")]) {
    if (existsSync(join(candidate, "meta", "_journal.json"))) return candidate;
  }
  throw new Error("Could not find drizzle migrations folder");
}

/**
 * Opens (and migrates) the trace database with the PRD's file security:
 * the folder is 0700, the database and its WAL files are 0600, WAL mode on.
 * Pass ":memory:" for tests.
 */
export function openDatabase(path = DEFAULT_DB_PATH): VisorDb {
  if (path !== ":memory:") {
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  if (path !== ":memory:") {
    for (const file of [path, `${path}-wal`, `${path}-shm`]) {
      if (existsSync(file)) chmodSync(file, 0o600);
    }
  }
  const db = drizzle(sqlite, { schema }) as VisorDb;
  migrate(db, { migrationsFolder: migrationsFolder() });
  return db;
}
