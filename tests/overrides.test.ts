import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VisorEvent, VisorEventOf } from "@shared/events";
import { createApp } from "@server/app";
import { loadConfig } from "@server/config";
import { openDatabase } from "@server/db/client";
import { TraceStore } from "@server/db/queries";
import { TraceRecorder } from "@server/db/recorder";
import { editOutsideWorkspace, isWrite, PolicyEngine } from "@server/interceptor/policy";
import { TriggerEngine } from "@server/interceptor/triggers";
import { MockRuntimeAdapter } from "@server/runtime/mock-adapter";
import { SessionRunner } from "@server/runtime/session-runner";

const of = <T extends VisorEvent["type"]>(events: VisorEvent[], type: T) => events.filter((e): e is VisorEventOf<T> => e.type === type);
const base = { prompt: "", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium" as const, budgetCapMicroUsd: null };

describe("pause toggles", () => {
  it("pauses shell, edits and MCP writes only when switched on", () => {
    const p = new PolicyEngine();
    const bash = { toolName: "Bash", input: { command: "ls" } };
    const edit = { toolName: "Edit", input: { file_path: "a.ts", old_string: "a", new_string: "b" } };
    const mcpWrite = { toolName: "mcp__github__create_issue", input: { title: "x" } };
    const mcpRead = { toolName: "mcp__github__list_issues", input: {} };
    expect([bash, edit, mcpWrite, mcpRead].map((c) => p.evaluate(c).action)).toEqual(["allow", "allow", "allow", "allow"]);
    p.setToggles({ bash: true });
    expect(p.evaluate(bash)).toEqual({ action: "pause", rule: "pause-bash" });
    expect(p.evaluate(edit).action).toBe("allow");
    expect(p.setToggles({ edits: true, mcpWrites: true })).toEqual({ bash: true, edits: true, mcpWrites: true });
    expect(p.evaluate(edit)).toEqual({ action: "pause", rule: "pause-edits" });
    expect(p.evaluate(mcpWrite)).toEqual({ action: "pause", rule: "pause-mcp-writes" });
    expect(p.evaluate(mcpRead).action).toBe("allow");
    // Built-in protections still win
    expect(p.evaluate({ toolName: "Read", input: { file_path: ".env" } })).toEqual({ action: "block", rule: "secret-files" });
    expect(p.evaluate({ toolName: "Bash", input: { command: "git push --force" } })).toEqual({ action: "pause", rule: "destructive-git" });
  });

  it("matches mcp:* rules against Agent SDK tool names and detects writes by name", () => {
    const p = new PolicyEngine([{ rule: "mcp-write", tool: "mcp:*", write: true, action: "pause" }]);
    expect(p.evaluate({ toolName: "mcp__github__create_issue", input: {} })).toEqual({ action: "pause", rule: "mcp-write" });
    expect(p.evaluate({ toolName: "mcp__github__search_code", input: {} }).action).toBe("allow");
    expect(isWrite("mcp:github.search_code", { method: "tools/call", name: "search_code" })).toBe(false);
    expect(isWrite("mcp__slack__send_message", {})).toBe(true);
  });
});

describe("edits outside the workspace", () => {
  it("detects writes that escape the workspace folder", () => {
    const ws = "/Users/me/visor-tests/site";
    expect(editOutsideWorkspace("Write", { file_path: "index.html" }, ws)).toBeNull();
    expect(editOutsideWorkspace("Edit", { file_path: "/Users/me/visor-tests/site/src/a.ts" }, ws)).toBeNull();
    expect(editOutsideWorkspace("Write", { file_path: "../other/x.html" }, ws)).toBe("/Users/me/visor-tests/other/x.html");
    expect(editOutsideWorkspace("Edit", { file_path: "/Users/me/.zshrc" }, ws)).toBe("/Users/me/.zshrc");
    expect(editOutsideWorkspace("Write", { file_path: "/Users/me/visor-tests/site-evil/a" }, ws)).toBe("/Users/me/visor-tests/site-evil/a");
    expect(editOutsideWorkspace("Read", { file_path: "/etc/hosts" }, ws)).toBeNull(); // only edits
  });

  it("pauses such an edit in a session even when nothing else would", async () => {
    // A runtime that makes one absolute-path edit outside the workspace
    const adapter = {
      name: "outside",
      async *run(o: { sessionId: string }, hooks: { onToolUse: (r: unknown) => Promise<unknown> }) {
        yield* [];
        await hooks.onToolUse({ sessionId: o.sessionId, turnId: "t1", spanId: "s1", toolName: "Write", input: { file_path: "/tmp/elsewhere.txt", content: "x" } });
      },
    };
    const runner = new SessionRunner({ adapter: adapter as never, validate: false });
    const paused: string[] = [];
    runner.subscribe((e) => {
      if (e.type === "breakpoint.paused") {
        paused.push(e.rule);
        queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "approved" }));
      }
    });
    await runner.run({ ...base, sessionId: "out", workspacePath: "/somewhere/else" });
    expect(paused).toEqual(["outside-workspace"]);
  });
});

