import { useEffect, useState } from "react";
import { Brain, FilePen, FileText, Network, Play, ShieldAlert, SquareTerminal, Wrench, Cpu } from "lucide-react";
import { CONTEXT_CATEGORIES, type SpanType } from "@shared/events";
import { formatUsd } from "@shared/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTrace, type UiSpan } from "@/stores/trace-store";

const ICON: Record<SpanType, typeof FileText> = {
  llm: Cpu,
  thinking: Brain,
  read: FileText,
  edit: FilePen,
  bash: SquareTerminal,
  mcp: Wrench,
  subagent: Network,
  compaction: Cpu,
  override: ShieldAlert,
};

const STATUS: Record<UiSpan["status"], string> = {
  running: "text-muted-foreground",
  paused: "text-amber",
  ok: "text-emerald",
  error: "text-rose",
  denied: "text-rose",
  edited: "text-amber",
};

const CTX_COLOR = ["#7aa2ff", "#5eead4", "#fbbf24", "#34d399", "#a78bfa", "#f472b6", "#94a3b8"];

/**
 * Phase 1 smoke test: proves the daemon → WebSocket → GUI path end to end on
 * the mock runtime. The three real designs are built in Phase 2.
 */
export function FoundationConsole() {
  const t = useTrace();
  const [cap, setCap] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const connect = t.connect;

  useEffect(() => connect(), [connect]);

  if (!t.token) {
    return (
      <Shell>
        <p className="text-muted-foreground">
          No session token. Start the daemon with <code className="font-mono text-foreground">pnpm dev</code> and open the URL it prints.
        </p>
      </Shell>
    );
  }

  const cost = t.finalCostMicroUsd ?? t.liveCostMicroUsd;
  return (
    <Shell
      right={
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="rounded-full bg-emerald/10 px-2.5 py-1 text-emerald tabular">{formatUsd(cost)}</span>
          {t.cacheSavingsMicroUsd > 0 && (
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-muted-foreground tabular">
              cache saved {formatUsd(t.cacheSavingsMicroUsd)}
            </span>
          )}
          <span className={cn("size-2 rounded-full", t.connection === "open" ? "bg-emerald" : "bg-rose")} title={t.connection} />
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void t.startSession(cap || undefined)} disabled={t.status === "running" || t.status === "paused"}>
          <Play /> Run mock session
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Cap $
          <input
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            placeholder="none"
            inputMode="decimal"
            className="h-9 w-20 rounded-lg border border-border-strong bg-transparent px-2 font-mono text-foreground outline-none focus:border-white/30"
          />
        </label>
        <span className="text-sm text-muted-foreground">
          Status: <span className="text-foreground">{t.status}</span>
        </span>
      </div>

      {t.paused && (
        <div className="mt-6 rounded-xl border border-amber/30 bg-amber/[0.06] p-4">
          <div className="flex items-center gap-2 text-sm text-amber">
            <ShieldAlert size={15} /> Paused before {t.paused.toolName}
            <span className="ml-auto font-mono text-xs text-faint">rule: {t.paused.rule}</span>
          </div>
          {editing === null ? (
            <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs">{JSON.stringify(t.paused.input, null, 2)}</pre>
          ) : (
            <textarea
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-lg bg-black/40 p-3 font-mono text-xs outline-none"
            />
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Steering note for Deny (optional)"
            className="mt-3 h-9 w-full rounded-lg border border-border bg-transparent px-3 text-sm outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="approve" size="sm" onClick={() => void t.resolve({ decision: "approved" })}>
              Approve (A)
            </Button>
            {editing === null ? (
              <Button variant="edit" size="sm" onClick={() => setEditing(JSON.stringify(t.paused?.input, null, 2))}>
                Edit JSON (E)
              </Button>
            ) : (
              <Button
                variant="edit"
                size="sm"
                onClick={() => {
                  try {
                    void t.resolve({ decision: "edited", input: JSON.parse(editing) as Record<string, unknown> });
                    setEditing(null);
                  } catch {
                    alert("That JSON is not valid.");
                  }
                }}
              >
                Send edited JSON
              </Button>
            )}
            <Button variant="deny" size="sm" onClick={() => void t.resolve({ decision: "denied", note: note || undefined })}>
              Deny (D)
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-panel">
        {t.spans.length === 0 && <li className="p-4 text-sm text-muted-foreground">No spans yet. Run a mock session.</li>}
        {t.spans.map((s) => {
          const Icon = ICON[s.spanType];
          return (
            <li key={s.spanId} className="px-4 py-2.5 text-sm" style={{ paddingLeft: 16 + s.depth * 20 }}>
              <div className="flex items-center gap-2">
                <Icon size={14} className={s.spanType === "thinking" || s.spanType === "subagent" ? "text-violet" : "text-faint"} />
                <span className="text-foreground">{s.spanType}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{s.name}</span>
                <span className={cn("ml-auto font-mono text-xs", STATUS[s.status])}>{s.status}</span>
                {s.endedAt && <span className="w-16 text-right font-mono text-xs text-faint tabular">{s.endedAt - s.startedAt}ms</span>}
                {s.costMicroUsd > 0 && <span className="font-mono text-xs text-emerald tabular">{formatUsd(s.costMicroUsd)}</span>}
              </div>
              {s.text && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{s.text}</p>}
              {s.error && <p className="mt-1 text-xs text-rose">{s.error}</p>}
              {s.diff && <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px]">{s.diff}</pre>}
            </li>
          );
        })}
      </ul>

      {t.context && (
        <div className="mt-6 rounded-xl border border-border bg-panel p-4">
          <div className="flex justify-between text-sm">
            <span>Context</span>
            <span className="font-mono text-muted-foreground tabular">
              {t.context.used.toLocaleString()} / {t.context.limit.toLocaleString()} tokens
            </span>
          </div>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/5">
            {CONTEXT_CATEGORIES.map((c, i) => (
              <span key={c} title={c} style={{ width: `${(t.context!.breakdown[c] * 100) / t.context!.limit}%`, background: CTX_COLOR[i] }} />
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8 flex items-center gap-3">
        <span className="font-semibold tracking-[0.18em]">V.I.S.O.R.</span>
        <span className="rounded-md border border-border-strong px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
          Phase 1 · foundation
        </span>
        <nav className="ml-4 hidden gap-3 text-sm text-muted-foreground sm:flex">
          {[1, 2, 3].map((n) => (
            <a key={n} href={`/preview/${n}`} className="hover:text-foreground">
              Design {n}
            </a>
          ))}
        </nav>
        <div className="ml-auto">{right}</div>
      </header>
      {children}
    </div>
  );
}
