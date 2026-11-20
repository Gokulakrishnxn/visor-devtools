import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Maximize2, Menu, Minimize2, PanelLeftOpen, PanelRight, Search } from "lucide-react";
import { formatUsd } from "@shared/money";
import { CommandPalette } from "@/components/visor/command-palette";
import { Kbd } from "@/components/visor/primitives";
import { useHarness } from "@/hooks/use-harness";
import { useDesktopNotifications } from "@/hooks/use-notifications";
import { useSession } from "@/stores/session-store";
import { cn } from "@/lib/utils";
import { Composer, type ComposerValue } from "./composer";
import { Conversation } from "./conversation";
import { Inspector, type InspectorTab } from "./inspector";
import { NoToken } from "./no-token";
import { Resizer, usePref } from "./resizer";
import { ReviewPanel } from "./review-panel";
import { LedgerView, McpView, RulesView } from "./side-views";
import { Sidebar, type SidebarView } from "./sidebar";
import { WalletDialog } from "./wallet-dialog";

type RightPanel = { kind: "inspector" } | { kind: "review"; turnId: string; spanId: string } | null;

/**
 * The V.I.S.O.R. app: a calm conversation-first harness. Gray source-list
 * sidebar, centered chat with a foldable step list per turn, a rounded
 * composer, and a right panel for Review (diffs) or the Inspector.
 */