describe("notification triggers", () => {
  const t = new TriggerEngine([
    { type: "path", pattern: "src/auth/", action: "notify", label: "auth code" },
    { type: "path", pattern: "git push", action: "block" },
    { type: "path", pattern: "([", action: "notify" }, // invalid regex: skipped, not thrown
    { type: "tokens", above: 25_000, action: "notify" },
  ]);

  it("raises alerts and blocks by regex on paths and commands", () => {
    expect(t.onToolCall("Read", { file_path: "src/auth/session.ts" })).toEqual({
      block: null,
      alerts: [{ level: "warning", title: "Read touched a watched path", detail: "src/auth/session.ts matched auth code", trigger: "auth code" }],
    });
    const push = t.onToolCall("Bash", { command: "git push origin main" });
    expect(push.block).toBe("trigger:path /git push/");
    expect(push.alerts[0]?.level).toBe("danger");
    expect(t.onToolCall("Read", { file_path: "README.md" })).toEqual({ block: null, alerts: [] });
  });

  it("warns on prompts above a token limit", () => {
    expect(t.onUsage({ inputTokens: 1_000, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 30_000, outputTokens: 10 })[0]?.detail).toContain("31,000 prompt tokens");
    expect(t.onUsage({ inputTokens: 100, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 100, outputTokens: 10 })).toEqual([]);
  });

  it("runs before policy inside a session: alerts, a trigger block, and token warnings", async () => {
    const runner = new SessionRunner({
      adapter: new MockRuntimeAdapter({ speed: 0 }),
      validate: true,
      triggers: new TriggerEngine([
        { type: "path", pattern: "src/auth/", action: "notify" },
        { type: "path", pattern: "force", action: "block", label: "no force" },
        { type: "tokens", above: 26_000, action: "notify" },
      ]),
    });
    const events = await runner.run({ ...base, sessionId: "trig" });
    const alerts = of(events, "alert");
    expect(alerts.some((a) => a.title.includes("watched path") && a.spanId)).toBe(true);
    expect(alerts.some((a) => a.title === "Token alert")).toBe(true);
    // The force-push is blocked by the trigger, never reaching a breakpoint
    expect(of(events, "breakpoint.paused")).toHaveLength(0);
    expect(of(events, "breakpoint.resolved").find((r) => r.decision === "auto_blocked")).toMatchObject({ toolName: "Bash", rule: "trigger:no force" });
    for (const a of alerts.filter((x) => x.spanId)) {
      expect(events.findIndex((e) => e.type === "span.started" && e.spanId === a.spanId)).toBeLessThan(events.indexOf(a));
    }
  });

  it("pauses file edits mid-session when the edits switch is on", async () => {
    const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }), validate: true, policy: new PolicyEngine([], { bash: false, edits: true, mcpWrites: false }) });
    runner.subscribe((e) => {
      if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "approved" }));
    });
    const events = await runner.run({ ...base, sessionId: "edits" });
    expect(of(events, "breakpoint.paused").filter((p) => p.rule === "pause-edits").map((p) => p.toolName)).toEqual(["Edit", "Edit"]);
  });
});

describe("policy and audit API", () => {
  const auth = { authorization: "Bearer t", "content-type": "application/json" };

  it("reads and updates the pause switches, rejecting bad bodies", async () => {
    const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }) });
    const app = createApp({ runner, token: "t", workspacePath: "/w" });
    expect(await (await app.request("/api/policy", { headers: auth })).json()).toMatchObject({ toggles: { bash: false, edits: false, mcpWrites: false } });
    const put = await app.request("/api/policy", { method: "PUT", headers: auth, body: JSON.stringify({ bash: true }) });
    expect(await put.json()).toEqual({ toggles: { bash: true, edits: false, mcpWrites: false } });
    expect((await app.request("/api/policy", { method: "PUT", headers: auth, body: JSON.stringify({ bash: "yes" }) })).status).toBe(400);
    expect((await app.request("/api/policy", { method: "PUT", headers: auth, body: JSON.stringify({ everything: true }) })).status).toBe(400);
    expect(runner.policy.getToggles().bash).toBe(true);
  });

  it("lists override decisions across sessions with notes and edited payloads", async () => {
    const db = openDatabase(":memory:");
    const recorder = new TraceRecorder(db);
    const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }), validate: true });
    let n = 0;
    runner.subscribe((e) => {
      recorder.record(e);
      if (e.type === "breakpoint.paused")
        queueMicrotask(() => runner.resolveBreakpoint(e.spanId, n++ === 0 ? { decision: "edited", input: { command: "git push origin fix" } } : { decision: "denied", note: "not today" }));
    });
    await runner.run({ ...base, sessionId: "a1" });
    await runner.run({ ...base, sessionId: "a2", prompt: "Second run" });
    const app = createApp({ runner, token: "t", workspacePath: "/w", store: new TraceStore(db) });
    const { entries } = (await (await app.request("/api/audit", { headers: auth })).json()) as { entries: { decision: string; sessionTitle: string; finalInputJson: string | null; operatorNote: string | null }[] };
    expect(entries.map((e) => e.decision)).toEqual(["denied", "edited"]);
    expect(entries[0]).toMatchObject({ sessionTitle: "Second run", operatorNote: "not today" });
    expect(JSON.parse(entries[1]!.finalInputJson!)).toEqual({ command: "git push origin fix" });
  });

  it("loads triggers and pause defaults from .visor.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "visor-trig-"));
    writeFileSync(join(dir, ".visor.json"), JSON.stringify({ pause: { bash: true }, triggers: [{ type: "path", pattern: "\\.env|id_rsa", action: "block" }, { type: "tokens", above: 200000 }] }));
    const { config, error } = loadConfig(dir);
    expect(error).toBeNull();
    expect(config.pause).toEqual({ bash: true, edits: false, mcpWrites: false });
    expect(config.triggers).toHaveLength(2);
  });
});
