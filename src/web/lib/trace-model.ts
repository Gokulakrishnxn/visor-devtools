import type { ContextBreakdown, Decision, Effort, SpanStatus, SpanType, VisorEvent } from "@shared/events";
import type { CostBreakdown, TokenUsage } from "@shared/pricing";
import { EMPTY_USAGE } from "@shared/pricing";
import { addUsage, computeCost } from "@server/telemetry/cost";
import { DEFAULT_PRICING } from "@server/telemetry/pricing-table";

// Pure fold from the VisorEvent stream to everything the GUI renders.
// Pure on purpose: replay is just deriveTrace(events.slice(0, n)).

export type TraceSpan = {
  spanId: string;
  parentSpanId: string | null;
  turnId: string;
  spanType: SpanType;
  name: string;
  filePath?: string;
  status: SpanStatus;
  text: string;
  input?: unknown;
  output?: unknown;
  diff?: string;
  error?: string;
  costMicroUsd: number;
  startedAt: number;
  endedAt?: number;
  depth: number;
  children: string[];
  breakpoint?: { toolName: string; rule: string; decision?: Decision; note?: string; finalInput?: unknown };
};

export type TraceTurn = {
  turnId: string;
  index: number;
  prompt: string;
  startedAt: number;
  endedAt?: number;
  rootSpanIds: string[];
  costMicroUsd?: number;
  cacheSavingsMicroUsd?: number;
  context?: { used: number; limit: number; breakdown: ContextBreakdown };
};

export type Alert = { id: string; level: "info" | "warning" | "danger"; title: string; detail: string; at: number; spanId?: string };

export type TraceModel = {
  session: {
    id: string;
    title: string;
    modelId: string;
    effort: Effort;
    workspacePath: string;
    capMicroUsd: number | null;
    startedAt: number;
    status: "running" | "paused" | "completed" | "aborted_budget" | "error";
  } | null;
  turns: TraceTurn[];
  spans: Record<string, TraceSpan>;
  /** Spans in start order. */
  order: string[];
  /** Deduped usage summed over the session (all integer token counts). */
  usage: TokenUsage;
  /** Exact live cost from deduped usage, in integer µUSD. */
  cost: CostBreakdown;
  paused: { spanId: string; toolName: string; rule: string; input: unknown } | null;
  alerts: Alert[];
  /** Context after each finished turn, for the compaction timeline. */
  contextHistory: { turnIndex: number; used: number; limit: number; breakdown: ContextBreakdown; compacted: boolean }[];
  firstAt: number;
  lastAt: number;
};

const ZERO_COST: CostBreakdown = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0, total: 0, cacheSavings: 0 };
/** A call whose prompt grows this much (×1.2) over the previous one, above 10k tokens, is a spike. */
const SPIKE_RATIO_PCT = 120;
const SPIKE_MIN_TOKENS = 10_000;

export const EMPTY_MODEL: TraceModel = {
  session: null,
  turns: [],
  spans: {},
  order: [],
  usage: EMPTY_USAGE,
  cost: ZERO_COST,
  paused: null,
  alerts: [],
  contextHistory: [],
  firstAt: 0,
  lastAt: 0,
};

function addCost(a: CostBreakdown, b: CostBreakdown): CostBreakdown {
  return {
    input: a.input + b.input,
    cacheWrite5m: a.cacheWrite5m + b.cacheWrite5m,
    cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h,
    cacheRead: a.cacheRead + b.cacheRead,
    output: a.output + b.output,
    total: a.total + b.total,
    cacheSavings: a.cacheSavings + b.cacheSavings,
  };
}

