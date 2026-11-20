import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type ClaudeProfile = { name: string | null; plan: string | null };

const PLANS: Record<string, string> = { pro: "Pro", max: "Max", team: "Team", enterprise: "Enterprise", free: "Free", ultra: "Ultra" };

/**
 * Who is signed in to Claude Code on this computer, for the sidebar:
 * only the display name (from Claude Code's settings file) and the plan
 * (from `claude auth status`). Never reads or returns tokens or the email.
 */
export async function claudeProfile(home = homedir()): Promise<ClaudeProfile> {
  const [name, plan] = await Promise.all([displayName(home), planName()]);
  return { name, plan };
}

async function displayName(home: string): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(join(process.env.CLAUDE_CONFIG_DIR ?? home, ".claude.json"), "utf8")) as { oauthAccount?: { displayName?: unknown } };
    const n = raw.oauthAccount?.displayName;
    return typeof n === "string" && n.trim() ? n.trim().slice(0, 60) : null;
  } catch {
    return null;
  }
}

function planName(): Promise<string | null> {
  return new Promise((done) => {
    execFile("claude", ["auth", "status"], { timeout: 4000 }, (err, stdout) => {
      if (err) return done(null);
      try {
        const s = JSON.parse(stdout) as { loggedIn?: boolean; subscriptionType?: unknown };
        const t = typeof s.subscriptionType === "string" ? s.subscriptionType.toLowerCase() : "";
        done(s.loggedIn ? (PLANS[t] ?? null) : null);
      } catch {
        done(null);
      }
    });
  });
}
