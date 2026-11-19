import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, ChevronDown, Gauge, History, LayoutList, PanelRight, RotateCcw, Search, Settings, Wallet, X } from "lucide-react";
import { formatUsd } from "@shared/money";
import { BreakpointCard } from "@/components/visor/breakpoint-card";
import { CommandPalette } from "@/components/visor/command-palette";
import { CompactionTimeline, ContextSummary } from "@/components/visor/context-panel";
import { CostReceipt } from "@/components/visor/cost-receipt";
import { DesignSwitcher } from "@/components/visor/design-switcher";
import { Payload } from "@/components/visor/payload";
import { Kbd, Ring, Usd, fmtTokens } from "@/components/visor/primitives";
import { SpanStream } from "@/components/visor/span-stream";
import { useHarness } from "@/hooks/use-harness";
import { LEDGER, PAST_SESSIONS, WALLET_BEFORE_MICRO, WORKSPACE } from "@/lib/mock-data";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";
import { MODEL_LABEL, SessionStatus, cacheHit } from "./hud";
import { NoToken } from "./no-token";

type SheetTab = "span" | "context" | "cost";

/**
 * Design 2 · Linear Focus. A calm canvas: a one-line telemetry strip, a slim
 * icon rail, roomy cards with side-by-side diffs, a floating override dock,
 * and a frosted inspector that slides over only when asked.
 */
export function Design2Linear() {
  const h = useHarness();
  const { model } = h;
  const [tab, setTab] = useState<SheetTab>("span");
  const [drawer, setDrawer] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const open = h.ui.inspectorOpen;
  const openSheet = (t: SheetTab) => {
    setTab(t);
    h.ui.setInspector(true);
  };

  if (!h.token) return <NoToken />;

  const ctx = model.contextHistory.at(-1);
  const cap = model.session?.capMicroUsd ?? null;

  return (
    <div className="flex h-full bg-background">
      {/* Slim icon rail */}
      <nav className="hidden w-[52px] shrink-0 flex-col items-center gap-1 border-r border-border py-3 sm:flex" aria-label="Main">
        <span className="mb-3 font-mono text-[11px] font-semibold tracking-widest text-foreground">V</span>
        <RailButton label="Sessions" active={drawer} onClick={() => setDrawer((d) => !d)} onHover={() => setDrawer(true)}>
          <History size={17} />
        </RailButton>
        <RailButton label="Search ⌘K" onClick={() => h.ui.setPalette(true)}>
          <Search size={17} />
        </RailButton>
        <RailButton label="Inspector" active={open} onClick={() => h.ui.setInspector(!open)}>
          <PanelRight size={17} />
        </RailButton>
        <RailButton label="Cost" onClick={() => openSheet("cost")}>
          <Gauge size={17} />
        </RailButton>
        <span className="mt-auto" />
        <RailButton label="Settings">
          <Settings size={17} />
        </RailButton>
      </nav>

      {/* Toggleable session drawer */}
      <AnimatePresence>
        {drawer && (
          <motion.aside
            initial={{ x: -12, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -12, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onMouseLeave={() => setDrawer(false)}
            className="fixed bottom-0 left-[52px] top-0 z-40 w-64 border-r border-border bg-panel/95 p-3 backdrop-blur-xl"
          >
            <p className="px-2 pb-2 text-[11px] text-faint">{WORKSPACE.name}</p>
            <div className="flex items-center gap-2 rounded-md bg-white/[0.06] px-2 py-2 text-[13px]">
              <i className="size-1.5 rounded-full bg-amber" />
              <span className="truncate">{model.session?.title ?? "Starting…"}</span>
              <Usd micro={model.cost.total} className="ml-auto font-mono text-[11px] text-faint" />
            </div>
            {PAST_SESSIONS.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] text-muted-foreground hover:bg-white/[0.04]">
                <i className={cn("size-1.5 rounded-full", s.status === "completed" ? "bg-emerald" : "bg-rose")} />
                <span className="truncate">{s.title}</span>
                <span className="ml-auto text-[11px] text-faint">{s.when}</span>
              </div>
            ))}
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact telemetry strip */}
        <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
          <button type="button" className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] hover:bg-white/5">
            {WORKSPACE.name} <ChevronDown size={13} className="text-faint" />
          </button>
          <span className="hidden text-[13px] text-faint md:inline">/ {model.session?.title ?? "…"}</span>
          <SessionStatus model={model} />

          <button
            type="button"
            onClick={() => h.ui.setPalette(true)}
            className="mx-auto hidden h-7 w-64 items-center gap-2 rounded-full border border-border bg-white/[0.03] px-3 text-[12px] text-faint transition-colors hover:border-border-strong md:flex"
          >
            <Search size={13} /> Search or run a command <Kbd className="ml-auto">⌘K</Kbd>
          </button>

          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <button type="button" title={`Context ${ctx ? Math.round((ctx.used * 100) / ctx.limit) : 0}%`} onClick={() => openSheet("context")} className="flex items-center gap-1.5 text-[11px] text-faint hover:text-foreground">
              <Ring value={ctx ? ctx.used / ctx.limit : 0} tone="#7aa2ff" label="Context window used" />
              <span className="hidden font-mono lg:inline">{ctx ? fmtTokens(ctx.used) : "0"}</span>
            </button>
            {cap && (
              <button type="button" title="Budget cap used" onClick={() => openSheet("cost")} className="flex items-center gap-1.5 text-[11px] text-faint hover:text-foreground">
                <Ring value={model.cost.total / cap} tone={model.cost.total * 5 >= cap * 4 ? "#fbbf24" : "#34d399"} label="Budget used" />
                <span className="hidden font-mono lg:inline">{Math.round((model.cost.total * 100) / cap)}%</span>
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setWalletOpen((w) => !w)}
                className="flex h-7 items-center gap-2 rounded-full bg-emerald/10 px-3 font-mono text-[12px] text-emerald"
                aria-expanded={walletOpen}
              >
                <Usd micro={model.cost.total} />
                <Wallet size={13} className="text-emerald/70" />
              </button>
              <AnimatePresence>{walletOpen && <WalletPopover model={model} onClose={() => setWalletOpen(false)} />}</AnimatePresence>
            </div>
          </div>
        </header>

        {/* Spacious canvas */}
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[880px] px-4 pb-64 pt-8 sm:px-8">
            <SpanStream
              model={model}
              opts={{ spacious: true, diffMode: "split", breakpoint: "none", selectedId: h.selectedSpanId, onSelect: (id) => (h.select(id), openSheet("span")) }}
            />
            {model.session?.status === "completed" && (
              <div className="mt-8 flex justify-center">
                <button type="button" onClick={() => void h.start()} className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground">
                  <RotateCcw size={14} /> Replay the session
                </button>
              </div>
            )}
          </div>
        </main>

        {/* Floating override dock + prompt bar */}
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 sm:left-[52px]">
          <div className="mx-auto max-w-[760px] px-4 pb-5">
            <AnimatePresence>
              {model.paused && (
                <motion.div
                  key={model.paused.spanId}
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="pointer-events-auto mb-3"
                >
                  <BreakpointCard paused={model.paused} variant="dock" />
                </motion.div>
              )}
            </AnimatePresence>
            <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border-strong bg-[#14171d]/90 px-4 py-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
              <span className="flex-1 truncate text-[14px] text-faint">Ask Claude to change something…</span>
              <span className="hidden text-[12px] text-faint sm:inline">{MODEL_LABEL[model.session?.modelId ?? ""] ?? "Opus 5.5"} · {model.session?.effort ?? "medium"}</span>
              <span className="flex size-8 items-center justify-center rounded-full bg-white text-[#0b0d12]">
                <ArrowUp size={15} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-over inspector */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => h.ui.setInspector(false)} className="fixed inset-0 z-40 bg-black/30" />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 40 }}
              className="fixed inset-y-0 right-0 z-50 flex w-[min(440px,100vw)] flex-col border-l border-border-strong bg-[#101318]/85 backdrop-blur-2xl"
            >
              <div className="flex items-center gap-1 border-b border-border px-3 py-2.5">
                {(["span", "context", "cost"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn("rounded-md px-2.5 py-1 text-[13px] capitalize", tab === t ? "bg-white/10 text-foreground" : "text-faint hover:text-foreground")}
                  >
                    {t === "span" ? "Payload" : t}
                  </button>
                ))}
                <button type="button" aria-label="Close inspector" onClick={() => h.ui.setInspector(false)} className="ml-auto rounded-md p-1 text-faint hover:bg-white/10 hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {tab === "span" && <Payload model={model} spanId={h.selectedSpanId} />}
                {tab === "context" && (
                  <div className="space-y-6">
                    <ContextSummary model={model} />
                    <CompactionTimeline model={model} />
                  </div>
                )}
                {tab === "cost" && <CostReceipt model={model} />}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <CommandPalette model={model} onSelectSpan={(id) => (h.select(id), openSheet("span"))} />
      <DesignSwitcher current={2} />
    </div>
  );
}

