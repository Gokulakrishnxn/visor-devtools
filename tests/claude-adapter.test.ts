import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HookCallback, Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { VisorEvent, type VisorEventOf } from "@shared/events";
import { createApp } from "@server/app";
import { loadConfig, resolveRuntime } from "@server/config";
import { openDatabase } from "@server/db/client";
import { TraceStore } from "@server/db/queries";
import { TraceRecorder } from "@server/db/recorder";
import { ClaudeSdkAdapter, diffFromInput, spanNameFor, spanTypeFor, type QueryFn } from "@server/runtime/claude-sdk-adapter";
import { SessionRunner } from "@server/runtime/session-runner";
import { SpanTreeBuilder } from "@server/telemetry/span-builder";

// A fake `query()` that streams what the Agent SDK streams and calls the
// PreToolUse hook before each tool, the way the real SDK does. No network.
type Captured = { options?: Options; hookReplies: unknown[] };

const usage = (input: number, read: number, write: number, output: number) => ({
  input_tokens: input,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
  output_tokens: output,
});

function fakeQuery(captured: Captured): QueryFn {
  return async function* ({ options }) {
    captured.options = options;
    const pre = options!.hooks!.PreToolUse![0]!.hooks[0]! as HookCallback;
    const callTool = async (id: string, name: string, input: Record<string, unknown>) => {
      const reply = await pre({ hook_event_name: "PreToolUse", tool_name: name, tool_input: input, tool_use_id: id, session_id: "sdk", transcript_path: "", cwd: "/w" } as never, id, { signal: new AbortController().signal });
      captured.hookReplies.push(reply);
      return reply as { hookSpecificOutput: { permissionDecision: string } };
    };
    const ev = (event: unknown, parent: string | null = null) => ({ type: "stream_event", event, parent_tool_use_id: parent, uuid: "u", session_id: "sdk" }) as unknown as SDKMessage;
    const assistant = (id: string, content: unknown[], parent: string | null = null, u = usage(100, 2000, 0, 50)) =>
      ({ type: "assistant", message: { id, content, usage: u }, parent_tool_use_id: parent, uuid: "u", session_id: "sdk" }) as unknown as SDKMessage;
    const result = (id: string, content: string, isError = false, parent: string | null = null) =>
      ({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] }, parent_tool_use_id: parent, uuid: "u", session_id: "sdk" }) as unknown as SDKMessage;

    // Main agent: thinks, says something, reads a file and tries a force-push
    yield ev({ type: "message_start", message: { id: "msg_1", usage: usage(100, 2000, 0, 1) } });
    yield ev({ type: "content_block_start", index: 0, content_block: { type: "thinking" } });
    yield ev({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "The test races the refresh." } });
    yield ev({ type: "content_block_start", index: 1, content_block: { type: "text" } });
    yield ev({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Let me look." } });
    yield ev({ type: "message_delta", delta: {}, usage: { output_tokens: 50 } });
    yield ev({ type: "message_stop" });
    yield assistant("msg_1", [
      { type: "tool_use", id: "toolu_read", name: "Read", input: { file_path: "src/auth/session.ts" } },
      { type: "tool_use", id: "toolu_push", name: "Bash", input: { command: "git push --force origin main" } },
    ]);
    await callTool("toolu_read", "Read", { file_path: "src/auth/session.ts" });
    yield result("toolu_read", "export async function getSession() {}");
    const push = await callTool("toolu_push", "Bash", { command: "git push --force origin main" });
    yield result("toolu_push", "denied", push.hookSpecificOutput.permissionDecision === "deny");

    // A subagent that edits a file
    yield ev({ type: "message_start", message: { id: "msg_2", usage: usage(50, 2100, 300, 1) } });
    yield ev({ type: "message_stop" });
    yield assistant("msg_2", [{ type: "tool_use", id: "toolu_task", name: "Task", input: { subagent_type: "fixer", description: "Fix it" } }], null, usage(50, 2100, 300, 30));
    await callTool("toolu_task", "Task", { subagent_type: "fixer", description: "Fix it" });
    yield ev({ type: "message_start", message: { id: "msg_3", usage: usage(40, 900, 0, 1) } }, "toolu_task");
    yield ev({ type: "message_stop" }, "toolu_task");
    yield assistant("msg_3", [{ type: "tool_use", id: "toolu_edit", name: "Edit", input: { file_path: "src/auth/session.ts", old_string: "a();", new_string: "await a();" } }], "toolu_task", usage(40, 900, 0, 20));
    await callTool("toolu_edit", "Edit", { file_path: "src/auth/session.ts", old_string: "a();", new_string: "await a();" });
    yield result("toolu_edit", "ok", false, "toolu_task");
    yield result("toolu_task", "Fixed the race.");

    yield { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 9000, post_tokens: 3000 }, uuid: "u", session_id: "sdk" } as unknown as SDKMessage;
    // A duplicate assistant frame for msg_1 must not be billed twice
    yield assistant("msg_1", []);
    yield { type: "result", subtype: "success", total_cost_usd: 0.0123, is_error: false, num_turns: 3, result: "done", usage: {}, modelUsage: {}, uuid: "u", session_id: "sdk" } as unknown as SDKMessage;
  };
}

