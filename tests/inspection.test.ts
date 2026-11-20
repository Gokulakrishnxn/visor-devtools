import type { HookCallback, Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import type { VisorEvent, VisorEventOf } from "@shared/events";
import { createApp } from "@server/app";
import { openDatabase } from "@server/db/client";
import { snippetAround, TraceStore } from "@server/db/queries";
import { TraceRecorder } from "@server/db/recorder";
import { ClaudeSdkAdapter, mapContextUsage, type QueryFn, type SdkContextUsage } from "@server/runtime/claude-sdk-adapter";
import { MockRuntimeAdapter } from "@server/runtime/mock-adapter";
import { SessionRunner } from "@server/runtime/session-runner";
import { emptyBreakdown } from "@server/telemetry/context";
import { deriveTrace } from "@/lib/trace-model";

const of = <T extends VisorEvent["type"]>(events: VisorEvent[], type: T) => events.filter((e): e is VisorEventOf<T> => e.type === type);

const REPORT: SdkContextUsage = {
  totalTokens: 31_000,
  rawMaxTokens: 200_000,
  categories: [
    { id: "system_prompt", name: "System prompt", tokens: 3_000, kind: "used" },
    { id: "memory_files", name: "Memory files", tokens: 1_000, kind: "used" },
    { id: "system_tools", name: "System tools", tokens: 12_000, kind: "used" },
    { id: "mcp_tools", name: "MCP tools", tokens: 2_000, kind: "used" },
    { id: "mcp_tools_deferred", name: "MCP tools (deferred)", tokens: 9_999, kind: "deferred" },
    { id: "messages", name: "Messages", tokens: 13_001, kind: "used" },
    { id: "free_space", name: "Free space", tokens: 150_000, kind: "free" },
    { id: "autocompact_buffer", name: "Autocompact buffer", tokens: 19_000, kind: "buffer" },
  ],
  mcpTools: [{ name: "mcp__github__search_code", serverName: "github", tokens: 2_000, isLoaded: true }],
  memoryFiles: [{ path: "/w/CLAUDE.md", type: "Project", tokens: 1_000 }],
  agents: [{ agentType: "reviewer", source: "projectSettings", tokens: 300 }],
  skills: { skillFrontmatter: [{ name: "nextjs", source: "plugin", pluginName: "vercel", tokens: 120 }] },
};

describe("real context from the SDK", () => {
  it("maps the SDK report onto the 7 categories, keeping the total exact", () => {
    const tracked = { ...emptyBreakdown(), toolResults: 600, thinking: 300, messages: 100 };
    const { breakdown, limit } = mapContextUsage(REPORT, tracked);
    expect(limit).toBe(200_000);
    expect(breakdown.projectRules).toBe(4_000); // system prompt + CLAUDE.md
    expect(breakdown.toolSchemas).toBe(14_000); // deferred schemas excluded
    expect(breakdown.toolResults + breakdown.thinking + breakdown.messages + breakdown.subagents + breakdown.mentionedFiles).toBe(13_001);
    expect(breakdown.toolResults).toBe(7_800); // 60% of messages
    expect(Object.values(breakdown).reduce((a, b) => a + b, 0)).toBe(31_001);
  });

  it("puts all messages in one bucket when nothing was tracked", () => {
    expect(mapContextUsage(REPORT, emptyBreakdown()).breakdown.messages).toBe(13_001);
  });

  it("asks the SDK for context at the end of a turn and uses real thinking counts", async () => {
    let asked = 0;
    const query: QueryFn = ({ options }: { options?: Options }) => {
      const gen = (async function* () {
        const ev = (event: unknown) => ({ type: "stream_event", event, parent_tool_use_id: null, uuid: "u", session_id: "s" }) as unknown as SDKMessage;
        yield ev({ type: "message_start", message: { id: "m1", usage: { input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 } } });
        yield ev({ type: "content_block_start", index: 0, content_block: { type: "thinking" } });
        yield ev({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Short summary." } });
        yield { type: "system", subtype: "thinking_tokens", estimated_tokens: 900, estimated_tokens_delta: 900, uuid: "u", session_id: "s" } as unknown as SDKMessage;
        yield ev({ type: "message_stop" });
        void (options?.hooks?.PreToolUse?.[0]?.hooks[0] as HookCallback | undefined);
        yield { type: "result", subtype: "success", total_cost_usd: 0.001, is_error: false, num_turns: 1, result: "", usage: {}, modelUsage: {}, uuid: "u", session_id: "s" } as unknown as SDKMessage;
      })();
      return Object.assign(gen, {
        getContextUsage: async () => {
          asked++;
          return REPORT;
        },
      });
    };
    const runner = new SessionRunner({ adapter: new ClaudeSdkAdapter({ query }), validate: true });
    const events = await runner.run({ sessionId: "ctx", prompt: "hi", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null });
    const turn = of(events, "turn.ended")[0]!;
    expect(asked).toBe(1);
    expect(turn.contextLimitTokens).toBe(200_000);
    expect(turn.contextBreakdown.projectRules).toBe(4_000);
    expect(turn.contextUsedTokens).toBe(31_001);
    // The full report is kept for the Claude-style Context panel
    expect(turn.contextDetail?.categories).toHaveLength(8);
    expect(turn.contextDetail).toMatchObject({
      mcpTools: [{ name: "mcp__github__search_code", server: "github", tokens: 2_000, loaded: true }],
      memoryFiles: [{ path: "/w/CLAUDE.md", type: "Project" }],
      agents: [{ name: "reviewer", source: "projectSettings" }],
      skills: [{ name: "nextjs", plugin: "vercel", tokens: 120 }],
    });
    expect(deriveTrace(events).contextDetail?.skills[0]?.name).toBe("nextjs");
  });
});

describe("per-agent rollups", () => {
  it("splits steps, model calls, tokens and cost between the main agent and the subagent", async () => {
    const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }), validate: true });
    runner.subscribe((e) => {
      if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "approved" }));
    });
    const m = deriveTrace(await runner.run({ sessionId: "ag", prompt: "", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null }));
    const [main, explore] = m.agents;
    expect(m.agents).toHaveLength(2);
    expect(main).toMatchObject({ spanId: null, name: "Main agent" });
    expect(explore).toMatchObject({ name: "explore", steps: 1, modelCalls: 1, status: "ok" });
    expect(explore!.tokens).toBeGreaterThan(0);
    expect(main!.costMicroUsd + explore!.costMicroUsd).toBe(m.cost.total);
  });
});

