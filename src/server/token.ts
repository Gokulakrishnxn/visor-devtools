import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The GUI's access token, kept in ~/.visor/token (only you can read it) so
 * the link and a remembered browser keep working after `vhud` restarts.
 * Delete the file to make a new one.
 */
export function savedToken(dir: string): string {
  const file = join(dir, "token");
  try {
    const existing = readFileSync(file, "utf8").trim();
    if (/^[A-Za-z0-9_-]{24,}$/.test(existing)) return existing;
  } catch {
    // no token yet
  }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = randomBytes(24).toString("base64url");
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return token;
}