async function runFake(cap: number | null = 5_000_000) {
  const captured: Captured = { hookReplies: [] };
  const runner = new SessionRunner({ adapter: new ClaudeSdkAdapter({ query: fakeQuery(captured) }), validate: true });
  runner.subscribe((e) => {
    if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "denied", note: "Push to a branch instead" }));
  });
  const events = await runner.run({ sessionId: "s1", prompt: "Fix the flaky test", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: cap });
  return { events, captured, runner };
}

const of = <T extends VisorEvent["type"]>(events: VisorEvent[], type: T) => events.filter((e): e is VisorEventOf<T> => e.type === type);

describe("ClaudeSdkAdapter (fake SDK, no network)", () => {
  it("configures the SDK with isolation, streaming, hooks and the hard cap", async () => {
    const { captured } = await runFake();
    const o = captured.options!;
    expect(o.model).toBe("claude-opus-5-5");
    expect(o.effort).toBe("medium");
    expect(o.settingSources).toEqual(["project"]);
    expect(o.skills).toBeUndefined(); // your Claude skills stay off unless you choose them
    expect(o.includePartialMessages).toBe(true);
    expect(o.maxBudgetUsd).toBe(5);
    expect(o.hooks?.PreToolUse).toHaveLength(1);
  });

  it("maps the stream into valid spans: thinking, text, tools, subagent, compaction", async () => {
    const { events } = await runFake();
    for (const e of events) expect(VisorEvent.safeParse(e).success).toBe(true);
    const tree = new SpanTreeBuilder();
    events.forEach((e) => tree.apply(e));
    const spans = tree.flatten();
    expect(spans.map((s) => s.spanType)).toEqual(expect.arrayContaining(["llm", "thinking", "read", "bash", "subagent", "edit", "compaction"]));
    expect(spans.find((s) => s.spanType === "thinking")?.text).toBe("The test races the refresh.");
    expect(spans.find((s) => s.spanType === "llm" && s.text)?.text).toBe("Let me look.");
    // The subagent's edit nests under the subagent span (via its own model call)
    const sub = spans.find((s) => s.spanType === "subagent")!;
    const edit = spans.find((s) => s.spanType === "edit")!;
    const parentLlm = tree.get(edit.parentSpanId!)!;
    expect(parentLlm.parentSpanId).toBe(sub.spanId);
    expect(edit.diff).toContain("+await a();");
    expect(spans.every((s) => s.status !== "running")).toBe(true);
  });

  it("runs V.I.S.O.R. policy in PreToolUse: allow reads, pause and deny the force-push with steering", async () => {
    const { events, captured } = await runFake();
    expect(of(events, "breakpoint.paused")[0]).toMatchObject({ toolName: "Bash", rule: "destructive-git" });
    const replies = captured.hookReplies as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } }[];
    expect(replies[0]!.hookSpecificOutput.permissionDecision).toBe("allow");
    expect(replies[1]!.hookSpecificOutput).toMatchObject({ permissionDecision: "deny" });
    expect(replies[1]!.hookSpecificOutput.permissionDecisionReason).toContain("Push to a branch instead");
    const pushEnd = of(events, "span.ended").find((e) => e.status === "denied");
    expect(pushEnd?.error).toContain("Push to a branch instead");
  });

  it("delivers each tool span before any breakpoint event about it", async () => {
    const { events } = await runFake();
    for (const [i, e] of events.entries()) {
      if (e.type !== "breakpoint.paused" && e.type !== "breakpoint.resolved") continue;
      const started = events.findIndex((x) => x.type === "span.started" && x.spanId === e.spanId);
      expect(started).toBeGreaterThanOrEqual(0);
      expect(started).toBeLessThan(i);
    }
  });

  it("uses the SDK total as authoritative cost and dedupes repeated usage", async () => {
    const { events } = await runFake();
    expect(of(events, "turn.ended")[0]!.costMicroUsd).toBe(12_300);
    expect(of(events, "session.ended")[0]).toMatchObject({ status: "completed", totalCostMicroUsd: 12_300 });
    const ids = of(events, "usage").map((u) => u.messageId);
    expect(new Set(ids).size).toBe(ids.length); // each message billed once
  });

  it("maps tool names to span types and labels", () => {
    expect(spanTypeFor("mcp__github__create_issue")).toBe("mcp");
    expect(spanTypeFor("Task")).toBe("subagent");
    expect(spanTypeFor("MultiEdit")).toBe("edit");
    expect(spanNameFor("mcp__github__create_issue", {}).name).toBe("github · create_issue");
    expect(spanNameFor("Read", { file_path: "a.ts" })).toEqual({ name: "a.ts", filePath: "a.ts" });
    expect(diffFromInput("Write", { content: "x\ny" })).toBe("@@ -1,0 +1,2 @@\n+x\n+y");
  });
});

