import { useState } from "react";
import { ChevronDown, Folder, FolderOpen, FolderPlus, ListFilter, PanelLeftClose, Plug, PlusCircle, ReceiptText, Search, ShieldCheck, Wallet } from "lucide-react";
import { Usd } from "@/components/visor/primitives";
import { PAST_SESSIONS, WALLET_BEFORE_MICRO, WORKSPACE } from "@/lib/mock-data";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";

const OTHER_FOLDERS = [
  { name: "visor-devtools", sessions: ["Pricing registry overrides", "Docs search palette"] },
  { name: "data-pipeline", sessions: ["Backfill November events"] },
];

export type SidebarView = "chat" | "rules" | "mcp" | "ledger";

/**
 * Left sidebar: wordmark, New session, app sections, and the workspace tree
 * (folders → sessions). Light gray against the dark canvas, like a native
 * macOS source list.
 */
export function Sidebar({
  model,
  onNew,
  onSearch,
  view,
  onView,
  onCollapse,
  width = 264,
  className,
}: {
  model: TraceModel;
  onCollapse?: () => void;
  width?: number;
  onNew: () => void;
  onSearch: () => void;
  view: SidebarView;
  onView: (v: SidebarView) => void;
  className?: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ [WORKSPACE.name]: true });
  const status = model.session?.status;
  const liveDot = status === "paused" ? "bg-amber animate-pulse" : status === "running" ? "bg-indigo animate-pulse" : "bg-emerald";

  const nav = [
    { id: "rules" as const, label: "Overrides & rules", icon: ShieldCheck },
    { id: "mcp" as const, label: "MCP servers", icon: Plug },
    { id: "ledger" as const, label: "Credit ledger", icon: ReceiptText },
  ];

  return (
    <aside style={{ width }} className={cn("flex h-full shrink-0 flex-col bg-[var(--sidebar)] text-[13.5px]", className)}>
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-semibold tracking-[0.2em] text-foreground">
            V<span className="text-indigo">.</span>I<span className="text-indigo">.</span>S<span className="text-indigo">.</span>O<span className="text-indigo">.</span>R
            <span className="text-indigo">.</span>
          </span>
          <span className="rounded border border-white/25 px-1 font-mono text-[9.5px] uppercase leading-4 tracking-wider text-white/70">Harness</span>
          {onCollapse && (
            <button type="button" onClick={onCollapse} aria-label="Collapse sidebar (⌘B)" title="Collapse sidebar (⌘B)" className="ml-auto rounded-md p-1 text-white/45 hover:bg-white/[0.08] hover:text-foreground">
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onNew}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/[0.09] text-[13.5px] text-foreground transition-colors hover:bg-white/[0.13]"
        >
          <PlusCircle size={16} /> New session
        </button>
      </div>

      <nav className="space-y-0.5 px-2">
        {nav.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onView(view === n.id ? "chat" : n.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
              view === n.id ? "bg-white/[0.09] text-foreground" : "text-white/75 hover:bg-white/[0.05] hover:text-foreground",
            )}
          >
            <n.icon size={16} className="text-white/60" /> {n.label}
          </button>
        ))}
      </nav>

      <div className="mt-5 flex items-center px-5 pb-1 text-[12.5px] text-white/50">
        Workspace
        <span className="ml-auto flex items-center gap-2.5">
          <button type="button" aria-label="Search sessions" onClick={onSearch} className="hover:text-foreground">
            <Search size={14} />
          </button>
          <button type="button" aria-label="Filter" className="hover:text-foreground">
            <ListFilter size={14} />
          </button>
          <button type="button" aria-label="New folder" className="hover:text-foreground">
            <FolderPlus size={14} />
          </button>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Folder2 name={WORKSPACE.name} open={open[WORKSPACE.name] ?? false} onToggle={() => setOpen((o) => ({ ...o, [WORKSPACE.name]: !o[WORKSPACE.name] }))}>
          <SessionRow active onClick={() => onView("chat")} title={model.session?.title ?? "Starting…"} dot={liveDot} />
          {PAST_SESSIONS.map((s) => (
            <SessionRow key={s.id} title={s.title} />
          ))}
        </Folder2>
        {OTHER_FOLDERS.map((f) => (
          <Folder2 key={f.name} name={f.name} open={open[f.name] ?? false} onToggle={() => setOpen((o) => ({ ...o, [f.name]: !o[f.name] }))}>
            {f.sessions.map((s) => (
              <SessionRow key={s} title={s} />
            ))}
          </Folder2>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-white/[0.07] px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.09] text-white/70">
          <Wallet size={15} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[13px] text-foreground">Local harness</span>
          <span className="block text-[11.5px] text-white/50">
            <Usd micro={WALLET_BEFORE_MICRO - model.cost.total} decimals={2} /> credit left
          </span>
        </span>
      </div>
    </aside>
  );
}

function Folder2({ name, open, onToggle, children }: { name: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const Icon = open ? FolderOpen : Folder;
  return (
    <div className="mt-1">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-white/85 hover:bg-white/[0.05]" aria-expanded={open}>
        <Icon size={16} className={open ? "text-indigo/90" : "text-white/55"} />
        <span className="truncate">{name}</span>
        <ChevronDown size={13} className={cn("ml-auto text-white/35 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="mt-0.5 space-y-0.5">{children}</div>}
    </div>
  );
}

function SessionRow({ title, active, dot, onClick }: { title: string; active?: boolean; dot?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg py-2 pl-9 pr-3 text-left transition-colors",
        active ? "bg-white/[0.09] text-foreground" : "text-white/70 hover:bg-white/[0.05] hover:text-foreground",
      )}
    >
      <span className="truncate">{title}</span>
      {dot && <i className={cn("ml-auto size-1.5 shrink-0 rounded-full", dot)} />}
    </button>
  );
}
