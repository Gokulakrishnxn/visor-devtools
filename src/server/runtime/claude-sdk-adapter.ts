import { query as sdkQuery, type HookCallback, type Options, type PreToolUseHookInput, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { ulid } from "ulid";
import type { ContextBreakdown, SpanType, VisorEvent } from "@shared/events";
import { parseUsd } from "@shared/money";
import { EMPTY_USAGE, type TokenUsage } from "@shared/pricing";
import { computeCost, UsageLedger } from "../telemetry/cost";
import { emptyBreakdown } from "../telemetry/context";
import { PricingRegistry } from "../telemetry/pricing";
import type { AgentRuntimeAdapter, RunOptions, RuntimeHooks } from "./adapter";

/** The slice of the SDK's `query()` we use; injectable so tests never call the API. */
export type QueryFn = (params: { prompt: string; options?: Options }) => AsyncIterable<SDKMessage>;

export type ClaudeSdkAdapterOptions = {
  query?: QueryFn;
  pricing?: PricingRegistry;
  /** MCP servers from `.visor.json`, passed straight to the SDK. */
  mcpServers?: Options["mcpServers"];
  now?: () => number;
  newId?: () => string;
};

// ---------------------------------------------------------------- helpers

/** Maps an SDK tool name to a span type. */
export function spanTypeFor(tool: string): Exclude<SpanType, "llm" | "thinking" | "compaction" | "override"> {
  if (tool === "Task" || tool === "Agent") return "subagent";
  if (tool.startsWith("mcp__")) return "mcp";
  if (["Edit", "MultiEdit", "Write", "NotebookEdit"].includes(tool)) return "edit";
  if (["Bash", "BashOutput", "KillShell", "KillBash"].includes(tool)) return "bash";
  if (["Read", "Grep", "Glob", "LS", "WebFetch", "WebSearch"].includes(tool)) return "read";
  return "mcp";
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** A short human label for the step list. */
export function spanNameFor(tool: string, input: Record<string, unknown>): { name: string; filePath?: string } {
  const file = str(input.file_path) ?? str(input.notebook_path) ?? str(input.path);
  if (tool.startsWith("mcp__")) {
    const [, server = "mcp", ...rest] = tool.split("__");
    return { name: `${server} · ${rest.join("__") || "call"}` };
  }
  if (tool === "Task" || tool === "Agent") return { name: str(input.subagent_type) ?? str(input.description) ?? "subagent" };
  if (tool === "Bash") return { name: str(input.command)?.split("\n")[0] ?? "bash" };
  if (tool === "Grep" || tool === "Glob") return { name: str(input.pattern) ?? tool };
  if (tool === "WebFetch") return { name: str(input.url) ?? tool };
  if (tool === "WebSearch") return { name: str(input.query) ?? tool };
  return { name: file ?? tool, filePath: file };
}

/** A unified diff for Edit / MultiEdit / Write inputs, so every edit renders in Review. */
export function diffFromInput(tool: string, input: Record<string, unknown>): string | undefined {
  const lines = (s: string) => (s === "" ? [] : s.split("\n"));
  const hunk = (oldText: string, newText: string) => {
    const a = lines(oldText);
    const b = lines(newText);
    return [`@@ -1,${a.length} +1,${b.length} @@`, ...a.map((l) => `-${l}`), ...b.map((l) => `+${l}`)].join("\n");
  };
  if (tool === "Edit") return hunk(str(input.old_string) ?? "", str(input.new_string) ?? "");
  if (tool === "Write") return hunk("", str(input.content) ?? "");
  if (tool === "MultiEdit" && Array.isArray(input.edits)) {
    return (input.edits as { old_string?: string; new_string?: string }[]).map((e) => hunk(e.old_string ?? "", e.new_string ?? "")).join("\n");
  }
  return undefined;
}

function toUsage(u: Record<string, unknown> | undefined): TokenUsage {
  const n = (k: string) => (typeof u?.[k] === "number" ? (u[k] as number) : 0);
  const creation = u?.cache_creation as Record<string, number> | undefined;
  const w1h = creation?.ephemeral_1h_input_tokens ?? 0;
  const totalWrite = n("cache_creation_input_tokens");
  return {
    inputTokens: n("input_tokens"),
    cacheWrite5mTokens: Math.max(0, totalWrite - w1h),
    cacheWrite1hTokens: w1h,
    cacheReadTokens: n("cache_read_input_tokens"),
    outputTokens: n("output_tokens"),
  };
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b) => (b && typeof b === "object" && "text" in b ? String((b as { text: unknown }).text) : "")).join("");
  return "";
}

