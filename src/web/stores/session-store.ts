import { useMemo } from "react";
import { create } from "zustand";
import { VisorEvent, type OverrideDecision } from "@shared/events";
import { deriveTrace, type TraceModel } from "@/lib/trace-model";

type Connection = "idle" | "connecting" | "open" | "closed";

export type DaemonInfo = { runtime: "mock" | "claude"; workspacePath: string; defaultModel: string; configPath: string | null; configError: string | null; mcpServers: string[]; rules: number };
export type StoredSession = { id: string; title: string; workspacePath: string; modelId: string; status: string; totalCostMicroUsd: number; startedAt: number; endedAt: number | null };

type SessionState = {
  token: string;
  connection: Connection;
  /** Every event received, grouped by session (events can arrive before the POST returns). */
  bySession: Record<string, VisorEvent[]>;
  sessionId: string | null;
  /** null = live; a number replays the first N events. */
  cursor: number | null;
  selectedSpanId: string | null;
  error: string | null;
  info: DaemonInfo | null;
  sessions: StoredSession[];
  connect: () => void;
  refreshSessions: () => Promise<void>;
  /** Open a stored session: its events load from SQLite and replay instantly. */
  open: (sessionId: string) => Promise<void>;
  start: (opts?: { prompt?: string; capUsd?: string; modelId?: string; effort?: "low" | "medium" | "high" }) => Promise<void>;
  resolve: (decision: OverrideDecision) => Promise<void>;
  stop: () => Promise<void>;
  select: (spanId: string | null) => void;
  /** Leave the current session (a fresh, empty chat). */
  clear: () => void;
  setCursor: (n: number | null) => void;
};

const readToken = () => {
  const fromUrl = new URLSearchParams(window.location.search).get("token");
  try {
    if (fromUrl) sessionStorage.setItem("visor-token", fromUrl);
    return fromUrl ?? sessionStorage.getItem("visor-token") ?? "";
  } catch {
    return fromUrl ?? "";
  }
};

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const useSession = create<SessionState>((set, get) => ({
  token: readToken(),
  connection: "idle",
  bySession: {},
  sessionId: null,
  cursor: null,
  selectedSpanId: null,
  error: null,
  info: null,
  sessions: [],

  connect() {
    const { token, connection } = get();
    if (!token || connection === "open" || connection === "connecting") return;
    set({ connection: "connecting" });
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen = () => {
      set({ connection: "open", error: null });
      void api<DaemonInfo>(get().token, "/api/info").then((info) => set({ info })).catch(() => undefined);
      void get().refreshSessions();
    };
    ws.onclose = () => {
      set({ connection: "closed" });
      setTimeout(() => get().connect(), 1500);
    };
    ws.onmessage = (msg) => {
      const parsed = VisorEvent.safeParse(JSON.parse(String(msg.data)));
      if (!parsed.success) return;
      const e = parsed.data;
      set((s) => ({ bySession: { ...s.bySession, [e.sessionId]: [...(s.bySession[e.sessionId] ?? []), e] } }));
      if (e.type === "session.started" || e.type === "session.ended") void get().refreshSessions();
    };
  },

  async refreshSessions() {
    try {
      const { sessions } = await api<{ sessions: StoredSession[] }>(get().token, "/api/sessions");
      set({ sessions });
    } catch {
      // the list is a convenience; the live stream keeps working without it
    }
  },

  async open(sessionId) {
    if (!get().bySession[sessionId]?.length) {
      const { events } = await api<{ events: VisorEvent[] }>(get().token, `/api/sessions/${sessionId}/events`);
      const parsed = events.map((e) => VisorEvent.safeParse(e)).flatMap((r) => (r.success ? [r.data] : []));
      set((s) => ({ bySession: { ...s.bySession, [sessionId]: parsed } }));
    }
    set({ sessionId, cursor: null, selectedSpanId: null });
  },

  async start(opts = {}) {
    try {
      const { sessionId } = await api<{ sessionId: string }>(get().token, "/api/sessions", {
        method: "POST",
        body: JSON.stringify({ prompt: opts.prompt ?? "", capUsd: opts.capUsd || "5", modelId: opts.modelId, effort: opts.effort }),
      });
      set({ sessionId, cursor: null, selectedSpanId: null, error: null });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  async resolve(decision) {
    const { sessionId, bySession, token } = get();
    const model = deriveTrace(bySession[sessionId ?? ""] ?? []);
    if (!model.paused) return;
    await api(token, `/api/breakpoints/${model.paused.spanId}`, { method: "POST", body: JSON.stringify(decision) });
  },

  async stop() {
    const { sessionId, token } = get();
    if (sessionId) await api(token, `/api/sessions/${sessionId}/stop`, { method: "POST" });
  },

  select: (spanId) => set({ selectedSpanId: spanId }),
  clear: () => set({ sessionId: null, cursor: null, selectedSpanId: null }),
  setCursor: (n) => set({ cursor: n }),
}));

/** Events of the current session (all of them, ignoring the replay cursor). */
export function useSessionEvents(): VisorEvent[] {
  const sessionId = useSession((s) => s.sessionId);
  const events = useSession((s) => (sessionId ? s.bySession[sessionId] : undefined));
  return events ?? EMPTY;
}
const EMPTY: VisorEvent[] = [];

/** The view model at the replay cursor (or live). */
export function useTraceModel(): TraceModel {
  const events = useSessionEvents();
  const cursor = useSession((s) => s.cursor);
  return useMemo(() => deriveTrace(cursor === null ? events : events.slice(0, cursor)), [events, cursor]);
}
