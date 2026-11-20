import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp, existingFolder } from "@server/app";
import { MockRuntimeAdapter } from "@server/runtime/mock-adapter";
import { SessionRunner } from "@server/runtime/session-runner";

const auth = { authorization: "Bearer t", "content-type": "application/json" };

describe("open a folder", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "visor-folders-")));
  mkdirSync(join(root, "site"));
  mkdirSync(join(root, "api"));
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "notes.txt"), "x");

  it("lists folders only, sorted, without hidden ones", async () => {
    const app = createApp({ runner: new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }) }), token: "t", workspacePath: root });
    const res = await app.request(`/api/folders?path=${encodeURIComponent(root)}`, { headers: auth });
    const body = (await res.json()) as { path: string; parent: string; folders: { name: string }[] };
    expect(body.path).toBe(root);
    expect(body.folders.map((f) => f.name)).toEqual(["api", "site"]);
    expect((await app.request(`/api/folders?path=${encodeURIComponent(join(root, "notes.txt"))}`, { headers: auth })).status).toBe(404);
    expect((await app.request("/api/folders", {})).status).toBe(401);
  });

  it("starts a session in the chosen folder and refuses bad paths", async () => {
    const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }) });
    const started: string[] = [];
    runner.subscribe((e) => {
      if (e.type === "session.started") started.push(e.workspacePath);
      if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "denied" }));
    });
    const app = createApp({ runner, token: "t", workspacePath: root });
    const start = (workspacePath?: string) => app.request("/api/sessions", { method: "POST", headers: auth, body: JSON.stringify({ prompt: "hi", workspacePath }) });
    expect((await start(join(root, "site"))).status).toBe(202);
    expect((await start()).status).toBe(202);
    await expect.poll(() => started.length).toBe(2);
    expect(started).toEqual([join(root, "site"), root]);
    expect((await start("relative/path")).status).toBe(400);
    expect((await start(join(root, "missing"))).status).toBe(400);
    expect((await start(join(root, "notes.txt"))).status).toBe(400);
    expect(existingFolder(join(root, "site", ".."))).toBe(root);
  });
});
