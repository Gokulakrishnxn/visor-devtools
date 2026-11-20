import { useEffect, useState } from "react";
import { ChevronDown, Folder, FolderOpen, FolderPlus, ListFilter, PanelLeftClose, Plug, PlusCircle, ReceiptText, Search, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { Usd } from "@/components/visor/primitives";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";
import { useSession, type StoredSession } from "@/stores/session-store";

const folderOf = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

const STATUS_DOT: Record<string, string> = {
  running: "bg-indigo animate-pulse",
  paused: "bg-amber animate-pulse",
  completed: "bg-emerald",
  aborted_budget: "bg-rose",
  error: "bg-rose",
};

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
  onWallet,
  width = 264,
  className,
}: {
  model: TraceModel;
  onCollapse?: () => void;
  onWallet: () => void;
  width?: number;
  onNew: () => void;
  onSearch: () => void;
  view: SidebarView;
  onView: (v: SidebarView) => void;
  className?: string;
}) {
  const stored = useSession((s) => s.sessions);
  const currentId = useSession((s) => s.sessionId);
  const openSession = useSession((s) => s.open);
  const deleteSession = useSession((s) => s.deleteSession);
  const deleteWorkspace = useSession((s) => s.deleteWorkspace);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const remove = async (run: () => Promise<string | null>) => setDeleteError(await run());
  const info = useSession((s) => s.info);
  const wallet = useSession((s) => s.wallet);
  const live = info?.runtime === "claude";
  const spending = live && (model.session?.status === "running" || model.session?.status === "paused") ? model.cost.total : 0;
  const here = info?.workspacePath ?? "workspace";
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (path: string) => open[path] ?? path === here;

  // Sessions grouped by workspace folder, this workspace first
  const groups = new Map<string, StoredSession[]>([[here, []]]);
  for (const s of stored) groups.set(s.workspacePath, [...(groups.get(s.workspacePath) ?? []), s]);

  const nav = [
    { id: "rules" as const, label: "Overrides & rules", icon: ShieldCheck },
    { id: "mcp" as const, label: "MCP servers", icon: Plug },
    { id: "ledger" as const, label: "Credit ledger", icon: ReceiptText },
  ];

  return (
    <aside style={{ width }} className={cn("flex h-full shrink-0 flex-col bg-[var(--sidebar)] text-[13.5px]", className)}>
      <div className="desktop-drag desktop-lights-pad px-4 pb-3 pt-4">
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
        {deleteError && (
          <p role="alert" className="mx-3 mt-1 rounded-md bg-rose/10 px-2 py-1.5 text-[12px] text-rose/90">
            {deleteError}
          </p>
        )}
        {[...groups.entries()].map(([path, list]) => (
          <Folder2
            key={path}
            name={folderOf(path)}
            path={path}
            open={isOpen(path)}
            onToggle={() => setOpen((o) => ({ ...o, [path]: !isOpen(path) }))}
            onDelete={list.length ? () => void remove(() => deleteWorkspace(path)) : undefined}
          >
            {list.length === 0 && <p className="py-1.5 pl-9 text-[12.5px] text-white/35">No sessions yet</p>}
            {list.map((s) => {
              const live = s.id === currentId ? model.session?.status : undefined;
              return (
                <SessionRow
                  key={s.id}
                  active={s.id === currentId}
                  title={s.id === currentId && model.session ? model.session.title : s.title}
                  dot={STATUS_DOT[live ?? s.status]}
                  meta={ago(s.startedAt)}
                  onClick={() => {
                    onView("chat");
                    void openSession(s.id);
                  }}
                  onDelete={() => void remove(() => deleteSession(s.id))}
                />
              );
            })}
          </Folder2>
        ))}
      </div>

      <button type="button" onClick={onWallet} className="flex items-center gap-3 border-t border-white/[0.07] px-4 py-3 text-left transition-colors hover:bg-white/[0.04]" aria-label="Open credit wallet">
        <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.09] text-white/70">
          <Wallet size={15} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[13px] text-foreground">{live ? "Live · Claude Agent SDK" : "Mock runtime · $0 spend"}</span>
          <span className="block text-[11.5px] text-white/50">
            {wallet?.active ? (
              <>
                <Usd micro={Math.max(0, wallet.balanceMicroUsd - spending)} decimals={2} /> credit left
              </>
            ) : (
              "Set up prepaid credit"
            )}
          </span>
        </span>
      </button>
    </aside>
  );
}

/**
 * A trash button that asks once more before deleting: the first click turns
 * it into a red "Delete" button for a few seconds, the second click deletes.
 */
function DeleteButton({ label, confirmLabel = "Delete", onConfirm }: { label: string; confirmLabel?: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      aria-label={armed ? `Confirm: ${label}` : label}
      title={armed ? "Click again to delete" : label}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
      onKeyDown={(e) => e.key === "Escape" && setArmed(false)}
      className={cn(
        "shrink-0 rounded-md transition-colors focus-visible:opacity-100",
        armed
          ? "bg-rose/15 px-2 py-0.5 text-[11.5px] font-medium text-rose opacity-100"
          : "p-1 text-white/40 opacity-0 hover:bg-white/[0.08] hover:text-rose group-hover:opacity-100",
      )}
    >
      {armed ? confirmLabel : <Trash2 size={13} />}
    </button>
  );
}

function Folder2({
  name,
  path,
  open,
  onToggle,
  onDelete,
  children,
}: {
  name: string;
  path: string;
  open: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}) {
  const Icon = open ? FolderOpen : Folder;
  return (
    <div className="mt-1">
      <div className="group flex items-center rounded-lg pr-2 hover:bg-white/[0.05]">
        <button type="button" onClick={onToggle} title={path} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-white/85" aria-expanded={open}>
          <Icon size={16} className={cn("shrink-0", open ? "text-indigo/90" : "text-white/55")} />
          <span className="truncate">{name}</span>
          <ChevronDown size={13} className={cn("ml-auto shrink-0 text-white/35 transition-transform", !open && "-rotate-90")} />
        </button>
        {onDelete && <DeleteButton label={`Delete all sessions in ${name}`} confirmLabel="Delete all" onConfirm={onDelete} />}
      </div>
      {open && <div className="mt-0.5 space-y-0.5">{children}</div>}
    </div>
  );
}

function SessionRow({
  title,
  active,
  dot,
  meta,
  onClick,
  onDelete,
}: {
  title: string;
  active?: boolean;
  dot?: string;
  meta?: string;
  onClick?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center rounded-lg pr-2 transition-colors",
        active ? "bg-white/[0.09] text-foreground" : "text-white/70 hover:bg-white/[0.05] hover:text-foreground",
      )}
    >
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-9 pr-1 text-left">
        <span className="truncate">{title}</span>
        {meta && <span className="ml-auto shrink-0 text-[11px] text-white/30 tabular">{meta}</span>}
        {dot && <i className={cn("size-1.5 shrink-0 rounded-full", !meta && "ml-auto", dot)} />}
      </button>
      {onDelete && <DeleteButton label={`Delete session ${title}`} onConfirm={onDelete} />}
    </div>
  );
}
