import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "@server/app";
import { cleanMessage } from "@server/commit-message";
import { openDatabase } from "@server/db/client";
import { gitState, simpleMessage, validBranch } from "@server/git";
import { MockRuntimeAdapter } from "@server/runtime/mock-adapter";
import { SessionRunner } from "@server/runtime/session-runner";
import { Wallet } from "@server/wallet";

const auth = { authorization: "Bearer t", "content-type": "application/json" };

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "visor-git-")));
  const g = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  g("init", "-q", "-b", "main");
  g("config", "user.name", "Test");
  g("config", "user.email", "test@example.com");
  g("config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "a.txt"), "one\n");
  g("add", "-A");
  g("commit", "-q", "-m", "First");
  return { dir, g };
}

describe("git bar", () => {
  it("reads the branch and changed files", async () => {
    const { dir } = repo();
    writeFileSync(join(dir, "a.txt"), "two\n");
    writeFileSync(join(dir, "new file.md"), "hi\n");
    const s = await gitState(dir);
    expect(s).toMatchObject({ repo: true, branch: "main", branches: ["main"], ahead: 0 });
    expect(s.repo && s.files.map((f) => [f.path, f.status]).sort()).toEqual([
      ["a.txt", "modified"],
      ["new file.md", "untracked"],
    ]);
    expect(await gitState(realpathSync(mkdtempSync(join(tmpdir(), "visor-nogit-"))))).toEqual({ repo: false });
  });

  it("switches and creates branches, refusing unsafe names", async () => {
    const { dir } = repo();
    const app = createApp({ runner: new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }) }), token: "t", workspacePath: dir });
    const branch = (name: string, create: boolean) => app.request("/api/git/branch", { method: "POST", headers: auth, body: JSON.stringify({ path: dir, name, create }) });
    expect(await (await branch("feat/git-bar", true)).json()).toMatchObject({ branch: "feat/git-bar", branches: ["feat/git-bar", "main"] });
    expect(await (await branch("main", false)).json()).toMatchObject({ branch: "main" });
    expect((await branch("--force", true)).status).toBe(400);
    expect(validBranch("a..b")).toBe(false);
    expect(validBranch("feat/ok-1.2")).toBe(true);
  });

  it("commits only the chosen files with your message, never adding trailers", async () => {
    const { dir, g } = repo();
    writeFileSync(join(dir, "a.txt"), "two\n");
    writeFileSync(join(dir, "b.txt"), "b\n");
    const app = createApp({ runner: new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }) }), token: "t", workspacePath: dir });
    const res = await app.request("/api/git/commit", { method: "POST", headers: auth, body: JSON.stringify({ path: dir, message: "Update a", paths: ["a.txt"] }) });
    const body = (await res.json()) as { id: string; files: { path: string }[] };
    expect(body.id).toMatch(/^[0-9a-f]{7,}$/);
    expect(body.files.map((f) => f.path)).toEqual(["b.txt"]); // b.txt left for later
    expect(g("log", "-1", "--format=%B").trim()).toBe("Update a");
    expect((await app.request("/api/git/commit", { method: "POST", headers: auth, body: JSON.stringify({ path: dir, message: "  " }) })).status).toBe(400);
  });

  it("writes the message with AI in live mode and charges the wallet; demo mode stays free", async () => {
    const { dir } = repo();
    writeFileSync(join(dir, "a.txt"), "two\n");
    const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }) });
    const wallet = new Wallet(openDatabase(":memory:"), true);
    wallet.deposit(1_000_000);
    let seen = "";
    const live = createApp({
      runner,
      token: "t",
      workspacePath: dir,
      wallet,
      info: { runtime: "claude" },
      commitWriter: async (diff) => ((seen = diff), { message: "Change a.txt to two", costMicroUsd: 400 }),
    });
    const r = await live.request("/api/git/message", { method: "POST", headers: auth, body: JSON.stringify({ path: dir }) });
    expect(await r.json()).toEqual({ message: "Change a.txt to two", costMicroUsd: 400, ai: true });
    expect(seen).toContain("+two");
    expect(wallet.balance()).toBe(1_000_000 - 400);
    expect(wallet.entries()[0]).toMatchObject({ entryType: "debit", note: "Commit message (AI)" });

    const demo = createApp({ runner, token: "t", workspacePath: dir });
    expect(await (await demo.request("/api/git/message", { method: "POST", headers: auth, body: JSON.stringify({ path: dir }) })).json()).toEqual({ message: "Update a.txt", costMicroUsd: 0, ai: false });
  });

  it("cleans what the model returns", () => {
    expect(cleanMessage('```\n"Add search"\n\n- index it\nCo-Authored-By: X <x@y.z>\n```')).toBe("Add search\n\n- index it");
    expect(simpleMessage([{ path: "src/a.ts", status: "untracked", staged: false }])).toBe("Add a.ts");
  });
});