/** A tiny push/pull channel: SDK messages and hook callbacks both produce events. */
class Channel<T> {
  private items: T[] = [];
  private waiting: ((v: IteratorResult<T>) => void) | null = null;
  private drainers: (() => void)[] = [];
  private closed = false;
  /** Resolves once every queued item has been taken and handled by the consumer. */
  drained(): Promise<void> {
    if (this.closed || (this.items.length === 0 && this.waiting)) return Promise.resolve();
    return new Promise((res) => this.drainers.push(res));
  }
  push(item: T) {
    if (this.closed) return;
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      w({ value: item, done: false });
    } else this.items.push(item);
  }
  close() {
    this.closed = true;
    this.drainers.splice(0).forEach((d) => d());
    this.waiting?.({ value: undefined as never, done: true });
    this.waiting = null;
  }
  async *[Symbol.asyncIterator]() {
    for (;;) {
      if (this.items.length) yield this.items.shift()!;
      else if (this.closed) return;
      else {
        // Asking for more means everything before was handled downstream
        const r = await new Promise<IteratorResult<T>>((res) => {
          this.waiting = res;
          this.drainers.splice(0).forEach((d) => d());
        });
        if (r.done) return;
        yield r.value;
      }
    }
  }
}

// ---------------------------------------------------------------- adapter

type Llm = { spanId: string; messageId: string; usage: TokenUsage; thinkingSpanId?: string; streamed: boolean; closed: boolean };

/**
 * Layer 3, real runs: wraps `@anthropic-ai/claude-agent-sdk` and translates its
 * message stream into VisorEvents. Every tool call goes through V.I.S.O.R.'s
 * PreToolUse hook first (policy → breakpoint → allow / edit / deny), so the
 * harness's rules run before any permission setting can let a call through.
 */
