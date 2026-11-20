import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "@server/app";
import { claudeProfile } from "@server/profile";
import { MockRuntimeAdapter } from "@server/runtime/mock-adapter";
import { SessionRunner } from "@server/runtime/session-runner";

describe("Claude profile in the sidebar", () => {
  it("reads only the display name from Claude Code's settings, never the email", async () => {
    const home = mkdtempSync(join(tmpdir(), "visor-home-"));
    writeFileSync(join(home, ".claude.json"), JSON.stringify({ oauthAccount: { displayName: "Ada", emailAddress: "ada@example.com", accessToken: "secret" } }));
    const saved = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;
    try {
      const p = await claudeProfile(home);
      expect(p.name).toBe("Ada");
      expect(Object.keys(p).sort()).toEqual(["name", "plan"]);
      expect(JSON.stringify(p)).not.toContain("example.com");
      expect((await claudeProfile(mkdtempSync(join(tmpdir(), "visor-none-")))).name).toBeNull();
    } finally {
      if (saved !== undefined) process.env.CLAUDE_CONFIG_DIR = saved;
    }
  });

  it("serves it behind the token, looked up once", async () => {
    let calls = 0;
    const app = createApp({
      runner: new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }) }),
      token: "t",
      workspacePath: "/w",
      profile: async () => (calls++, { name: "Ada", plan: "Pro" }),
    });
    expect((await app.request("/api/profile")).status).toBe(401);
    const auth = { authorization: "Bearer t" };
    expect(await (await app.request("/api/profile", { headers: auth })).json()).toEqual({ name: "Ada", plan: "Pro" });
    await app.request("/api/profile", { headers: auth });
    expect(calls).toBe(1);
  });
});

describe("saved access token", async () => {
  const { savedToken } = await import("@server/token");
  const { statSync } = await import("node:fs");
  it("creates one private token and reuses it on every launch", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "visor-tok-")), ".visor");
    const first = savedToken(dir);
    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(savedToken(dir)).toBe(first);
    expect(statSync(join(dir, "token")).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    writeFileSync(join(dir, "token"), "short");
    expect(savedToken(dir)).not.toBe("short"); // a broken file is replaced
  });
});