function RailButton({ label, children, active, onClick, onHover }: { label: string; children: React.ReactNode; active?: boolean; onClick?: () => void; onHover?: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      onMouseEnter={onHover}
      className={cn("flex size-9 items-center justify-center rounded-lg transition-colors", active ? "bg-white/10 text-foreground" : "text-faint hover:bg-white/5 hover:text-foreground")}
    >
      {children}
    </button>
  );
}

function WalletPopover({ model, onClose }: { model: TraceModel; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6 }}
      className="absolute right-0 top-9 z-50 w-72 rounded-xl border border-border-strong bg-[#14171d] p-4 shadow-2xl"
      onMouseLeave={onClose}
    >
      <p className="text-[11px] text-faint">Prepaid credit</p>
      <p className="mt-1 font-mono text-2xl tabular">
        <Usd micro={WALLET_BEFORE_MICRO - model.cost.total} decimals={2} />
      </p>
      <div className="mt-3 space-y-1.5 font-mono text-[12px]">
        <Row label="This session" value={formatUsd(model.cost.total)} />
        <Row label="Cache saved" value={`−${formatUsd(model.cost.cacheSavings)}`} tone="text-emerald" />
        <Row label="Cache hit rate" value={`${cacheHit(model)}%`} />
      </div>
      <p className="mb-1.5 mt-4 text-[11px] text-faint">Recent ledger</p>
      <div className="space-y-1 text-[12px]">
        {LEDGER.slice(-3).map((l) => (
          <div key={l.id} className="flex gap-2">
            <span className="truncate text-muted-foreground">{l.note}</span>
            <span className={cn("ml-auto shrink-0 font-mono", l.amountMicroUsd > 0 ? "text-emerald" : "text-faint")}>{formatUsd(l.amountMicroUsd, 2)}</span>
          </div>
        ))}
      </div>
      <button type="button" className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] py-2 text-[12.5px] hover:bg-white/10">
        <LayoutList size={13} /> Ledger & CSV export
      </button>
    </motion.div>
  );
}

function Row({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex">
      <span className="text-faint">{label}</span>
      <span className={cn("ml-auto tabular", tone)}>{value}</span>
    </div>
  );
}