export class ClaudeSdkAdapter implements AgentRuntimeAdapter {
  readonly name = "claude";
  private readonly queryFn: QueryFn;
  private readonly pricing: PricingRegistry;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private readonly opts: ClaudeSdkAdapterOptions = {}) {
    this.queryFn = opts.query ?? (sdkQuery as unknown as QueryFn);
    this.pricing = opts.pricing ?? new PricingRegistry();
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? ulid;
  }

  async *run(options: RunOptions, hooks: RuntimeHooks): AsyncGenerator<VisorEvent> {
    const { sessionId, modelId } = options;
    const out = new Channel<VisorEvent>();
    const emit = (e: VisorEvent) => out.push(e);
    const turnId = this.newId();
    const ledger = new UsageLedger();
    const controller = new AbortController();
    hooks.signal.addEventListener("abort", () => controller.abort(), { once: true });

    // tool_use_id → what we know about each tool call
    const toolCalls = new Map<string, { name: string; input: Record<string, unknown>; parentSpanId: string | null; spanId?: string; edited?: boolean }>();
    // parent_tool_use_id (a Task call) → its subagent span
    const subagentSpan = (parentToolUseId: string | null) => (parentToolUseId ? (toolCalls.get(parentToolUseId)?.spanId ?? null) : null);
    const llms = new Map<string, Llm>(); // every model call, by message id
    // The streaming model call per agent (null = main agent, else its Task tool_use id)
    const streaming = new Map<string | null, Llm>();
    const context: ContextBreakdown = emptyBreakdown();
    let lastPromptTokens = 0;
    let finished = false;

    emit({
      type: "session.started",
      sessionId,
      title: options.title ?? (options.prompt.slice(0, 60) || "New session"),
      workspacePath: options.workspacePath,
      modelId,
      effort: options.effort,
      budgetCapMicroUsd: options.budgetCapMicroUsd,
      at: this.now(),
    });
    emit({ type: "turn.started", sessionId, turnId, turnIndex: 0, prompt: options.prompt, at: this.now() });
    context.messages += Math.ceil(options.prompt.length / 4);

    const openLlm = (messageId: string, parentToolUseId: string | null, usage?: TokenUsage): Llm => {
      let llm = llms.get(messageId);
      if (!llm) {
        llm = { spanId: this.newId(), messageId, usage: usage ?? EMPTY_USAGE, streamed: false, closed: false };
        llms.set(messageId, llm);
        emit({ type: "span.started", sessionId, turnId, spanId: llm.spanId, parentSpanId: subagentSpan(parentToolUseId), spanType: "llm", name: modelId, at: this.now() });
      } else if (usage && !llm.closed) llm.usage = usage;
      return llm;
    };

    const closeThinking = (llm: Llm) => {
      if (!llm.thinkingSpanId) return;
      emit({ type: "span.ended", sessionId, spanId: llm.thinkingSpanId, status: "ok", costMicroUsd: 0, at: this.now() });
      llm.thinkingSpanId = undefined;
    };

    const closeLlm = (llm: Llm) => {
      if (llm.closed) return;
      closeThinking(llm);
      llm.closed = true;
      const counted = ledger.add(llm.messageId, modelId, llm.usage);
      emit({ type: "usage", sessionId, turnId, spanId: llm.spanId, messageId: llm.messageId, modelId, usage: llm.usage, at: this.now() });
      lastPromptTokens = llm.usage.inputTokens + llm.usage.cacheReadTokens + llm.usage.cacheWrite5mTokens + llm.usage.cacheWrite1hTokens;
      const cost = counted ? computeCost(llm.usage, this.pricing.get(modelId)).total : 0;
      emit({ type: "span.ended", sessionId, spanId: llm.spanId, status: "ok", costMicroUsd: cost, at: this.now() });
    };

    // PreToolUse: every tool call starts a span here, then the harness decides.
    const preToolUse: HookCallback = async (input) => {
      const h = input as PreToolUseHookInput;
      const toolInput = (h.tool_input ?? {}) as Record<string, unknown>;
      const known = toolCalls.get(h.tool_use_id);
      const call = known ?? { name: h.tool_name, input: toolInput, parentSpanId: null };
      const spanId = this.newId();
      call.spanId = spanId;
      toolCalls.set(h.tool_use_id, call);
      // Tools only run after their model call finished writing
      for (const llm of llms.values()) if (llm.spanId === call.parentSpanId) closeLlm(llm);
      const { name, filePath } = spanNameFor(h.tool_name, toolInput);
      emit({ type: "span.started", sessionId, turnId, spanId, parentSpanId: call.parentSpanId, spanType: spanTypeFor(h.tool_name), name, filePath, input: toolInput, at: this.now() });

      // Listeners must see this span before any breakpoint event about it
      await out.drained();
      const verdict = await hooks.onToolUse({ sessionId, turnId, spanId, toolName: h.tool_name, input: toolInput });
      if (verdict.decision === "approved" || verdict.decision === "edited") {
        if (verdict.decision === "edited") {
          call.input = verdict.input;
          call.edited = true;
        }
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            permissionDecisionReason: verdict.decision === "edited" ? "Edited by the V.I.S.O.R. operator" : "Allowed by V.I.S.O.R. policy",
            ...(verdict.decision === "edited" ? { updatedInput: verdict.input } : {}),
          },
        };
      }
      const reason = verdict.decision === "auto_blocked" ? `Blocked by V.I.S.O.R. rule "${verdict.rule}".` : `The operator denied this call.${verdict.note ? ` Steering: ${verdict.note}` : ""}`;
      emit({ type: "span.ended", sessionId, spanId, status: "denied", error: reason, costMicroUsd: 0, at: this.now() });
      call.spanId = undefined; // already ended; ignore its tool_result
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
    };

    const handle = (m: SDKMessage) => {
      switch (m.type) {
        case "stream_event": {
          const ev = m.event as unknown as Record<string, unknown> & { type: string };
          if (ev.type === "message_start") {
            const msg = ev.message as { id: string; usage?: Record<string, unknown> };
            const llm = openLlm(msg.id, m.parent_tool_use_id, toUsage(msg.usage));
            llm.streamed = true;
            streaming.set(m.parent_tool_use_id, llm);
            return;
          }
          const llm = streaming.get(m.parent_tool_use_id);
          if (!llm || llm.closed) return;
          if (ev.type === "content_block_start") {
            const block = ev.content_block as { type: string };
            if (block.type === "thinking" && !llm.thinkingSpanId) {
              llm.thinkingSpanId = this.newId();
              emit({ type: "span.started", sessionId, turnId, spanId: llm.thinkingSpanId, parentSpanId: llm.spanId, spanType: "thinking", name: "Thinking", at: this.now() });
            }
          } else if (ev.type === "content_block_delta") {
            const delta = ev.delta as { type: string; thinking?: string; text?: string };
            if (delta.type === "thinking_delta" && llm.thinkingSpanId && delta.thinking) {
              emit({ type: "span.delta", sessionId, spanId: llm.thinkingSpanId, text: delta.thinking, at: this.now() });
              context.thinking += Math.ceil(delta.thinking.length / 4);
            } else if (delta.type === "text_delta" && delta.text) {
              closeThinking(llm);
              emit({ type: "span.delta", sessionId, spanId: llm.spanId, text: delta.text, at: this.now() });
              context.messages += Math.ceil(delta.text.length / 4);
            }
          } else if (ev.type === "message_delta") {
            const u = ev.usage as Record<string, unknown> | undefined;
            if (u && typeof u.output_tokens === "number") llm.usage = { ...llm.usage, outputTokens: u.output_tokens };
          } else if (ev.type === "message_stop") {
            closeLlm(llm);
            streaming.delete(m.parent_tool_use_id);
          }
          return;
        }
        case "assistant": {
          const msg = m.message as unknown as { id: string; usage?: Record<string, unknown>; content: { type: string; id?: string; name?: string; input?: unknown; text?: string; thinking?: string }[] };
          // Without partial messages, complete assistant messages carry everything
          const llm = openLlm(msg.id, m.parent_tool_use_id, msg.usage ? toUsage(msg.usage) : undefined);
          const streamed = llm.streamed;
          for (const block of msg.content) {
            if (block.type === "tool_use" && block.id) {
              toolCalls.set(block.id, { name: block.name ?? "tool", input: (block.input ?? {}) as Record<string, unknown>, parentSpanId: llm.spanId });
            } else if (!streamed && block.type === "text" && block.text) {
              emit({ type: "span.delta", sessionId, spanId: llm.spanId, text: block.text, at: this.now() });
            } else if (!streamed && block.type === "thinking" && block.thinking) {
              const id = this.newId();
              emit({ type: "span.started", sessionId, turnId, spanId: id, parentSpanId: llm.spanId, spanType: "thinking", name: "Thinking", at: this.now() });
              emit({ type: "span.delta", sessionId, spanId: id, text: block.thinking, at: this.now() });
              emit({ type: "span.ended", sessionId, spanId: id, status: "ok", costMicroUsd: 0, at: this.now() });
            }
          }
          return;
        }
        case "user": {
          const content = (m.message as { content?: unknown }).content;
          if (!Array.isArray(content)) return;
          for (const block of content as { type: string; tool_use_id?: string; content?: unknown; is_error?: boolean }[]) {
            if (block.type !== "tool_result" || !block.tool_use_id) continue;
            const call = toolCalls.get(block.tool_use_id);
            if (!call?.spanId) continue;
            const text = resultText(block.content);
            context.toolResults += Math.ceil(text.length / 4);
            const spanType = spanTypeFor(call.name);
            if (spanType === "subagent") context.subagents += Math.ceil(text.length / 4);
            if (spanType === "bash" && text) emit({ type: "span.delta", sessionId, spanId: call.spanId, text, at: this.now() });
            emit({
              type: "span.ended",
              sessionId,
              spanId: call.spanId,
              status: block.is_error ? "error" : call.edited ? "edited" : "ok",
              output: m.tool_use_result ?? text,
              diff: spanType === "edit" ? diffFromInput(call.name, call.input) : undefined,
              error: block.is_error ? text.slice(0, 500) : undefined,
              costMicroUsd: 0,
              at: this.now(),
            });
            if (spanType !== "subagent") call.spanId = undefined;
          }
          return;
        }
        case "system": {
          if (m.subtype === "compact_boundary") {
            const meta = (m as unknown as { compact_metadata: { pre_tokens: number; post_tokens?: number } }).compact_metadata;
            const spanId = this.newId();
            emit({ type: "span.started", sessionId, turnId, spanId, parentSpanId: null, spanType: "compaction", name: "Auto-compact", at: this.now() });
            emit({
              type: "span.ended",
              sessionId,
              spanId,
              status: "ok",
              output: { beforeTokens: meta.pre_tokens, afterTokens: meta.post_tokens ?? 0 },
              costMicroUsd: 0,
              at: this.now(),
            });
          }
          return;
        }
        case "result": {
          for (const llm of llms.values()) closeLlm(llm);
          for (const call of toolCalls.values()) {
            if (call.spanId) emit({ type: "span.ended", sessionId, spanId: call.spanId, status: "ok", costMicroUsd: 0, at: this.now() });
            call.spanId = undefined;
          }
          const computed = ledger.cost((id) => this.pricing.get(this.pricing.has(id) ? id : modelId));
          // The SDK's total is authoritative (PRD invariant 3); converted once via its decimal text
          const authoritative = typeof m.total_cost_usd === "number" ? parseUsd(m.total_cost_usd.toFixed(6)) : computed.total;
          const price = this.pricing.get(modelId);
          const used = Object.values(context).reduce((a, b) => a + b, 0);
          // Whatever the SDK sent that we can't attribute (rules, tool schemas) shows as project rules + schemas
          const unattributed = Math.max(0, lastPromptTokens - used);
          const breakdown: ContextBreakdown = { ...context, toolSchemas: context.toolSchemas + Math.round(unattributed * 0.7), projectRules: context.projectRules + Math.round(unattributed * 0.3) };
          emit({
            type: "turn.ended",
            sessionId,
            turnId,
            costMicroUsd: authoritative,
            computedCostMicroUsd: computed.total,
            cacheSavingsMicroUsd: computed.cacheSavings,
            contextUsedTokens: Object.values(breakdown).reduce((a, b) => a + b, 0),
            contextLimitTokens: price.contextWindow,
            contextBreakdown: breakdown,
            at: this.now(),
          });
          const status = m.subtype === "success" ? "completed" : m.subtype === "error_max_budget_usd" ? "aborted_budget" : hooks.signal.aborted ? "aborted_budget" : "error";
          emit({ type: "session.ended", sessionId, status, totalCostMicroUsd: authoritative, at: this.now() });
          finished = true;
          return;
        }
        default:
          return;
      }
    };

    const sdkOptions: Options = {
      model: modelId,
      effort: options.effort,
      cwd: options.workspacePath,
      abortController: controller,
      // Isolation: no user/local settings; project settings load CLAUDE.md
      settingSources: ["project"],
      includePartialMessages: true,
      thinking: { type: "adaptive", display: "summarized" } as Options["thinking"],
      permissionMode: "default",
      // The PreToolUse hook already decided; allow anything that reaches the prompt
      canUseTool: async (_name, input) => ({ behavior: "allow", updatedInput: input }),
      hooks: { PreToolUse: [{ hooks: [preToolUse], onFailure: "block" }] },
      ...(options.budgetCapMicroUsd !== null ? { maxBudgetUsd: options.budgetCapMicroUsd / 1_000_000 } : {}),
      ...(this.opts.mcpServers ? { mcpServers: this.opts.mcpServers } : {}),
    };

    const pump = (async () => {
      try {
        for await (const m of this.queryFn({ prompt: options.prompt, options: sdkOptions })) handle(m);
      } catch (err) {
        if (!finished) {
          for (const llm of llms.values()) closeLlm(llm);
          const total = ledger.cost((id) => this.pricing.get(this.pricing.has(id) ? id : modelId)).total;
          emit({ type: "session.ended", sessionId, status: hooks.signal.aborted ? "aborted_budget" : "error", totalCostMicroUsd: total, at: this.now() });
          finished = true;
          if (!hooks.signal.aborted) console.error("[visor] Claude Agent SDK run failed:", err);
        }
      } finally {
        if (!finished) {
          const total = ledger.cost((id) => this.pricing.get(this.pricing.has(id) ? id : modelId)).total;
          emit({ type: "session.ended", sessionId, status: hooks.signal.aborted ? "aborted_budget" : "error", totalCostMicroUsd: total, at: this.now() });
        }
        out.close();
      }
    })();

    yield* out;
    await pump;
  }
}
