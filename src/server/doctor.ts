import { accessSync, constants, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { existsSync } from "node:fs";
import { loadConfig } from "./config";
import { DEFAULT_DB_PATH, openDatabase } from "./db/client";

function mode(path: string): string {
  return (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
}

export type DoctorCheck = { pass: boolean; message: string };

/** `vhud doctor`: checks the API key (never printed), ~/.visor permissions and SQLite WAL. */
/** Whether a command can be started: an absolute path that exists, or a name on PATH. */
export function commandExists(cmd: string, path = process.env.PATH ?? ""): boolean {
  if (isAbsolute(cmd)) return existsSync(cmd);
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  return path.split(delimiter).some((dir) => dir && exts.some((e) => existsSync(join(dir, cmd + e))));
}

export function doctor(dbPath = DEFAULT_DB_PATH, log: (line: string) => void = console.log, workspacePath = process.cwd()): boolean {
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

  // .visor.json and the MCP servers it configures
  const { config, path, error } = loadConfig(workspacePath);
  if (error) line(false, `.visor.json is invalid: ${error}`);
  else line(true, path ? `.visor.json loaded (${config.breakpoints.length} rules, ${config.triggers.length} triggers)` : "No .visor.json in this folder (defaults apply)");
  for (const [name, server] of Object.entries(config.mcpServers)) {
    const cmd = typeof server.command === "string" ? server.command : null;
    const url = typeof server.url === "string" ? server.url : null;
    if (cmd) line(commandExists(cmd), `MCP ${name}: ${commandExists(cmd) ? "command found" : "command not found"} (${cmd})`);
    else if (url) line(/^https?:\/\//.test(url), `MCP ${name}: remote server ${url}`);
    else line(false, `MCP ${name}: needs a "command" or "url"`);
  }
  return ok;
}

