import { create } from "zustand";
import { VisorEvent, type OverrideDecision, type SpanStatus, type SpanType, type ContextBreakdown } from "@shared/events";

export type UiSpan = {
  spanId: string;
  parentSpanId: string | null;
  spanType: SpanType;
  name: string;
  status: SpanStatus;
  text: string;
  depth: number;
  startedAt: number;
  endedAt?: number;
  costMicroUsd: number;
  diff?: string;
  error?: string;
};

export type PausedCall = { spanId: string; toolName: string; rule: string; input: unknown };

type Connection = "idle" | "connecting" | "open" | "closed";

type TraceState = {
  token: string;
  connection: Connection;
  sessionId: string | null;
  title: string;
  status: "idle" | "running" | "paused" | "completed" | "aborted_budget" | "error";
  spans: UiSpan[];
  /** Live spend from usage events, deduplicated by message ID. */
  liveCostMicroUsd: number;
  finalCostMicroUsd: number | null;
  cacheSavingsMicroUsd: number;
  context: { used: number; limit: number; breakdown: ContextBreakdown } | null;
  paused: PausedCall | null;
  connect: () => void;
  startSession: (capUsd?: string) => Promise<void>;
  resolve: (decision: OverrideDecision) => Promise<void>;
  apply: (event: VisorEvent) => void;
};

/**
 * Live ticking price in integer µUSD per 1M tokens (Opus 5.5, 5m writes).
 * The authoritative per-model turn total from the daemon replaces it.
 */
const LIVE_RATE = { input: 4_000_000, write: 5_000_000, read: 200_000, output: 20_000_000 };
const seenMessages = new Set<string>();

const readToken = () => {
  if (typeof window === "undefined") return "";
  const fromUrl = new URLSearchParams(window.location.search).get("token");
  try {
    if (fromUrl) sessionStorage.setItem("visor-token", fromUrl);
    return fromUrl ?? sessionStorage.getItem("visor-token") ?? "";
  } catch {
    return fromUrl ?? "";
  }
};

export const useTrace = create<TraceState>((set, get) => ({
  token: readToken(),
  connection: "idle",
  sessionId: null,
  title: "",
  status: "idle",
  spans: [],
  liveCostMicroUsd: 0,
  finalCostMicroUsd: null,
  cacheSavingsMicroUsd: 0,
  context: null,
  paused: null,

  connect() {
    const { token, connection } = get();
    if (!token || connection === "open" || connection === "connecting") return;
    set({ connection: "connecting" });
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen = () => set({ connection: "open" });
    ws.onclose = () => {
      set({ connection: "closed" });
      setTimeout(() => get().connect(), 1500);
    };
    ws.onmessage = (msg) => {
      const parsed = VisorEvent.safeParse(JSON.parse(String(msg.data)));
      if (parsed.success) get().apply(parsed.data);
    };
  },

  async startSession(capUsd) {
    seenMessages.clear();
    set({ spans: [], liveCostMicroUsd: 0, finalCostMicroUsd: null, cacheSavingsMicroUsd: 0, context: null, paused: null });
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${get().token}` },
      body: JSON.stringify({ prompt: "", capUsd }),
    });
    const body = (await res.json()) as { sessionId?: string };
    if (body.sessionId) set({ sessionId: body.sessionId, status: "running" });
  },

  async resolve(decision) {
    const paused = get().paused;
    if (!paused) return;
    await fetch(`/api/breakpoints/${paused.spanId}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${get().token}` },
      body: JSON.stringify(decision),
    });
  },

  apply(e) {
    const s = get();
    if (s.sessionId && e.sessionId !== s.sessionId) return;
    switch (e.type) {
      case "session.started":
        set({ sessionId: e.sessionId, title: e.title, status: "running" });
        break;
      case "span.started": {
        const parent = s.spans.find((x) => x.spanId === e.parentSpanId);
        const span: UiSpan = {
          spanId: e.spanId,
          parentSpanId: e.parentSpanId,
          spanType: e.spanType,
          name: e.name,
          status: "running",
          text: "",
          depth: parent ? parent.depth + 1 : 0,
          startedAt: e.at,
          costMicroUsd: 0,
        };
        set({ spans: [...s.spans, span] });
        break;
      }
      case "span.delta":
        set({ spans: s.spans.map((x) => (x.spanId === e.spanId ? { ...x, text: x.text + e.text } : x)) });
        break;
      case "span.ended":
        set({
          spans: s.spans.map((x) =>
            x.spanId === e.spanId ? { ...x, status: e.status, endedAt: e.at, costMicroUsd: e.costMicroUsd, diff: e.diff, error: e.error } : x,
          ),
        });
        break;
      case "usage": {
        if (seenMessages.has(e.messageId)) break; // parallel tool calls repeat usage
        seenMessages.add(e.messageId);
        const u = e.usage;
        const scaled =
          u.inputTokens * LIVE_RATE.input +
          (u.cacheWrite5mTokens + u.cacheWrite1hTokens) * LIVE_RATE.write +
          u.cacheReadTokens * LIVE_RATE.read +
          u.outputTokens * LIVE_RATE.output;
        const micro = Math.floor((scaled + 500_000) / 1_000_000); // integer µUSD, rounded half up
        set({ liveCostMicroUsd: s.liveCostMicroUsd + micro });
        break;
      }
      case "breakpoint.paused":
        set({ status: "paused", paused: { spanId: e.spanId, toolName: e.toolName, rule: e.rule, input: e.input } });
        break;
      case "breakpoint.resolved":
        set({ status: "running", paused: s.paused?.spanId === e.spanId ? null : s.paused });
        break;
      case "turn.ended":
        set({
          finalCostMicroUsd: e.costMicroUsd,
          cacheSavingsMicroUsd: e.cacheSavingsMicroUsd,
          context: { used: e.contextUsedTokens, limit: e.contextLimitTokens, breakdown: e.contextBreakdown },
        });
        break;
      case "session.ended":
        set({ status: e.status, paused: null });
        break;
      default:
        break;
    }
  },
}));