export function deriveTrace(events: readonly VisorEvent[]): TraceModel {
  const m: TraceModel = { ...EMPTY_MODEL, turns: [], spans: {}, order: [], alerts: [], contextHistory: [] };
  const seen = new Set<string>();
  let compactedThisTurn = false;
  let lastPromptTokens = 0;

  for (const e of events) {
    m.firstAt ||= e.at;
    m.lastAt = e.at;
    switch (e.type) {
      case "session.started":
        m.session = {
          id: e.sessionId,
          title: e.title,
          modelId: e.modelId,
          effort: e.effort,
          workspacePath: e.workspacePath,
          capMicroUsd: e.budgetCapMicroUsd,
          startedAt: e.at,
          status: "running",
        };
        break;
      case "turn.started":
        compactedThisTurn = false;
        m.turns.push({ turnId: e.turnId, index: e.turnIndex, prompt: e.prompt, startedAt: e.at, rootSpanIds: [] });
        break;
      case "span.started": {
        const parent = e.parentSpanId ? m.spans[e.parentSpanId] : undefined;
        m.spans[e.spanId] = {
          spanId: e.spanId,
          parentSpanId: e.parentSpanId,
          turnId: e.turnId,
          spanType: e.spanType,
          name: e.name,
          filePath: e.filePath,
          status: "running",
          text: "",
          input: e.input,
          costMicroUsd: 0,
          startedAt: e.at,
          depth: parent ? parent.depth + 1 : 0,
          children: [],
        };
        if (parent) parent.children = [...parent.children, e.spanId];
        else m.turns.find((t) => t.turnId === e.turnId)?.rootSpanIds.push(e.spanId);
        m.order.push(e.spanId);
        if (e.spanType === "compaction") compactedThisTurn = true;
        break;
      }
      case "span.delta": {
        const s = m.spans[e.spanId];
        if (s) m.spans[e.spanId] = { ...s, text: s.text + e.text };
        break;
      }
      case "span.ended": {
        const s = m.spans[e.spanId];
        if (!s) break;
        m.spans[e.spanId] = { ...s, status: e.status, output: e.output, diff: e.diff, error: e.error, costMicroUsd: e.costMicroUsd, endedAt: e.at };
        if (e.status === "error") m.alerts.push({ id: `err-${e.spanId}`, level: "danger", title: `${s.name} failed`, detail: e.error ?? "", at: e.at, spanId: e.spanId });
        break;
      }
      case "usage": {
        if (seen.has(e.messageId)) break; // parallel tool calls repeat usage
        seen.add(e.messageId);
        m.usage = addUsage(m.usage, e.usage);
        const price = DEFAULT_PRICING[e.modelId] ?? DEFAULT_PRICING["claude-opus-5-5"]!;
        m.cost = addCost(m.cost, computeCost(e.usage, price));
        const promptTokens = e.usage.inputTokens + e.usage.cacheReadTokens + e.usage.cacheWrite5mTokens + e.usage.cacheWrite1hTokens;
        const spike = lastPromptTokens > 0 && promptTokens >= SPIKE_MIN_TOKENS && promptTokens * 100 >= lastPromptTokens * SPIKE_RATIO_PCT;
        lastPromptTokens = promptTokens;
        if (spike)
          m.alerts.push({ id: `spike-${e.messageId}`, level: "warning", title: "Token spike", detail: `${promptTokens.toLocaleString("en-US")} prompt tokens, up from the previous call`, at: e.at, spanId: e.spanId });
        const cap = m.session?.capMicroUsd;
        if (cap && m.cost.total * 5 >= cap * 4 && !m.alerts.some((a) => a.id === "budget-80"))
          m.alerts.push({ id: "budget-80", level: "warning", title: "Budget at 80%", detail: "The session is close to its hard cap.", at: e.at });
        break;
      }
      case "breakpoint.paused": {
        const s = m.spans[e.spanId];
        if (s) m.spans[e.spanId] = { ...s, status: "paused", breakpoint: { toolName: e.toolName, rule: e.rule } };
        m.paused = { spanId: e.spanId, toolName: e.toolName, rule: e.rule, input: e.input };
        if (m.session) m.session = { ...m.session, status: "paused" };
        m.alerts.push({ id: `bp-${e.spanId}`, level: "warning", title: `Paused before ${e.toolName}`, detail: `Rule ${e.rule}`, at: e.at, spanId: e.spanId });
        break;
      }
      case "breakpoint.resolved": {
        const s = m.spans[e.spanId];
        if (s) m.spans[e.spanId] = { ...s, breakpoint: { toolName: e.toolName, rule: e.rule, decision: e.decision, note: e.note, finalInput: e.finalInput } };
        if (m.paused?.spanId === e.spanId) m.paused = null;
        if (m.session) m.session = { ...m.session, status: "running" };
        if (e.decision === "auto_blocked")
          m.alerts.push({ id: `blk-${e.spanId}`, level: "danger", title: `Blocked ${e.toolName}`, detail: `Rule ${e.rule}`, at: e.at, spanId: e.spanId });
        break;
      }
      case "turn.ended": {
        const t = m.turns.find((x) => x.turnId === e.turnId);
        if (t) {
          t.endedAt = e.at;
          t.costMicroUsd = e.costMicroUsd;
          t.cacheSavingsMicroUsd = e.cacheSavingsMicroUsd;
          t.context = { used: e.contextUsedTokens, limit: e.contextLimitTokens, breakdown: e.contextBreakdown };
          m.contextHistory.push({ turnIndex: t.index, used: e.contextUsedTokens, limit: e.contextLimitTokens, breakdown: e.contextBreakdown, compacted: compactedThisTurn });
          if (compactedThisTurn)
            m.alerts.push({ id: `cmp-${e.turnId}`, level: "info", title: "Context compacted", detail: `Turn ${t.index + 1} summarized older tool output`, at: e.at });
        }
        break;
      }
      case "alert":
        m.alerts.push({ id: `alert-${m.alerts.length}-${e.at}`, level: e.level, title: e.title, detail: `${e.detail} · ${e.source}`, at: e.at, spanId: e.spanId });
        break;
      case "session.ended":
        if (m.session) m.session = { ...m.session, status: e.status };
        m.paused = null;
        break;
    }
  }
  return m;
}

/** Latest known context (last finished turn). */
export function latestContext(m: TraceModel) {
  return m.contextHistory.at(-1) ?? null;
}

/** Depth-first span IDs, the order J/K walks. */
export function walkOrder(m: TraceModel): string[] {
  const out: string[] = [];
  const visit = (id: string) => {
    out.push(id);
    m.spans[id]?.children.forEach(visit);
  };
  m.turns.forEach((t) => t.rootSpanIds.forEach(visit));
  return out;
}
