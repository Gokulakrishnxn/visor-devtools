import { useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Bell, Columns2, Download, Pause, Play, Radio, RotateCcw, Search, Square, Square as SquareIcon } from "lucide-react";
import { formatUsd } from "@shared/money";
import { BreakpointCard } from "@/components/visor/breakpoint-card";
import { CodeView, DiffView } from "@/components/visor/code";
import { CommandPalette } from "@/components/visor/command-palette";
import { CompactionTimeline, ContextSummary } from "@/components/visor/context-panel";
import { CostReceipt } from "@/components/visor/cost-receipt";
import { DesignSwitcher } from "@/components/visor/design-switcher";
import { Payload } from "@/components/visor/payload";
import { Kbd, SPAN_ICON, SPAN_LABEL, StatusDot, Usd, fmtMs, spanTone } from "@/components/visor/primitives";
import { useHarness } from "@/hooks/use-harness";
import { LEDGER, MCP_SERVERS, WALLET_BEFORE_MICRO, WORKSPACE } from "@/lib/mock-data";
import { walkOrder, type TraceModel, type TraceSpan } from "@/lib/trace-model";
import { cn } from "@/lib/utils";
import { useSession, useSessionEvents } from "@/stores/session-store";
import { CostPill, MODEL_LABEL, SessionStatus, WalletPill } from "./hud";
import { NoToken } from "./no-token";

type Tab = "trace" | "context" | "overrides" | "ledger";
const TABS: { id: Tab; label: string }[] = [
  { id: "trace", label: "Live Trace" },
  { id: "context", label: "Context & Compaction" },
  { id: "overrides", label: "MCP & Overrides" },
  { id: "ledger", label: "Cost Ledger" },
];

const BAR: Partial<Record<TraceSpan["spanType"], string>> = {
  llm: "bg-indigo/70",
  thinking: "bg-violet/70",
  read: "bg-white/30",
  edit: "bg-white/45",
  bash: "bg-white/35",
  mcp: "bg-indigo/45",
  subagent: "bg-violet/35 ring-1 ring-violet/50",
  compaction: "bg-amber/40",
};

/**
 * Design 3 · Mission Deck. Observability first: an interactive span
 * waterfall on top, a split workspace of draggable tabs below, a breakpoint
 * banner with a diffed JSON editor, an alert feed, and session replay.
 */
