import { accessSync, constants, statSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_DB_PATH, openDatabase } from "./db/client";

function mode(path: string): string {
  return (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
}

export type DoctorCheck = { pass: boolean; message: string };

/** `vhud doctor`: checks the API key (never printed), ~/.visor permissions and SQLite WAL. */
export function doctor(dbPath = DEFAULT_DB_PATH, log: (line: string) => void = console.log): boolean {
  let ok = true;
  const line = (pass: boolean, msg: string) => {
    if (!pass) ok = false;
    log(`${pass ? "✓" : "✗"} ${msg}`);
  };

  // Never print the key itself
  const key = process.env.ANTHROPIC_API_KEY;
  line(Boolean(key), key ? "ANTHROPIC_API_KEY found" : "ANTHROPIC_API_KEY not set (only needed for live runs in Phase 3)");

  try {
    const db = openDatabase(dbPath);
    const journal = db.$client.pragma("journal_mode", { simple: true });
    db.$client.close();
    const dir = dirname(dbPath);
    line(mode(dir) === "0700", `${dir} permissions ${mode(dir)} (want 0700)`);
    line(mode(dbPath) === "0600", `traces.db permissions ${mode(dbPath)} (want 0600)`);
    line(journal === "wal", `SQLite journal mode ${String(journal)} (want wal)`);
    accessSync(dbPath, constants.R_OK | constants.W_OK);
  } catch (err) {
    line(false, `SQLite failed to open: ${(err as Error).message}`);
  }
  return ok;
}

