import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, ChevronRight, GitBranch, GitCommitHorizontal, Loader2, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Usd } from "@/components/visor/primitives";
import { cn } from "@/lib/utils";
import { NO_FOLDER, useSession } from "@/stores/session-store";
import { useCurrentFolder } from "./folder-picker";

type GitFile = { path: string; status: "added" | "modified" | "deleted" | "renamed" | "untracked" | "conflict"; staged: boolean };
type GitState = { path: string } & ({ repo: false } | { repo: true; branch: string | null; branches: string[]; files: GitFile[]; ahead: number; behind: number; upstream: string | null });

const BADGE: Record<GitFile["status"], { letter: string; color: string }> = {
  added: { letter: "A", color: "text-emerald" },
  untracked: { letter: "U", color: "text-emerald" },
  modified: { letter: "M", color: "text-amber" },
  renamed: { letter: "R", color: "text-indigo" },
  deleted: { letter: "D", color: "text-rose" },
  conflict: { letter: "!", color: "text-rose" },
};

/**
 * Source control for the folder Claude works in, at the bottom of the
 * sidebar: the branch (switch or create), the changed files, and a commit
 * box whose ✨ button asks Claude to write the message.
 */
export function GitBar() {
  const token = useSession((s) => s.token);
  const live = useSession((s) => s.info?.runtime === "claude");
  const sessions = useSession((s) => s.sessions);
  const refreshWallet = useSession((s) => s.refreshWallet);
  const folder = useCurrentFolder();
  const [state, setState] = useState<GitState | null>(null);
  const [message, setMessage] = useState("");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"ai" | "commit" | "load" | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [showFiles, setShowFiles] = useState(false);
  const [lastCost, setLastCost] = useState<number | null>(null);

  const call = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });
      const body = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      return body;
    },
    [token],
  );

  const load = useCallback(async () => {
    if (!folder || folder === NO_FOLDER) return setState(null);
    setBusy((b) => b ?? "load");
    try {
      setState(await call<GitState>(`/api/git?path=${encodeURIComponent(folder)}`));
    } catch {
      setState(null);
    } finally {
      setBusy((b) => (b === "load" ? null : b));
    }
  }, [call, folder]);

  // Reload when the folder changes and whenever a session starts or finishes (Claude may have edited files)
  const sessionsKey = sessions.map((s) => `${s.id}:${s.status}`).join(",");
  useEffect(() => {
    if (!folder || folder === NO_FOLDER) return;
    let current = true;
    call<GitState>(`/api/git?path=${encodeURIComponent(folder)}`)
      .then((next) => current && setState(next))
      .catch(() => current && setState(null));
    return () => {
      current = false;
    };
  }, [call, folder, sessionsKey]);

  if (!folder || folder === NO_FOLDER || !state) return null;
  if (!state.repo) {
    return (
      <div className="mx-2 mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-white/35">
        <GitBranch size={13} /> Not a git repository
      </div>
    );
  }

  const files = state.files;
  const chosen = files.filter((f) => !skipped.has(f.path));
  const toggle = (path: string) => setSkipped((s) => (s.has(path) ? new Set([...s].filter((p) => p !== path)) : new Set([...s, path])));
  const scope = chosen.length === files.length ? undefined : chosen.map((f) => f.path);

  const writeWithAi = async () => {
    setBusy("ai");
    setNote(null);
    try {
      const r = await call<{ message: string; costMicroUsd: number; ai: boolean }>("/api/git/message", { method: "POST", body: JSON.stringify({ path: state.path, paths: scope }) });
      setMessage(r.message);
      setLastCost(r.ai ? r.costMicroUsd : null);
      if (r.ai) void refreshWallet();
    } catch (err) {
      setNote({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const doCommit = async () => {
    setBusy("commit");
    setNote(null);
    try {
      const r = await call<GitState & { id: string }>("/api/git/commit", { method: "POST", body: JSON.stringify({ path: state.path, message, paths: scope }) });
      setState(r);
      setMessage("");
      setSkipped(new Set());
      setLastCost(null);
      setNote({ kind: "ok", text: `Committed ${r.id}` });
    } catch (err) {
      setNote({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-2 mb-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
      <div className="flex items-center gap-1">
        <BranchMenu state={state} onSwitch={async (name, create) => {
          setNote(null);
          try {
            setState(await call<GitState>("/api/git/branch", { method: "POST", body: JSON.stringify({ path: state.path, name, create }) }));
          } catch (err) {
            setNote({ kind: "error", text: (err as Error).message });
          }
        }} />
        {(state.ahead > 0 || state.behind > 0) && (
          <span className="font-mono text-[10.5px] text-white/40" title={`${state.ahead} to push, ${state.behind} to pull${state.upstream ? ` (${state.upstream})` : ""}`}>
            {state.ahead > 0 && `↑${state.ahead}`} {state.behind > 0 && `↓${state.behind}`}
          </span>
        )}
        <button type="button" aria-label="Refresh git status" onClick={() => void load()} className="ml-auto rounded-md p-1 text-white/40 hover:bg-white/[0.07] hover:text-foreground">
          <RefreshCw size={12.5} className={cn(busy === "load" && "animate-spin")} />
        </button>
      </div>

      {files.length === 0 ? (
        <p className="px-1.5 pb-0.5 pt-1.5 text-[12px] text-white/35">No changes</p>
      ) : (
        <>
          <button type="button" onClick={() => setShowFiles((s) => !s)} aria-expanded={showFiles} className="mt-1 flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[12px] text-white/55 hover:bg-white/[0.04]">
            <ChevronRight size={12} className={cn("transition-transform", showFiles && "rotate-90")} />
            {chosen.length === files.length ? `${files.length} change${files.length === 1 ? "" : "s"}` : `${chosen.length} of ${files.length} changes`}
          </button>
          {showFiles && (
            <ul className="mb-1 max-h-40 overflow-y-auto">
              {files.map((f) => (
                <li key={f.path}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-0.5 text-[11.5px] hover:bg-white/[0.04]" title={f.path}>
                    <input type="checkbox" checked={!skipped.has(f.path)} onChange={() => toggle(f.path)} className="size-3 accent-[var(--indigo)]" />
                    <span className="min-w-0 flex-1 truncate font-mono text-white/70">{f.path}</span>
                    <span className={cn("w-3 shrink-0 text-center font-mono font-semibold", BADGE[f.status].color)}>{BADGE[f.status].letter}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="relative mt-1">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && message.trim() && chosen.length) void doCommit();
              }}
              rows={message.includes("\n") ? 4 : 2}
              placeholder="Commit message"
              aria-label="Commit message"
              className="w-full resize-none rounded-lg border border-white/[0.08] bg-black/20 py-1.5 pl-2.5 pr-8 text-[12.5px] leading-snug text-foreground outline-none placeholder:text-white/30 focus:border-indigo/50"
            />
            <button
              type="button"
              onClick={() => void writeWithAi()}
              disabled={busy !== null || !chosen.length}
              aria-label={live ? "Write the commit message with AI" : "Suggest a commit message"}
              title={live ? "Write with AI (Claude Haiku, a fraction of a cent)" : "Suggest a message (demo mode: no AI)"}
              className="absolute right-1.5 top-1.5 rounded-md p-1 text-violet/80 hover:bg-violet/10 hover:text-violet disabled:opacity-40"
            >
              {busy === "ai" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void doCommit()}
            disabled={busy !== null || !message.trim() || !chosen.length}
            className="mt-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-foreground text-[12.5px] font-medium text-[var(--primary-foreground)] transition-opacity disabled:opacity-35"
          >
            {busy === "commit" ? <Loader2 size={13} className="animate-spin" /> : <GitCommitHorizontal size={14} />}
            Commit {chosen.length} file{chosen.length === 1 ? "" : "s"}
          </button>
        </>
      )}
      {lastCost !== null && lastCost > 0 && (
        <p className="mt-1 px-1 text-[10.5px] text-white/30">
          AI message cost <Usd micro={lastCost} />
        </p>
      )}
      {note && (
        <p role={note.kind === "error" ? "alert" : "status"} className={cn("mt-1.5 px-1 text-[11.5px] leading-snug", note.kind === "error" ? "text-rose/90" : "text-emerald/90")}>
          {note.text}
        </p>
      )}
    </div>
  );
}

function BranchMenu({ state, onSwitch }: { state: Extract<GitState, { repo: true }>; onSwitch: (name: string, create: boolean) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && (setOpen(false), setCreating(false));
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex max-w-[170px] items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] text-white/80 hover:bg-white/[0.07] hover:text-foreground" title="Switch branch">
        <GitBranch size={13} className="shrink-0 text-white/50" />
        <span className="truncate font-mono">{state.branch ?? "detached"}</span>
        <ChevronDown size={12} className="shrink-0 text-white/40" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-8 left-0 z-30 w-60 rounded-xl border border-white/[0.09] bg-[var(--popover)] p-1 shadow-xl shadow-black/40"
          >
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-white/40">Branches</p>
            <div className="max-h-52 overflow-y-auto">
              {state.branches.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (b !== state.branch) void onSwitch(b, false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-mono text-[12px] text-white/85 hover:bg-white/[0.07]"
                >
                  <span className="min-w-0 flex-1 truncate">{b}</span>
                  {b === state.branch && <Check size={13} className="shrink-0 text-indigo" />}
                </button>
              ))}
            </div>
            <div className="my-1 border-t border-white/[0.07]" />
            {creating ? (
              <form
                className="flex gap-1 p-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!name.trim()) return;
                  setOpen(false);
                  setCreating(false);
                  void onSwitch(name.trim(), true);
                  setName("");
                }}
              >
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="feat/new-branch" aria-label="New branch name" className="h-7 min-w-0 flex-1 rounded-md border border-white/[0.1] bg-black/30 px-2 font-mono text-[12px] text-foreground outline-none focus:border-indigo/50" />
                <button type="submit" className="h-7 rounded-md bg-foreground px-2 text-[12px] font-medium text-[var(--primary-foreground)]">
                  Create
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-white/85 hover:bg-white/[0.07]">
                <Plus size={13} className="text-white/50" /> New branch…
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