describe("persistence and config for Phase 3", () => {
  it("stores the raw stream and replays it exactly from SQLite", async () => {
    const db = openDatabase(":memory:");
    const recorder = new TraceRecorder(db);
    const captured: Captured = { hookReplies: [] };
    const runner = new SessionRunner({ adapter: new ClaudeSdkAdapter({ query: fakeQuery(captured) }), validate: true });
    runner.subscribe((e) => {
      recorder.record(e);
      if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "approved" }));
    });
    const events = await runner.run({ sessionId: "stored", prompt: "x", workspacePath: "/w/acme", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null });
    const store = new TraceStore(db);
    expect(store.events("stored")).toEqual(events);
    expect(store.listSessions()[0]).toMatchObject({ id: "stored", workspacePath: "/w/acme", status: "completed", totalCostMicroUsd: 12_300 });

    const app = createApp({ runner: new SessionRunner({ adapter: new ClaudeSdkAdapter({ query: fakeQuery(captured) }) }), token: "t", workspacePath: "/w/acme", store, info: { runtime: "claude" } });
    const auth = { authorization: "Bearer t" };
    expect(((await (await app.request("/api/sessions", { headers: auth })).json()) as { sessions: unknown[] }).sessions).toHaveLength(1);
    const replay = (await (await app.request("/api/sessions/stored/events", { headers: auth })).json()) as { events: unknown[] };
    expect(replay.events).toHaveLength(events.length);
    expect(await (await app.request("/api/info", { headers: auth })).json()).toMatchObject({ runtime: "claude", workspacePath: "/w/acme" });
    // A real run never starts without a message (it would spend money on nothing)
    const empty = await app.request("/api/sessions", { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ prompt: "  " }) });
    expect(empty.status).toBe(400);
  });

  it("continues a session with a follow-up message, even after a restart", async () => {
    const db = openDatabase(":memory:");
    const record = new TraceRecorder(db);
    const approveAll = (runner: SessionRunner) =>
      runner.subscribe((e) => {
        record.record(e);
        if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "approved" }));
      });
    const first: Captured = { hookReplies: [] };
    const before = new SessionRunner({ adapter: new ClaudeSdkAdapter({ query: fakeQuery(first) }), validate: true });
    approveAll(before);
    await before.run({ sessionId: "chat", prompt: "Build the page", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null });
    expect(first.options?.resume).toBeUndefined();

    // A new daemon (empty memory) gets the follow-up
    const second: Captured = { hookReplies: [] };
    const after = new SessionRunner({ adapter: new ClaudeSdkAdapter({ query: fakeQuery(second) }), validate: true });
    approveAll(after);
    const store = new TraceStore(db);
    const app = createApp({ runner: after, token: "t", workspacePath: "/w", store });
    const res = await app.request("/api/sessions/chat/messages", {
      method: "POST",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Now add a photo" }),
    });
    expect(res.status).toBe(202);
    await expect.poll(() => after.isRunning("chat")).toBe(false);

    // Claude resumes its own conversation, and the log continues in the same session
    expect(second.options?.resume).toBe("sdk");
    const events = store.events("chat");
    expect(events.filter((e) => e.type === "session.started")).toHaveLength(1);
    expect(of(events, "turn.started").map((t) => [t.turnIndex, t.prompt])).toEqual([
      [0, "Build the page"],
      [1, "Now add a photo"],
    ]);
    expect(of(events, "session.ended").map((e) => e.totalCostMicroUsd)).toEqual([12_300, 24_600]);
    expect(store.listSessions()).toHaveLength(1);
    expect(store.listSessions()[0]).toMatchObject({ id: "chat", status: "completed", totalCostMicroUsd: 24_600 });
    // The GUI's replay has both messages
    const replay = (await (await app.request("/api/sessions/chat/events", { headers: { authorization: "Bearer t" } })).json()) as { events: VisorEvent[] };
    expect(of(replay.events, "turn.started")).toHaveLength(2);

    expect((await app.request("/api/sessions/nope/messages", { method: "POST", headers: { authorization: "Bearer t" }, body: JSON.stringify({ prompt: "x" }) })).status).toBe(404);
  });

  it("deletes a session, or every session of a workspace, without touching other data", async () => {
    const db = openDatabase(":memory:");
    const record = new TraceRecorder(db);
    const runner = new SessionRunner({ adapter: new ClaudeSdkAdapter({ query: fakeQuery({ hookReplies: [] }) }) });
    runner.subscribe((e) => {
      record.record(e);
      if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "approved" }));
    });
    const run = (sessionId: string, workspacePath: string) => runner.run({ sessionId, prompt: "x", workspacePath, modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null });
    await run("a1", "/w/site");
    await run("a2", "/w/site");
    await run("b1", "/w/other");
    const store = new TraceStore(db);
    const app = createApp({ runner, token: "t", workspacePath: "/w/site", store });
    const auth = { authorization: "Bearer t" };
    const ids = () => store.listSessions().map((s) => s.id).sort();

    const rename = (id: string, title: string) =>
      app.request(`/api/sessions/${id}`, { method: "PATCH", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ title }) });
    expect((await rename("a2", "  Elon wiki  ")).status).toBe(200);
    expect(store.listSessions().find((s) => s.id === "a2")?.title).toBe("Elon wiki");
    const reopened = (await (await app.request("/api/sessions/b1/events", { headers: auth })).json()) as { events: VisorEvent[] };
    expect(reopened.events[0]).toMatchObject({ type: "session.started", title: "x" });
    runner.forget("a2"); // after a restart the log comes from SQLite, with the new name
    const renamed = (await (await app.request("/api/sessions/a2/events", { headers: auth })).json()) as { events: VisorEvent[] };
    expect(renamed.events[0]).toMatchObject({ type: "session.started", title: "Elon wiki" });
    expect((await rename("a2", "   ")).status).toBe(400);
    expect((await rename("nope", "x")).status).toBe(404);

    expect((await app.request("/api/sessions/a1", { method: "DELETE", headers: auth })).status).toBe(200);
    expect(ids()).toEqual(["a2", "b1"]);
    expect(store.events("a1")).toEqual([]); // its recorded events went with it
    expect(runner.events("a1")).toEqual([]);
    expect((await app.request("/api/sessions/a1", { method: "DELETE", headers: auth })).status).toBe(404);

    const res = await app.request(`/api/workspaces?path=${encodeURIComponent("/w/site")}`, { method: "DELETE", headers: auth });
    expect(await res.json()).toEqual({ deleted: 1 });
    expect(ids()).toEqual(["b1"]);
    expect(store.events("b1").length).toBeGreaterThan(0);
  });

  it("loads your Claude skills only when .visor.json asks for them", async () => {
    const captured: Captured = { hookReplies: [] };
    const runner = new SessionRunner({ adapter: new ClaudeSdkAdapter({ query: fakeQuery(captured), skills: ["vercel:nextjs"] }) });
    runner.subscribe((e) => {
      if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "approved" }));
    });
    await runner.run({ sessionId: "sk", prompt: "x", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null });
    expect(captured.options?.settingSources).toEqual(["user", "project"]);
    expect(captured.options?.skills).toEqual(["vercel:nextjs"]);

    const dir = mkdtempSync(join(tmpdir(), "visor-sk-"));
    writeFileSync(join(dir, ".visor.json"), JSON.stringify({ skills: "all" }));
    expect(loadConfig(dir).config.skills).toBe("all");
  });

  it("keeps live runs opt-in", () => {
    expect(resolveRuntime(undefined, undefined)).toBe("mock");
    expect(resolveRuntime(undefined, "claude")).toBe("claude");
    expect(resolveRuntime("live")).toBe("claude");
    expect(resolveRuntime("anything")).toBe("mock");
  });

  it("loads .visor.json rules, budget and MCP servers, and reports a broken file", () => {
    const dir = mkdtempSync(join(tmpdir(), "visor-cfg-"));
    expect(loadConfig(dir)).toMatchObject({ path: null, error: null, config: { model: "claude-opus-5-5" } });
    writeFileSync(
      join(dir, ".visor.json"),
      JSON.stringify({ effort: "high", budget: { sessionCapUsd: "5" }, breakpoints: [{ rule: "prod", tool: "Bash", match: "deploy" }], mcpServers: { github: { command: "npx" } } }),
    );
    const ok = loadConfig(dir);
    expect(ok.config.effort).toBe("high");
    expect(ok.config.budget.sessionCapUsd).toBe(5_000_000);
    expect(ok.config.breakpoints[0]).toMatchObject({ rule: "prod", action: "pause" });
    expect(Object.keys(ok.config.mcpServers)).toEqual(["github"]);
    writeFileSync(join(dir, ".visor.json"), "{ not json");
    expect(loadConfig(dir).error).toBeTruthy();
  });
});