export function Design3Deck() {
  const h = useHarness({ scrollIntoView: false });
  const { model } = h;
  const events = useSessionEvents();
  const cursor = useSession((s) => s.cursor);
  const setCursor = useSession((s) => s.setCursor);
  const stop = useSession((s) => s.stop);
  const [panes, setPanes] = useState<Tab[]>(["trace", "context"]);
  const [split, setSplit] = useState(true);
  const [fallHeight, setFallHeight] = useState(220);

  if (!h.token) return <NoToken />;
  const live = cursor === null;
  const finished = model.session?.status === "completed" || model.session?.status === "aborted_budget";

  const setPane = (i: number, tab: Tab) => setPanes((p) => p.map((t, j) => (j === i ? tab : t)));

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-3">
        <span className="shrink-0 text-[13px] font-semibold tracking-[0.16em]">V.I.S.O.R.</span>
        <span className="hidden font-mono text-[11px] text-faint md:inline">mission deck</span>
        <span className="min-w-0 truncate text-[13px] text-muted-foreground">
          <span className="hidden sm:inline">{WORKSPACE.name} / </span>
          {model.session?.title ?? "…"}
        </span>
        <span className="hidden shrink-0 sm:inline-flex">
          <SessionStatus model={model} />
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="hidden rounded-md border border-border px-2 py-0.5 text-[11.5px] text-muted-foreground sm:inline">
            {MODEL_LABEL[model.session?.modelId ?? ""] ?? "Opus 5.5"}
          </span>
          <CostPill model={model} />
          <span className="hidden lg:inline-flex">
            <WalletPill model={model} />
          </span>
          <button type="button" aria-label="Search" onClick={() => h.ui.setPalette(true)} className="flex h-7 items-center gap-2 rounded-md border border-border px-2 text-[12px] text-faint hover:text-foreground">
            <Search size={13} /> <Kbd className="hidden sm:inline">⌘K</Kbd>
          </button>
          {finished ? (
            <button type="button" onClick={() => void h.start()} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[12px] hover:bg-white/5">
              <RotateCcw size={13} /> <span className="hidden sm:inline">New run</span>
            </button>
          ) : (
            <button type="button" onClick={() => void stop()} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[12px] hover:bg-white/5">
              <Square size={13} /> <span className="hidden sm:inline">Stop</span>
            </button>
          )}
        </div>
      </header>

      {/* Breakpoint & security banner */}
      {model.paused && live && <BreakpointCard key={model.paused.spanId} paused={model.paused} variant="banner" showDiff />}

      {/* Span waterfall */}
      <section style={{ height: fallHeight }} className="relative shrink-0 border-b border-border" aria-label="Span waterfall">
        <Waterfall model={model} selectedId={h.selectedSpanId} onSelect={(id) => (h.select(id), setPane(0, "trace"))} />
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize waterfall"
          onPointerDown={(e) => {
            const startY = e.clientY;
            const start = fallHeight;
            const move = (ev: PointerEvent) => setFallHeight(Math.max(120, Math.min(480, start + ev.clientY - startY)));
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
          className="absolute inset-x-0 -bottom-1 z-10 h-2 cursor-row-resize hover:bg-indigo/30"
        />
      </section>

      {/* Replay scrubber */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-1.5 text-[11.5px]">
        <button
          type="button"
          onClick={() => setCursor(live ? Math.max(0, events.length - 1) : null)}
          className={cn("flex items-center gap-1.5 rounded px-2 py-0.5", live ? "bg-rose/15 text-rose" : "bg-white/[0.06] text-muted-foreground")}
          title={live ? "Pause on this moment" : "Jump back to live"}
        >
          {live ? <Radio size={12} /> : <Play size={12} />} {live ? "Live" : "Replay"}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(1, events.length)}
          value={cursor ?? events.length}
          onChange={(e) => {
            const n = Number(e.target.value);
            setCursor(n >= events.length ? null : n);
          }}
          className="h-1 flex-1 cursor-pointer accent-indigo"
          aria-label="Replay position"
        />
        <span className="w-28 text-right font-mono text-faint tabular">
          {cursor ?? events.length} / {events.length} events
        </span>
        {!live && (
          <button type="button" onClick={() => setCursor(null)} className="text-indigo hover:underline">
            <Pause size={12} className="inline" /> back to live
          </button>
        )}
      </div>

      {/* Split workspace */}
      <div className="flex min-h-0 flex-1">
        {(split ? [0, 1] : [0]).map((i) => (
          <Pane key={i} tab={panes[i]!} onTab={(t) => setPane(i, t)} className={cn(i === 1 && "hidden border-l border-border lg:flex")}>
            {panes[i] === "trace" && <TracePane model={model} selectedId={h.selectedSpanId} onSelect={h.select} />}
            {panes[i] === "context" && (
              <div className="grid gap-6 p-4 xl:grid-cols-2">
                <ContextSummary model={model} />
                <div>
                  <p className="mb-3 text-[12px] text-faint">Context per turn · compaction boundaries</p>
                  <CompactionTimeline model={model} />
                </div>
              </div>
            )}
            {panes[i] === "overrides" && <OverridesPane model={model} onSelect={(id) => (h.select(id), setPane(0, "trace"))} />}
            {panes[i] === "ledger" && <LedgerPane model={model} />}
          </Pane>
        ))}
        <button
          type="button"
          onClick={() => setSplit((s) => !s)}
          title={split ? "Single pane" : "Split view"}
          aria-label="Toggle split view"
          className="hidden w-8 shrink-0 items-start justify-center border-l border-border pt-2 text-faint hover:text-foreground lg:flex"
        >
          {split ? <SquareIcon size={14} /> : <Columns2 size={14} />}
        </button>
      </div>

      <CommandPalette model={model} onSelectSpan={(id) => (h.select(id), setPane(0, "trace"))} />
      <DesignSwitcher current={3} />
    </div>
  );
}

function Pane({ tab, onTab, children, className }: { tab: Tab; onTab: (t: Tab) => void; children: ReactNode; className?: string }) {
  const [over, setOver] = useState(false);
  return (
    <section className={cn("flex min-w-0 flex-1 flex-col", className)}>
      <div
        role="tablist"
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          const t = e.dataTransfer.getData("text/visor-tab") as Tab;
          if (t) onTab(t);
        }}
        className={cn("flex shrink-0 gap-0.5 overflow-x-auto border-b border-border px-2 pt-1.5", over && "bg-indigo/10")}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/visor-tab", t.id)}
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={cn(
              "-mb-px shrink-0 rounded-t-md border border-b-0 px-3 py-1.5 text-[12.5px]",
              tab === t.id ? "border-border bg-background text-foreground" : "border-transparent text-faint hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function Waterfall({ model, selectedId, onSelect }: { model: TraceModel; selectedId: string | null; onSelect: (id: string) => void }) {
  const order = walkOrder(model);
  const t0 = model.firstAt;
  const t1 = Math.max(model.lastAt, t0 + 1);
  const span = t1 - t0;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b border-border py-1 pl-48 pr-4 font-mono text-[10.5px] text-faint">
        <div className="relative h-3 flex-1">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 tabular" style={{ left: `${t * 100}%` }}>
              {fmtMs(Math.round(span * t))}
            </span>
          ))}
        </div>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto py-1">
        {order.length === 0 && <p className="px-4 py-6 text-[12.5px] text-faint">Waiting for the first span…</p>}
        {order.map((id) => {
          const s = model.spans[id]!;
          const start = (s.startedAt - t0) / span;
          const end = ((s.endedAt ?? model.lastAt) - t0) / span;
          const Icon = SPAN_ICON[s.spanType];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={cn("flex h-6 w-full items-center pr-4 text-left hover:bg-white/[0.03]", selectedId === id && "bg-indigo/10")}
            >
              <span className="flex w-48 shrink-0 items-center gap-1.5 truncate pr-2 text-[11.5px] text-muted-foreground" style={{ paddingLeft: 10 + s.depth * 12 }}>
                <Icon size={12} className={cn("shrink-0", spanTone(s.spanType))} />
                <span className="truncate">{s.spanType === "llm" ? "llm" : s.name}</span>
              </span>
              <span className="relative h-full flex-1">
                {ticks.slice(1, -1).map((t) => (
                  <i key={t} className="absolute inset-y-0 w-px bg-white/[0.04]" style={{ left: `${t * 100}%` }} />
                ))}
                <span
                  className={cn(
                    "absolute top-1/2 h-3 -translate-y-1/2 rounded-sm transition-[width] duration-300",
                    BAR[s.spanType] ?? "bg-white/30",
                    (s.status === "denied" || s.status === "error") && "bg-rose/70",
                    s.status === "paused" && "animate-pulse bg-amber",
                    selectedId === id && "outline outline-1 outline-white/70",
                  )}
                  style={{ left: `${start * 100}%`, width: `max(3px, ${(end - start) * 100}%)` }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TracePane({ model, selectedId, onSelect }: { model: TraceModel; selectedId: string | null; onSelect: (id: string) => void }) {
  const order = walkOrder(model);
  const s = selectedId ? model.spans[selectedId] : undefined;
  return (
    <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <table className="w-full self-start text-[12.5px]">
        <thead className="sticky top-0 bg-background text-left text-[10.5px] uppercase tracking-wider text-faint">
          <tr>
            <th className="px-3 py-2 font-normal">Span</th>
            <th className="px-2 py-2 text-right font-normal">Latency</th>
            <th className="px-3 py-2 text-right font-normal">Cost</th>
          </tr>
        </thead>
        <tbody>
          {order.map((id) => {
            const sp = model.spans[id]!;
            const Icon = SPAN_ICON[sp.spanType];
            return (
              <tr key={id} onClick={() => onSelect(id)} className={cn("cursor-pointer border-t border-border hover:bg-white/[0.03]", selectedId === id && "bg-indigo/10")}>
                <td className="max-w-0 px-3 py-1.5">
                  <span className="flex items-center gap-2" style={{ paddingLeft: sp.depth * 14 }}>
                    <StatusDot status={sp.status} />
                    <Icon size={13} className={cn("shrink-0", spanTone(sp.spanType))} />
                    <span className="shrink-0">{SPAN_LABEL[sp.spanType]}</span>
                    <span className="truncate font-mono text-[11.5px] text-faint">{sp.spanType === "llm" ? "" : sp.name}</span>
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-[11.5px] text-faint tabular">{fmtMs(sp.endedAt ? sp.endedAt - sp.startedAt : undefined)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-[11.5px] tabular">{sp.costMicroUsd ? <Usd micro={sp.costMicroUsd} className="text-emerald/90" /> : <span className="text-faint">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-border p-4 xl:border-l xl:border-t-0">
        {!s && <p className="text-[12.5px] text-faint">Click a waterfall bar or a row (or press J/K) to inspect a span.</p>}
        {s && (
          <div className="space-y-4">
            {s.diff && (
              <div className="overflow-hidden rounded-lg border border-border bg-[#0d1117]">
                <DiffView diff={s.diff} path={s.filePath} />
              </div>
            )}
            {s.spanType === "read" && typeof s.output === "string" && (
              <div className="overflow-hidden rounded-lg border border-border bg-[#0d1117]">
                <CodeView code={s.output} path={s.filePath} />
              </div>
            )}
            {s.text && (
              <pre className={cn("whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-[12.5px]", s.spanType === "thinking" ? "italic text-violet/90" : "font-mono text-muted-foreground")}>{s.text}</pre>
            )}
            <Payload model={model} spanId={s.spanId} />
          </div>
        )}
      </div>
    </div>
  );
}

function OverridesPane({ model, onSelect }: { model: TraceModel; onSelect: (id: string) => void }) {
  const overrides = Object.values(model.spans).filter((s) => s.breakpoint);
  const mcp = Object.values(model.spans).filter((s) => s.spanType === "mcp");
  return (
    <div className="grid gap-6 p-4 xl:grid-cols-2">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[12px] text-faint">
          <Bell size={12} /> Trigger & alert feed
        </p>
        <ul className="space-y-1.5">
          {model.alerts.length === 0 && <li className="text-[12.5px] text-faint">No alerts yet.</li>}
          {[...model.alerts].reverse().map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => a.spanId && onSelect(a.spanId)} className="flex w-full items-start gap-2 rounded-lg border border-border px-3 py-2 text-left text-[12.5px] hover:bg-white/[0.03]">
                <AlertTriangle size={13} className={cn("mt-0.5 shrink-0", a.level === "danger" ? "text-rose" : a.level === "warning" ? "text-amber" : "text-indigo")} />
                <span className="min-w-0">
                  <span className="block text-foreground">{a.title}</span>
                  <span className="block truncate text-faint">{a.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mb-2 mt-6 text-[12px] text-faint">Policy audit log</p>
        {overrides.length === 0 && <p className="text-[12.5px] text-faint">No overrides yet.</p>}
        {overrides.map((s) => (
          <div key={s.spanId} className="mb-1.5 flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 font-mono text-[11.5px]">
            <span className="text-foreground">{s.breakpoint!.toolName}</span>
            <span className="text-faint">{s.breakpoint!.rule}</span>
            <span className={cn("ml-auto", !s.breakpoint!.decision ? "text-amber" : s.breakpoint!.decision === "approved" ? "text-emerald" : s.breakpoint!.decision === "edited" ? "text-amber" : "text-rose")}>
              {s.breakpoint!.decision ?? "paused"}
            </span>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-2 text-[12px] text-faint">MCP servers</p>
        <div className="mb-6 grid grid-cols-3 gap-2">
          {MCP_SERVERS.map((m) => (
            <div key={m.name} className="rounded-lg border border-border px-3 py-2">
              <span className="flex items-center gap-1.5 text-[12.5px]">
                <i className={cn("size-1.5 rounded-full", m.online ? "bg-emerald" : "bg-rose")} /> {m.name}
              </span>
              <span className="font-mono text-[11px] text-faint">{m.online ? `${m.tools} tools` : "offline"}</span>
            </div>
          ))}
        </div>
        <p className="mb-2 text-[12px] text-faint">MCP JSON-RPC calls</p>
        {mcp.length === 0 && <p className="text-[12.5px] text-faint">No MCP calls yet.</p>}
        {mcp.map((s) => (
          <button key={s.spanId} type="button" onClick={() => onSelect(s.spanId)} className="mb-1.5 flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-[12.5px] hover:bg-white/[0.03]">
            <StatusDot status={s.status} /> <span className="font-mono">{s.name}</span>
            <span className="ml-auto font-mono text-[11px] text-faint">{fmtMs(s.endedAt ? s.endedAt - s.startedAt : undefined)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LedgerPane({ model }: { model: TraceModel }) {
  const liveRow = { id: "live", type: "debit" as const, amountMicroUsd: -model.cost.total, note: `${model.session?.title ?? "Live session"} (live)`, when: "Now" };
  const rows = [...LEDGER, liveRow];
  let balance = 0;
  const withBalance = rows.map((r) => ({ ...r, balance: (balance += r.amountMicroUsd) }));
  const csv = () => {
    const lines = ["when,type,note,amount_micro_usd,balance_after_micro_usd", ...withBalance.map((r) => `${r.when},${r.type},"${r.note.replace(/"/g, '""')}",${r.amountMicroUsd},${r.balance}`)];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "visor-ledger.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const top = Object.values(model.spans)
    .filter((s) => s.costMicroUsd > 0)
    .sort((a, b) => b.costMicroUsd - a.costMicroUsd)
    .slice(0, 5);
  return (
    <div className="grid gap-6 p-4 xl:grid-cols-2">
      <CostReceipt model={model} />
      <div>
        <div className="mb-2 flex items-center">
          <p className="text-[12px] text-faint">Credit ledger</p>
          <button type="button" onClick={csv} className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11.5px] text-muted-foreground hover:text-foreground">
            <Download size={12} /> Export CSV
          </button>
        </div>
        <table className="w-full font-mono text-[11.5px]">
          <tbody>
            {withBalance.map((r) => (
              <tr key={r.id} className="border-b border-border tabular">
                <td className="py-1.5 pr-2 text-faint">{r.when}</td>
                <td className="py-1.5 pr-2 text-muted-foreground">
                  <span className="block max-w-[200px] truncate" title={r.note}>
                    {r.note}
                  </span>
                </td>
                <td className={cn("py-1.5 pr-2 text-right", r.amountMicroUsd > 0 ? "text-emerald" : "text-foreground")}>{formatUsd(r.amountMicroUsd)}</td>
                <td className="py-1.5 text-right text-faint">{formatUsd(r.balance, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-right font-mono text-[11.5px] text-muted-foreground">
          Balance <Usd micro={WALLET_BEFORE_MICRO - model.cost.total} decimals={2} className="text-foreground" />
        </p>
        <p className="mb-2 mt-6 text-[12px] text-faint">Most expensive spans</p>
        {top.map((s) => (
          <div key={s.spanId} className="flex items-center gap-2 py-1 text-[12px]">
            <span className="truncate text-muted-foreground">
              {SPAN_LABEL[s.spanType]} · {model.turns.findIndex((t) => t.turnId === s.turnId) + 1 ? `turn ${model.turns.findIndex((t) => t.turnId === s.turnId) + 1}` : ""}
            </span>
            <span className="relative ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="absolute inset-y-0 left-0 bg-emerald/70" style={{ width: `${(s.costMicroUsd / (top[0]?.costMicroUsd || 1)) * 100}%` }} />
            </span>
            <Usd micro={s.costMicroUsd} className="w-16 text-right font-mono text-emerald/90" />
          </div>
        ))}
      </div>
    </div>
  );
}
