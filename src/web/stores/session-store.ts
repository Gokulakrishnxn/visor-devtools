import { useMemo } from "react";
import { create } from "zustand";
import { VisorEvent, type OverrideDecision } from "@shared/events";
import { deriveTrace, type TraceModel } from "@/lib/trace-model";

type Connection = "idle" | "connecting" | "open" | "closed";

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
  connect: () => void;
  start: (capUsd?: string) => Promise<void>;
  resolve: (decision: OverrideDecision) => Promise<void>;
  stop: () => Promise<void>;
  select: (spanId: string | null) => void;
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

  connect() {
    const { token, connection } = get();
    if (!token || connection === "open" || connection === "connecting") return;
    set({ connection: "connecting" });
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen = () => set({ connection: "open", error: null });
    ws.onclose = () => {
      set({ connection: "closed" });
      setTimeout(() => get().connect(), 1500);
    };
    ws.onmessage = (msg) => {
      const parsed = VisorEvent.safeParse(JSON.parse(String(msg.data)));
      if (!parsed.success) return;
      const e = parsed.data;
      set((s) => ({ bySession: { ...s.bySession, [e.sessionId]: [...(s.bySession[e.sessionId] ?? []), e] } }));
    };
  },

  async start(capUsd) {
    try {
      const { sessionId } = await api<{ sessionId: string }>(get().token, "/api/sessions", {
        method: "POST",
        body: JSON.stringify({ prompt: "", capUsd: capUsd ?? "5" }),
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
