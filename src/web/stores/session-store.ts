import { useMemo } from "react";
import { create } from "zustand";
import { VisorEvent, type OverrideDecision } from "@shared/events";
import { deriveTrace, type TraceModel } from "@/lib/trace-model";

type Connection = "idle" | "connecting" | "open" | "closed";

export type DaemonInfo = { runtime: "mock" | "claude"; workspacePath: string; defaultModel: string; configPath: string | null; configError: string | null; mcpServers: string[]; rules: number; maxCapMicroUsd?: number | null };
export type ClaudeProfile = { name: string | null; plan: string | null };
export type LedgerEntry = { id: string; sessionId: string | null; entryType: "deposit" | "debit" | "adjustment"; amountMicroUsd: number; balanceAfterMicroUsd: number; note: string | null; createdAt: number };
export type WalletState = { enabled: boolean; active: boolean; balanceMicroUsd: number; entries: LedgerEntry[] };
export type PauseToggles = { bash: boolean; edits: boolean; mcpWrites: boolean };
export type AuditEntry = { id: string; sessionId: string; sessionTitle: string | null; spanId: string; toolName: string; matchedRule: string; decision: "approved" | "edited" | "denied" | "auto_blocked"; originalInputJson: string | null; finalInputJson: string | null; operatorNote: string | null; createdAt: number };
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
  /** The folder new sessions run in (null = the folder vhud started in). */
  folder: string | null;
  setFolder: (path: string | null) => void;
  /** The Claude account signed in on this computer (name and plan only). */
  profile: ClaudeProfile | null;
  sessions: StoredSession[];
  wallet: WalletState | null;
  toggles: PauseToggles | null;
  audit: AuditEntry[];
  setToggles: (next: Partial<PauseToggles>) => Promise<void>;
  refreshAudit: () => Promise<void>;
  refreshWallet: () => Promise<void>;
  /** "deposit" adds credit; "set" makes the balance exactly this amount. Returns an error message or null. */
  changeWallet: (kind: "deposit" | "set", amountUsd: string, note?: string) => Promise<string | null>;
  exportLedger: () => Promise<void>;
  connect: () => void;
  refreshSessions: () => Promise<void>;
  /** Delete sessions from V.I.S.O.R. (one, or a whole workspace by path). Returns an error message or null. */
  deleteSession: (sessionId: string) => Promise<string | null>;
  deleteWorkspace: (workspacePath: string) => Promise<string | null>;
  renameSession: (sessionId: string, title: string) => Promise<string | null>;
  /** Workspace folders removed from the sidebar, with when (they come back when a newer session starts there). */
  hiddenWorkspaces: Record<string, number>;
  hideWorkspace: (workspacePath: string) => void;
  /** Brings every removed workspace back into the sidebar. */
  showHiddenWorkspaces: () => void;
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