export function HarnessApp() {
  const [sidebarOpen, setSidebarOpen] = usePref("sidebar-open", true);
  const [sidebarWidth, setSidebarWidth] = usePref("sidebar-width", 264);
  const [panelWidth, setPanelWidth] = usePref("panel-width", 420);
  const [reviewWidth, setReviewWidth] = usePref("review-width", 560);
  // Full view hides both side panels and remembers what to bring back
  const [restore, setRestore] = useState<{ sidebar: boolean; panel: RightPanel } | null>(null);
  const h = useHarness({
    extraKeys: {
      "mod+b": () => setSidebarOpen(!sidebarOpen),
      "mod+.": () => toggleFull(),
    },
  });
  const { model } = h;
  useDesktopNotifications(model);
  const stop = useSession((s) => s.stop);
  const info = useSession((s) => s.info);
  const clearSession = useSession((s) => s.clear);
  const live = info?.runtime === "claude";
  const [view, setView] = useState<SidebarView>("chat");
  // Closed by default for a calm canvas; steps, file cards and the toolbar open it
  const [panel, setPanel] = useState<RightPanel>(null);
  const [tab, setTab] = useState<InspectorTab>("context");
  const [drawer, setDrawer] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const startError = useSession((s) => s.error);
  const [composer, setComposer] = useState<ComposerValue>({ modelId: "claude-opus-5-5", effort: "medium", capUsd: "5" });
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const spanCount = model.order.length;

  // Follow the stream while the reader is at the bottom
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [spanCount, model.paused, model.turns.length]);

  const full = restore !== null;
  function toggleFull() {
    if (restore) {
      setSidebarOpen(restore.sidebar);
      setPanel(restore.panel);
      setRestore(null);
    } else {
      setRestore({ sidebar: sidebarOpen, panel });
      setSidebarOpen(false);
      setPanel(null);
    }
  }

  if (!h.token) return <NoToken />;

  const cache = model.usage.cacheReadTokens + model.usage.inputTokens;
  const hit = cache ? Math.round((model.usage.cacheReadTokens * 100) / cache) : 0;
  const selectSpan = (id: string) => {
    h.select(id);
    if (panel?.kind !== "review") {
      setTab("payload");
      setPanel({ kind: "inspector" });
    }
  };
  const openReview = (turnId: string, spanId: string) => setPanel({ kind: "review", turnId, spanId });

  const sidebar = (
    <Sidebar
      model={model}
      width={drawer ? 284 : sidebarWidth}
      onCollapse={drawer ? () => setDrawer(false) : () => (setSidebarOpen(false), setRestore(null))}
      view={view}
      onView={(v) => (setView(v), setDrawer(false))}
      onNew={() => {
        setView("chat");
        setDrawer(false);
        // Only the mock runtime replays a demo; anything else (live, or not loaded yet) waits for your message
        clearSession();
        if (info?.runtime === "mock") void h.start({ capUsd: composer.capUsd, modelId: composer.modelId, effort: composer.effort });
      }}
      onSearch={() => h.ui.setPalette(true)}
      onWallet={() => (setDrawer(false), setWalletOpen(true))}
    />
  );

  const right =
    panel?.kind === "review" ? (
      <ReviewPanel model={model} turnId={panel.turnId} spanId={panel.spanId} onSpan={(id) => setPanel({ ...panel, spanId: id })} onClose={() => setPanel(null)} />
    ) : panel?.kind === "inspector" ? (
      <Inspector model={model} selectedId={h.selectedSpanId} onSelect={h.select} tab={tab} onTab={setTab} onClose={() => setPanel(null)} />
    ) : null;

  return (
    <div className="flex h-full bg-[var(--canvas)]">
      {sidebarOpen && (
        <div className="relative hidden md:flex">
          {sidebar}
          <Resizer side="right" width={sidebarWidth} min={208} max={420} reset={264} onWidth={setSidebarWidth} label="Resize sidebar" />
        </div>
      )}

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} className="fixed inset-0 z-40 bg-black/50 md:hidden" />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }} className="fixed inset-y-0 left-0 z-50 flex md:hidden">
              {sidebar}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className={cn("desktop-drag flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4", !sidebarOpen && "desktop-lights-left")}>
          <button type="button" aria-label="Open sidebar" onClick={() => setDrawer(true)} className="rounded-md p-1 text-white/60 hover:text-foreground md:hidden">
            <Menu size={18} />
          </button>
          {!sidebarOpen && (
            <button
              type="button"
              aria-label="Show sidebar (⌘B)"
              title="Show sidebar (⌘B)"
              onClick={() => (setSidebarOpen(true), setRestore(null))}
              className="hidden rounded-md p-1 text-white/60 hover:bg-white/[0.06] hover:text-foreground md:block"
            >
              <PanelLeftOpen size={18} />
            </button>
          )}
          <h1 className="min-w-0 truncate text-[15px] text-foreground">{view === "chat" ? (model.session?.title ?? "New session") : { rules: "Overrides & rules", mcp: "MCP servers", ledger: "Credit ledger" }[view]}</h1>
          <span className="ml-auto hidden items-center gap-2 font-mono text-[12px] text-white/45 sm:flex">
            <span className="text-emerald/85" title="Session cost">
              {formatUsd(model.cost.total)}
            </span>
            {hit > 0 && <span title="Prompt cache hit rate">{hit}% cached</span>}
          </span>
          <button type="button" onClick={() => h.ui.setPalette(true)} aria-label="Search" className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-white/50 hover:bg-white/[0.06] hover:text-foreground sm:ml-0 ml-auto">
            <Search size={16} /> <Kbd className="hidden lg:inline">⌘K</Kbd>
          </button>
          <button
            type="button"
            aria-label={full ? "Exit full view (⌘.)" : "Full view (⌘.)"}
            title={full ? "Exit full view (⌘.)" : "Full view (⌘.)"}
            onClick={toggleFull}
            className={cn("hidden rounded-md p-1.5 hover:bg-white/[0.06] md:block", full ? "text-indigo" : "text-white/50")}
          >
            {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            type="button"
            aria-label="Toggle panel"
            onClick={() => (setPanel(panel ? null : { kind: "inspector" }), setRestore(null))}
            className={cn("rounded-md p-1.5 hover:bg-white/[0.06]", panel ? "text-foreground" : "text-white/50")}
          >
            <PanelRight size={18} />
          </button>
        </header>

        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className={cn("mx-auto px-5 pb-10 pt-8 transition-[max-width] duration-300 sm:px-8", full ? "max-w-[1040px]" : "max-w-[820px]")}>
            {view === "chat" && (
              <>
                {model.turns.length === 0 && h.sessionId && (
                  <div className="pt-24 text-center text-[14px] text-white/45">
                    {model.session?.status === "running" || model.session?.status === "paused" || !model.session ? "Starting…" : "Nothing was recorded for this session."}
                  </div>
                )}
                {model.turns.length === 0 && !h.sessionId && (
                  <div className="pt-24 text-center">
                    <p className="text-[22px] font-medium text-foreground/90">{h.connection === "open" ? "What should Claude work on?" : "Connecting to the local harness…"}</p>
                    {h.connection === "open" && (
                      <p className="mt-2 text-[13.5px] text-white/45">
                        {live ? "Live mode: every prompt runs the real Claude Agent SDK in " : "Mock mode: a free demo run. Start the daemon with --live for real runs in "}
                        <span className="font-mono text-white/60">{info?.workspacePath}</span>
                      </p>
                    )}
                  </div>
                )}
                <Conversation model={model} selectedId={h.selectedSpanId} onSelect={selectSpan} onReview={openReview} />
              </>
            )}
            {view === "rules" && <RulesView model={model} onSelect={(id) => (setView("chat"), selectSpan(id))} />}
            {view === "mcp" && <McpView />}
            {view === "ledger" && <LedgerView model={model} onOpenWallet={() => setWalletOpen(true)} />}
          </div>
        </div>

        {view === "chat" && (
          <div className={cn("mx-auto w-full px-4 pb-4 sm:px-6", full ? "max-w-[1080px]" : "max-w-[860px]")}>
            <Composer
              model={model}
              value={composer}
              onChange={setComposer}
              onStop={() => void stop()}
              onSend={(prompt) => void h.start({ prompt, capUsd: composer.capUsd, modelId: composer.modelId, effort: composer.effort })}
            />
            {startError && <p className="mt-2 text-center text-[12.5px] text-rose">{startError}</p>}
            {info?.configError && <p className="mt-2 text-center text-[11.5px] text-rose/80">.visor.json is invalid, using defaults</p>}
          </div>
        )}
      </main>

      {/* Right panel: inline on wide screens, a sheet on smaller ones */}
      {right && (
        <>
          <aside style={{ width: panel?.kind === "review" ? reviewWidth : panelWidth }} className="relative hidden shrink-0 border-l border-white/[0.06] xl:block">
            <Resizer
              side="left"
              width={panel?.kind === "review" ? reviewWidth : panelWidth}
              min={320}
              max={820}
              reset={panel?.kind === "review" ? 560 : 420}
              onWidth={panel?.kind === "review" ? setReviewWidth : setPanelWidth}
              label="Resize panel"
            />
            {right}
          </aside>
          <div className="fixed inset-0 z-40 flex justify-end bg-black/40 xl:hidden" onClick={() => setPanel(null)}>
            <div className="h-full w-[min(560px,100vw)] border-l border-white/[0.08]" onClick={(e) => e.stopPropagation()}>
              {right}
            </div>
          </div>
        </>
      )}

      <CommandPalette model={model} onSelectSpan={selectSpan} />
      <WalletDialog open={walletOpen} onClose={() => setWalletOpen(false)} model={model} />
    </div>
  );
}
