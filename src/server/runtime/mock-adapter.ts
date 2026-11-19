import { ulid } from "ulid";
import type { ContextBreakdown, VisorEvent } from "@shared/events";
import { computeCost, UsageLedger } from "../telemetry/cost";
import { emptyBreakdown } from "../telemetry/context";
import { PricingRegistry } from "../telemetry/pricing";
import type { AgentRuntimeAdapter, RunOptions, RuntimeHooks } from "./adapter";
import { FIX_FLAKY_AUTH, type LlmStep, type Scenario, type SubagentStep, type ToolStep } from "./scenarios/fix-flaky-auth";

export type MockRuntimeOptions = {
  scenario?: Scenario;
  /** Multiplies every simulated delay. 0 runs instantly (tests), 1 is real time. */
  speed?: number;
  pricing?: PricingRegistry;
  /** Clock for timestamps; tests pass a counter for deterministic output. */
  now?: () => number;
  /** ID generator; tests pass a counter for deterministic output. */
  newId?: () => string;
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/** Splits text into word-sized chunks for streamed thinking. */
const chunks = (text: string) => text.match(/\S+\s*/g) ?? [];

/**
 * Deterministic, zero-cost runtime (PRD invariant 4). It replays a realistic
 * scenario as a VisorEvent stream: thinking, reads, an edit with a diff, an
 * MCP call inside a subagent, and a risky Bash command that hits a breakpoint.
 * It never touches the network.
 */
export class MockRuntimeAdapter implements AgentRuntimeAdapter {
  readonly name = "mock";
  private readonly scenario: Scenario;
  private readonly speed: number;
  private readonly pricing: PricingRegistry;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(opts: MockRuntimeOptions = {}) {
    this.scenario = opts.scenario ?? FIX_FLAKY_AUTH;
    this.speed = opts.speed ?? 1;
    this.pricing = opts.pricing ?? new PricingRegistry();
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? ulid;
  }

  async *run(options: RunOptions, hooks: RuntimeHooks): AsyncGenerator<VisorEvent> {
    const { sessionId, modelId } = options;
    const sc = this.scenario;
    const price = this.pricing.get(modelId);
    // Reassigned per turn; the nested generators read the current values
    let ledger = new UsageLedger();
    let turnId = "";
    let sessionCost = 0;
    const wait = (ms: number) => sleep(ms * this.speed, hooks.signal);
    let context: ContextBreakdown = { ...emptyBreakdown(), ...sc.contextBase };

    yield {
      type: "session.started",
      sessionId,
      title: options.title ?? (options.prompt ? options.prompt.slice(0, 60) : sc.title),
      workspacePath: options.workspacePath,
      modelId,
      effort: options.effort,
      budgetCapMicroUsd: options.budgetCapMicroUsd,
      at: this.now(),
    };

    // Nested generators below need the adapter's clock and ID source
    const self = { now: this.now, newId: this.newId };

    async function* runTool(step: ToolStep, parentSpanId: string): AsyncGenerator<VisorEvent> {
      const spanId = self.newId();
      yield {
        type: "span.started",
        sessionId,
        turnId,
        spanId,
        parentSpanId,
        spanType: step.spanType,
        name: step.name,
        filePath: step.filePath,
        input: step.input,
        at: self.now(),
      };
      const verdict = await hooks.onToolUse({ sessionId, turnId, spanId, toolName: step.tool, input: step.input });
      if (verdict.decision === "denied" || verdict.decision === "auto_blocked") {
        const error =
          verdict.decision === "auto_blocked" ? `Blocked by rule: ${verdict.rule}` : `Denied by operator${verdict.note ? `: ${verdict.note}` : ""}`;
        yield { type: "span.ended", sessionId, spanId, status: "denied", error, costMicroUsd: 0, at: self.now() };
        if (step.onDenied && !hooks.signal.aborted) yield* runTool(step.onDenied, parentSpanId);
        return;
      }
      await wait(step.ms);
      if (step.spanType === "bash" && typeof step.output === "string") {
        for (const line of step.output.split("\n")) yield { type: "span.delta", sessionId, spanId, text: `${line}\n`, at: self.now() };
      }
      context = { ...context, toolResults: context.toolResults + step.resultTokens };
      yield {
        type: "span.ended",
        sessionId,
        spanId,
        status: verdict.decision === "edited" ? "edited" : "ok",
        output: verdict.decision === "edited" ? { ranWith: verdict.input, result: step.output } : step.output,
        diff: step.diff,
        costMicroUsd: 0,
        at: self.now(),
      };
    }

    async function* runLlm(step: LlmStep, parentSpanId: string | null, inSubagent: boolean): AsyncGenerator<VisorEvent> {
      const spanId = self.newId();
      yield { type: "span.started", sessionId, turnId, spanId, parentSpanId, spanType: "llm", name: modelId, at: self.now() };
      const counted = ledger.add(step.messageId, modelId, step.usage);
      yield { type: "usage", sessionId, turnId, spanId, messageId: step.messageId, modelId, usage: step.usage, at: self.now() };
      if (step.duplicateUsage) {
        // The SDK re-reports usage for parallel tool calls in the same message
        yield { type: "usage", sessionId, turnId, spanId, messageId: step.messageId, modelId, usage: step.usage, at: self.now() };
      }
      if (step.thinking) {
        const thinkId = self.newId();
        yield { type: "span.started", sessionId, turnId, spanId: thinkId, parentSpanId: spanId, spanType: "thinking", name: "Thinking", at: self.now() };
        const words = chunks(step.thinking);
        for (const w of words) {
          await wait(step.ms / Math.max(1, words.length));
          if (hooks.signal.aborted) break;
          yield { type: "span.delta", sessionId, spanId: thinkId, text: w, at: self.now() };
        }
        const thinkingTokens = Math.ceil(step.thinking.length / 4);
        context = inSubagent ? context : { ...context, thinking: context.thinking + thinkingTokens };
        yield { type: "span.ended", sessionId, spanId: thinkId, status: "ok", costMicroUsd: 0, at: self.now() };
      } else {
        await wait(step.ms);
      }
      if (step.text) {
        yield { type: "span.delta", sessionId, spanId, text: step.text, at: self.now() };
        context = { ...context, messages: context.messages + Math.ceil(step.text.length / 4) };
      }
      const cost = counted ? computeCost(step.usage, price).total : 0;
      yield { type: "span.ended", sessionId, spanId, status: "ok", output: step.text, costMicroUsd: cost, at: self.now() };
      for (const tool of step.tools ?? []) {
        if (hooks.signal.aborted) return;
        yield* runTool(tool, spanId);
      }
    }

    async function* runSubagent(step: SubagentStep): AsyncGenerator<VisorEvent> {
      const spanId = self.newId();
      yield {
        type: "span.started",
        sessionId,
        turnId,
        spanId,
        parentSpanId: null,
        spanType: "subagent",
        name: step.name,
        input: { prompt: step.prompt },
        at: self.now(),
      };
      for (const s of step.steps) {
        if (hooks.signal.aborted) break;
        yield* runLlm(s, spanId, true);
      }
      context = { ...context, subagents: context.subagents + step.handoffTokens };
      yield { type: "span.ended", sessionId, spanId, status: "ok", costMicroUsd: 0, at: self.now() };
    }

    for (const [turnIndex, turn] of sc.turns.entries()) {
      if (hooks.signal.aborted) break;
      ledger = new UsageLedger();
      turnId = this.newId();
      const prompt = turnIndex === 0 && options.prompt ? options.prompt : turn.prompt;
      yield { type: "turn.started", sessionId, turnId, turnIndex, prompt, at: this.now() };
      context = { ...context, messages: context.messages + Math.ceil(prompt.length / 4) };

      for (const step of turn.steps) {
        if (hooks.signal.aborted) break;
        if (step.kind === "llm") yield* runLlm(step, null, false);
        else if (step.kind === "subagent") yield* runSubagent(step);
        else {
          const spanId = this.newId();
          const before = Object.values(context).reduce((n, v) => n + v, 0);
          yield { type: "span.started", sessionId, turnId, spanId, parentSpanId: null, spanType: "compaction", name: "Auto-compact", at: this.now() };
          await wait(step.ms);
          const dropped = Math.min(step.droppedTokens, context.toolResults);
          context = { ...context, toolResults: context.toolResults - dropped, messages: context.messages + step.summaryTokens };
          const after = Object.values(context).reduce((n, v) => n + v, 0);
          yield {
            type: "span.ended",
            sessionId,
            spanId,
            status: "ok",
            output: { beforeTokens: before, afterTokens: after, droppedToolResultTokens: dropped, summaryTokens: step.summaryTokens },
            costMicroUsd: 0,
            at: this.now(),
          };
        }
      }

      const cost = ledger.cost((id) => this.pricing.get(id));
      sessionCost += cost.total;
      yield {
        type: "turn.ended",
        sessionId,
        turnId,
        costMicroUsd: cost.total,
        cacheSavingsMicroUsd: cost.cacheSavings,
        contextUsedTokens: Object.values(context).reduce((n, v) => n + v, 0),
        contextLimitTokens: price.contextWindow,
        contextBreakdown: context,
        at: this.now(),
      };
    }

    yield {
      type: "session.ended",
      sessionId,
      status: hooks.signal.aborted ? "aborted_budget" : "completed",
      totalCostMicroUsd: sessionCost,
      at: this.now(),
    };
  }
}