const TOKEN_KEY = "visor-token";
const FOLDER_KEY = "visor-folder";
function readFolder(): string | null {
  try {
    return localStorage.getItem(FOLDER_KEY);
  } catch {
    return null;
  }
}
export function forgetToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing stored
  }
}
/** Saves a token (or a whole link with ?token=) pasted by hand, then reloads. Returns false when it has none. */
export function saveTokenFrom(input: string): boolean {
  const text = input.trim();
  let token = text;
  try {
    token = new URL(text).searchParams.get("token") ?? "";
  } catch {
    // not a link: treat it as the token itself
  }
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) return false;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    window.location.search = `?token=${encodeURIComponent(token)}`;
    return true;
  }
  window.location.reload();
  return true;
}
const readToken = () => {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("token");
  let saved = false;
  try {
    // Remembered for this address in this browser (every tab), not shared with any other site
    if (fromUrl) localStorage.setItem(TOKEN_KEY, fromUrl);
    saved = Boolean(fromUrl);
    if (!fromUrl) return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    // no storage (private window): keep the token in the address so a reload still works
  }
  // Clean address bar: the secret token stays in this tab only, not in the URL or history
  if (saved) {
    params.delete("token");
    params.delete("cap");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  }
  return fromUrl ?? "";
};

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const HIDDEN_KEY = "visor.hiddenWorkspaces";
function readHidden(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function errorText(err: unknown): string {
  const text = (err as Error).message.replace(/^\d+ /, "");
  try {
    return (JSON.parse(text) as { error?: string }).error ?? text;
  } catch {
    return text;
  }
}

type Get = () => SessionState;
type Set = (partial: Partial<SessionState>) => void;

async function removeSessions(get: Get, set: Set, path: string, match: (s: StoredSession) => boolean): Promise<string | null> {
  try {
    await api(get().token, path, { method: "DELETE" });
  } catch (err) {
    return errorText(err);
  }
  const gone = new Set(get().sessions.filter(match).map((s) => s.id));
  const bySession = Object.fromEntries(Object.entries(get().bySession).filter(([id]) => !gone.has(id)));
  const current = get().sessionId;
  set({ sessions: get().sessions.filter((s) => !gone.has(s.id)), bySession, ...(current && gone.has(current) ? { sessionId: null, cursor: null, selectedSpanId: null } : {}) });
  return null;
}

export const useSession = create<SessionState>((set, get) => ({
  token: readToken(),
  connection: "idle",
  bySession: {},
  sessionId: null,
  cursor: null,
  selectedSpanId: null,
  error: null,
  profile: null,
  folder: readFolder(),
  setFolder(path) {
    set({ folder: path });
    try {
      if (path) localStorage.setItem(FOLDER_KEY, path);
      else localStorage.removeItem(FOLDER_KEY);
    } catch {
      // not remembered in a private window
    }
  },
  info: null,
  sessions: [],
  wallet: null,
  toggles: null,
  audit: [],

  connect() {
    const { token, connection } = get();
    if (!token || connection === "open" || connection === "connecting") return;
    set({ connection: "connecting" });
    const openSocket = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        set({ connection: "open", error: null });
        void api<DaemonInfo>(get().token, "/api/info").then((info) => set({ info })).catch(() => undefined);
        void api<ClaudeProfile>(get().token, "/api/profile").then((profile) => set({ profile })).catch(() => undefined);
        void get().refreshSessions();
        void get().refreshWallet();
        void api<{ toggles: PauseToggles }>(get().token, "/api/policy").then((p) => set({ toggles: p.toggles })).catch(() => undefined);
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
        if (e.type === "session.ended") setTimeout(() => void get().refreshWallet(), 150);
        if (e.type === "breakpoint.resolved") setTimeout(() => void get().refreshAudit(), 150);
      };
    };
    // A remembered token from an older V.I.S.O.R. is refused: forget it and ask for the link
    void fetch("/api/info", { headers: { authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.status === 401) {
          forgetToken();
          set({ token: "", connection: "closed" });
        } else openSocket();
      })
      .catch(() => openSocket());
  },

  async setToggles(next) {
    const prev = get().toggles;
    if (prev) set({ toggles: { ...prev, ...next } }); // optimistic
    try {
      const { toggles } = await api<{ toggles: PauseToggles }>(get().token, "/api/policy", { method: "PUT", body: JSON.stringify(next) });
      set({ toggles });
    } catch {
      set({ toggles: prev });
    }
  },

  async refreshAudit() {
    try {
      set({ audit: (await api<{ entries: AuditEntry[] }>(get().token, "/api/audit")).entries });
    } catch {
      // the audit view keeps its last list
    }
  },

  async refreshWallet() {
    try {
      set({ wallet: await api<WalletState>(get().token, "/api/wallet") });
    } catch {
      // keep the last known wallet
    }
  },

  async changeWallet(kind, amountUsd, note) {
    const res = await fetch(kind === "deposit" ? "/api/wallet/deposit" : "/api/wallet/balance", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${get().token}` },
      body: JSON.stringify({ amountUsd: amountUsd.trim().replace(/^\$/, ""), note }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return body.error ?? "Something went wrong";
    await get().refreshWallet();
    return null;
  },

  async exportLedger() {
    const res = await fetch("/api/wallet/export.csv", { headers: { authorization: `Bearer ${get().token}` } });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `visor-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async refreshSessions() {
    try {
      const { sessions } = await api<{ sessions: StoredSession[] }>(get().token, "/api/sessions");
      set({ sessions });
    } catch {
      // the list is a convenience; the live stream keeps working without it
    }
  },

  async renameSession(sessionId, title) {
    try {
      await api(get().token, `/api/sessions/${encodeURIComponent(sessionId)}`, { method: "PATCH", body: JSON.stringify({ title }) });
    } catch (err) {
      return errorText(err);
    }
    const bySession = get().bySession[sessionId];
    set({
      sessions: get().sessions.map((s) => (s.id === sessionId ? { ...s, title } : s)),
      ...(bySession ? { bySession: { ...get().bySession, [sessionId]: bySession.map((e) => (e.type === "session.started" ? { ...e, title } : e)) } } : {}),
    });
    return null;
  },

  hiddenWorkspaces: readHidden(),
  hideWorkspace(workspacePath) {
    const hiddenWorkspaces = { ...get().hiddenWorkspaces, [workspacePath]: Date.now() };
    set({ hiddenWorkspaces });
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(hiddenWorkspaces));
    } catch {
      // private window: it stays hidden until reload
    }
  },

  showHiddenWorkspaces() {
    set({ hiddenWorkspaces: {} });
    try {
      localStorage.removeItem(HIDDEN_KEY);
    } catch {
      // nothing stored
    }
  },

  async deleteSession(sessionId) {
    return removeSessions(get, set, `/api/sessions/${encodeURIComponent(sessionId)}`, (s) => s.id === sessionId);
  },

  async deleteWorkspace(workspacePath) {
    return removeSessions(get, set, `/api/workspaces?path=${encodeURIComponent(workspacePath)}`, (s) => s.workspacePath === workspacePath);
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
      // With a session open, the message continues it; otherwise it starts a new one
      const current = get().sessionId;
      const path = current ? `/api/sessions/${current}/messages` : "/api/sessions";
      const { sessionId } = await api<{ sessionId: string }>(get().token, path, {
        method: "POST",
        body: JSON.stringify({
          prompt: opts.prompt ?? "",
          capUsd: opts.capUsd || "5",
          modelId: opts.modelId,
          effort: opts.effort,
          // A new session runs in the folder you picked; a follow-up stays in its own folder
          ...(!current && get().folder ? { workspacePath: get().folder } : {}),
        }),
      });
      set({ sessionId, cursor: null, selectedSpanId: null, error: null });
    } catch (err) {
      const text = (err as Error).message.replace(/^\d+ /, "");
      let message = text;
      try {
        message = (JSON.parse(text) as { error?: string }).error ?? text;
      } catch {
        // plain text error
      }
      set({ error: message });
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
