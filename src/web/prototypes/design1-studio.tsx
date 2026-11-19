import { useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, FolderGit2, PanelLeft, PanelRight, Plus, RotateCcw, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/visor/command-palette";
import { CompactionTimeline, ContextSummary } from "@/components/visor/context-panel";
import { CostReceipt } from "@/components/visor/cost-receipt";
import { DesignSwitcher } from "@/components/visor/design-switcher";
import { Kbd, Usd } from "@/components/visor/primitives";
import { Payload } from "@/components/visor/payload";
import { SpanStream } from "@/components/visor/span-stream";
import { useHarness } from "@/hooks/use-harness";
import { MCP_SERVERS, PAST_SESSIONS, PROJECT_MEMORY, WORKSPACE } from "@/lib/mock-data";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";
import { useSession } from "@/stores/session-store";
import { BudgetBar, CachePill, CostPill, MODEL_LABEL, SessionStatus, WalletPill } from "./hud";
import { NoToken } from "./no-token";

type Tab = "context" | "payload" | "cost";

/**
 * Design 1 · Studio Tri-Pane. The classic macOS developer studio: sessions
 * and MCP health on the left, the live stream in the middle, a tabbed
 * inspector on the right. Maximum at-a-glance visibility.
 */
export function Design1Studio() {
  const h = useHarness();
  const stop = useSession((s) => s.stop);
  const [tab, setTab] = useState<Tab>("context");
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const { model } = h;

  if (!h.token) return <NoToken />;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Top HUD bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
        <button type="button" aria-label="Toggle sidebar" onClick={() => setLeft((v) => !v)} className="hidden size-8 items-center justify-center rounded-md text-faint hover:bg-white/5 hover:text-foreground lg:flex">
          <PanelLeft size={16} />
        </button>
        <span className="text-[13px] font-semibold tracking-[0.16em]">V.I.S.O.R.</span>
        <span className="hidden items-center gap-1.5 text-[13px] text-muted-foreground md:flex">
          <FolderGit2 size={14} className="text-faint" /> {WORKSPACE.name}
          <span className="text-faint">/ {WORKSPACE.branch}</span>
        </span>
        <span className="rounded-md border border-border-strong px-2 py-0.5 text-[11.5px] text-muted-foreground">
          {MODEL_LABEL[model.session?.modelId ?? ""] ?? "Opus 5.5"} · {model.session?.effort ?? "medium"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <CostPill model={model} />
          <span className="hidden xl:inline-flex">
            <CachePill model={model} />
          </span>
          <span className="hidden md:inline-flex">
            <WalletPill model={model} />
          </span>
          <BudgetBar model={model} className="hidden lg:flex" />
          <button
            type="button"
            onClick={() => h.ui.setPalette(true)}
            className="hidden h-7 items-center gap-2 rounded-md border border-border px-2 text-[12px] text-faint hover:text-foreground sm:flex"
          >
            <Search size={13} /> <Kbd>⌘K</Kbd>
          </button>
          {model.session?.status === "completed" || model.session?.status === "aborted_budget" ? (
            <Button size="sm" variant="outline" onClick={() => void h.start()}>
              <RotateCcw /> Replay
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => void stop()} aria-label="Stop session">
              <Square /> <span className="hidden sm:inline">Stop</span>
            </Button>
          )}
          <button type="button" aria-label="Toggle inspector" onClick={() => setRight((v) => !v)} className="hidden size-8 items-center justify-center rounded-md text-faint hover:bg-white/5 hover:text-foreground xl:flex">
            <PanelRight size={16} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar */}
        {left && (
          <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-panel lg:flex">
            <div className="p-3">
              <Button variant="outline" size="sm" className="w-full" onClick={() => void h.start()}>
                <Plus /> New session
              </Button>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto px-2 text-[13px]">
              <p className="px-2 pb-1 pt-2 text-[11px] text-faint">{WORKSPACE.name}</p>
              <SidebarRow active dot={model.session?.status === "paused" ? "bg-amber animate-pulse" : model.session?.status === "completed" ? "bg-emerald" : "bg-white/50 animate-pulse"} title={model.session?.title ?? "Starting…"} cost={model.cost.total} />
              {PAST_SESSIONS.map((s) => (
                <SidebarRow key={s.id} dot={s.status === "completed" ? "bg-emerald" : "bg-rose"} title={s.title} cost={s.costMicroUsd} />
              ))}
              <Section title="Project memory" icon={<BookOpen size={12} />}>
                <ul className="space-y-1.5 px-2 text-[12px] text-muted-foreground">
                  {PROJECT_MEMORY.map((m) => (
                    <li key={m} className="leading-snug">
                      {m}
                    </li>
                  ))}
                </ul>
              </Section>
            </nav>
            <div className="border-t border-border p-3">
              <p className="mb-2 text-[11px] text-faint">MCP servers</p>
              {MCP_SERVERS.map((s) => (
                <div key={s.name} className="flex items-center gap-2 py-1 text-[12.5px]">
                  <i className={cn("size-1.5 rounded-full", s.online ? "bg-emerald" : "bg-rose")} />
                  <span className="text-muted-foreground">{s.name}</span>
                  <span className="ml-auto font-mono text-[11px] text-faint">{s.online ? `${s.tools} tools` : "offline"}</span>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Center execution stage */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-border px-5 py-2.5">
            <h1 className="truncate text-[14px] font-medium">{model.session?.title ?? "Connecting to the local daemon…"}</h1>
            <SessionStatus model={model} />
            <span className="ml-auto hidden font-mono text-[11px] text-faint sm:block">J/K spans · A/E/D overrides</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
            <div className="mx-auto max-w-3xl">
              <SpanStream model={model} opts={{ selectedId: h.selectedSpanId, onSelect: (id) => (h.select(id), setTab("payload")) }} />
            </div>
          </div>
          <Composer model={model} />
        </main>

        {/* Right inspector rail */}
        {right && (
          <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-panel xl:flex">
            <div role="tablist" className="flex gap-1 border-b border-border px-2 pt-2">
              {(["context", "payload", "cost"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn("-mb-px border-b-2 px-3 pb-2 text-[13px] capitalize", tab === t ? "border-indigo text-foreground" : "border-transparent text-faint hover:text-foreground")}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {tab === "context" && (
                <div className="space-y-6">
                  <ContextSummary model={model} />
                  <div>
                    <p className="mb-3 text-[12px] text-faint">Compaction timeline</p>
                    <CompactionTimeline model={model} />
                  </div>
                </div>
              )}
              {tab === "payload" && <Payload model={model} spanId={h.selectedSpanId} />}
              {tab === "cost" && <CostReceipt model={model} />}
            </div>
          </aside>
        )}
      </div>

      <CommandPalette model={model} onSelectSpan={(id) => (h.select(id), setTab("payload"))} />
      <DesignSwitcher current={1} />
    </div>
  );
}

function SidebarRow({ title, cost, dot, active }: { title: string; cost: number; dot: string; active?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", active ? "bg-white/[0.06] text-foreground" : "text-muted-foreground hover:bg-white/[0.03]")}>
      <i className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      <span className="truncate">{title}</span>
      <Usd micro={cost} className="ml-auto shrink-0 font-mono text-[11px] text-faint" />
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 px-2 py-1 text-[11px] text-faint hover:text-foreground">
        {icon} {title}
        <ChevronDown size={12} className={cn("ml-auto transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="pt-1">{children}</div>}
    </div>
  );
}

function Composer({ model }: { model: TraceModel }) {
  return (
    <div className="border-t border-border p-3">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card px-4 pb-3 pt-3">
        <p className="text-[13.5px] text-faint">Describe a task, / commands, @ files</p>
        <div className="mt-3 flex items-center gap-2 text-[12px]">
          <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">{MODEL_LABEL[model.session?.modelId ?? ""] ?? "Opus 5.5"}</span>
          <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">Effort: {model.session?.effort ?? "medium"}</span>
          {model.session?.capMicroUsd ? (
            <span className="rounded-md border border-border px-2 py-1 font-mono text-muted-foreground">
              Cap <Usd micro={model.session.capMicroUsd} decimals={2} />
            </span>
          ) : null}
          <span className="ml-auto text-faint">Mock runtime · $0 API spend</span>
        </div>
      </div>
    </div>
  );
}