describe("search across sessions", () => {
  async function store() {
    const db = openDatabase(":memory:");
    const recorder = new TraceRecorder(db);
    const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }), validate: true });
    runner.subscribe((e) => {
      recorder.record(e);
      if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "approved" }));
    });
    await runner.run({ sessionId: "s-auth", prompt: "Fix the flaky auth test", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null });
    return { s: new TraceStore(db), runner };
  }

  it("finds thinking text, file paths, outputs and prompts", async () => {
    const { s } = await store();
    const thinking = s.search("smells like a race");
    expect(thinking[0]).toMatchObject({ sessionId: "s-auth", kind: "thinking" });
    expect(thinking[0]!.snippet).toContain("smells like a race");
    expect(s.search("session.test.ts").some((h) => h.kind === "read" || h.kind === "edit")).toBe(true);
    const bash = s.search("50 passed").find((h) => h.kind === "bash")!;
    expect(bash.snippet).not.toContain("\\n"); // decoded, not raw JSON escapes
    expect(s.search("flaky auth").some((h) => h.kind === "prompt")).toBe(true);
  });

  it("treats % and _ literally and ignores very short queries", async () => {
    const { s } = await store();
    expect(s.search("%")).toEqual([]);
    expect(s.search("%%")).toEqual([]);
    expect(s.search("__")).toEqual([]);
    expect(s.search("zzz-not-there")).toEqual([]);
  });

  it("serves search over the API", async () => {
    const { s, runner } = await store();
    const app = createApp({ runner, token: "t", workspacePath: "/w", store: s });
    const res = (await (await app.request("/api/search?q=refreshToken", { headers: { authorization: "Bearer t" } })).json()) as { hits: { sessionTitle: string }[] };
    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits[0]!.sessionTitle).toBe("Fix the flaky auth test");
  });

  it("cuts a readable snippet around the match", () => {
    const text = `${"a ".repeat(100)}needle here${" b".repeat(100)}`;
    const snip = snippetAround(text, "needle", 40);
    expect(snip).toContain("needle");
    expect(snip.startsWith("…") && snip.endsWith("…")).toBe(true);
  });
});
