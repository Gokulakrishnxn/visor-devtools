import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronRight, Eye, EyeOff, MoreHorizontal, PanelLeftClose, Pencil, Plug, Plus, ReceiptText, Search, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { Usd } from "@/components/visor/primitives";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";
import { isChatFolder, NO_FOLDER, useSession, type StoredSession } from "@/stores/session-store";
import { GitBar } from "./git-bar";

const folderOf = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

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
  const renameSession = useSession((s) => s.renameSession);
  const hidden = useSession((s) => s.hiddenWorkspaces);
  const hideWorkspace = useSession((s) => s.hideWorkspace);
  const showHidden = useSession((s) => s.showHiddenWorkspaces);
  const [actionError, setActionError] = useState<string | null>(null);
  const act = async (run: () => Promise<string | null>) => setActionError(await run());
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: string; run: () => void } | null>(null);
  const info = useSession((s) => s.info);
  const wallet = useSession((s) => s.wallet);
  const profile = useSession((s) => s.profile);
  const live = info?.runtime === "claude";
  const spending = live && (model.session?.status === "running" || model.session?.status === "paused") ? model.cost.total : 0;
  const here = info?.workspacePath ?? "workspace";
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (path: string) => open[path] ?? path === here;

  // Sessions grouped by workspace folder, this workspace first
  const groups = new Map<string, StoredSession[]>([[here, []]]);
  // No-folder chats each have their own scratch folder; list them together
  for (const s of stored) {
    const key = isChatFolder(s.workspacePath, info) ? NO_FOLDER : s.workspacePath;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  // Removed folders stay hidden until a session starts there after the removal
  let hiddenCount = 0;
  for (const [path, at] of Object.entries(hidden)) {
    if (groups.has(path) && !(groups.get(path) ?? []).some((s) => s.startedAt > at)) {
      groups.delete(path);
      hiddenCount++;
    }
  }

  const nav = [
    { id: "rules" as const, label: "Overrides & rules", icon: ShieldCheck },
    { id: "mcp" as const, label: "MCP servers", icon: Plug },
    { id: "ledger" as const, label: "Credit ledger", icon: ReceiptText },
  ];

  return (
    <aside style={{ width }} className={cn("flex h-full shrink-0 flex-col bg-[var(--sidebar)] text-[13.5px]", className)}>
      <div className="desktop-drag desktop-lights-pad flex items-center gap-2 px-4 pb-2 pt-3.5">
        <span className="text-[14px] font-semibold tracking-[0.18em] text-foreground">
          V<span className="text-indigo">.</span>I<span className="text-indigo">.</span>S<span className="text-indigo">.</span>O<span className="text-indigo">.</span>R
          <span className="text-indigo">.</span>
        </span>
        {onCollapse && (
          <button type="button" onClick={onCollapse} aria-label="Collapse sidebar (⌘B)" title="Collapse sidebar (⌘B)" className="ml-auto rounded-md p-1.5 text-white/45 hover:bg-white/[0.08] hover:text-foreground">
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      <nav className="space-y-px px-2 pt-1" aria-label="Main">
        <NavRow icon={Plus} label="New session" onClick={onNew} />
        <NavRow icon={Search} label="Search" hint="⌘K" onClick={onSearch} />
        {nav.map((n) => (
          <NavRow key={n.id} icon={n.icon} label={n.label} active={view === n.id} onClick={() => onView(view === n.id ? "chat" : n.id)} />
        ))}
      </nav>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {actionError && (
          <p role="alert" className="mx-2 mb-1 rounded-md bg-rose/10 px-2 py-1.5 text-[12px] text-rose/90">
            {actionError}
          </p>
        )}
        {groups.size === 0 && (
          <div className="mx-1 rounded-xl border border-dashed border-white/[0.09] px-3 py-4 text-center">
            <p className="text-[12.5px] text-white/45">No workspaces in the sidebar</p>
            <p className="mt-1 text-[11.5px] text-white/30">Send a message to start one in this folder, or run vhud in another folder.</p>
          </div>
        )}
        {[...groups.entries()].map(([path, list]) => {
          // One folder: a plain "Recents" list like the Claude app; several: one heading per folder
          const name = path === NO_FOLDER ? "No folder" : groups.size === 1 ? "Recents" : folderOf(path);
          return (
            <WorkspaceGroup
              key={path}
              name={name}
              path={path}
              open={isOpen(path)}
              onToggle={() => setOpen((o) => ({ ...o, [path]: !isOpen(path) }))}
              menu={[
                ...(list.length
                  ? [
                      {
                        label: "Delete all sessions",
                        icon: Trash2,
                        danger: true,
                        onSelect: () =>
                          setConfirm({
                            title: `Delete all sessions in ${name}?`,
                            body: `This removes ${list.length} session${list.length === 1 ? "" : "s"} and their history from V.I.S.O.R. Your files in this folder are not touched.`,
                            action: "Delete all",
                            run: () =>
                              void act(async () => {
                                if (path !== NO_FOLDER) return deleteWorkspace(path);
                                for (const s of list) {
                                  const err = await deleteSession(s.id);
                                  if (err) return err;
                                }
                                return null;
                              }),
                          }),
                      },
                    ]
                  : []),
                { label: "Remove from sidebar", icon: EyeOff, onSelect: () => hideWorkspace(path) },
              ]}
            >
              {list.length === 0 && <p className="py-1.5 pl-3 text-[12.5px] text-white/30">No sessions yet</p>}
              {list.map((s) => {
                const status = (s.id === currentId ? model.session?.status : undefined) ?? s.status;
                return (
                  <SessionRow
                    key={s.id}
                    active={s.id === currentId}
                    title={s.title}
                    dot={status === "completed" ? undefined : STATUS_DOT[status]}
                    onClick={() => {
                      onView("chat");
                      void openSession(s.id);
                    }}
                    onRename={(title) => void act(() => renameSession(s.id, title))}
                    onDelete={() =>
                      setConfirm({
                        title: "Delete session?",
                        body: `"${s.title}" and its history will be removed from V.I.S.O.R. Your files are not touched.`,
                        action: "Delete",
                        run: () => void act(() => deleteSession(s.id)),
                      })
                    }
                  />
                );
              })}
            </WorkspaceGroup>
          );
        })}
        {hiddenCount > 0 && (
          <button type="button" onClick={showHidden} className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[12px] text-white/40 hover:bg-white/[0.04] hover:text-white/75">
            <Eye size={13} /> Show {hiddenCount} hidden workspace{hiddenCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      <GitBar />
      <button
        type="button"
        onClick={onWallet}
        className="group mx-2 mb-2 flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
        aria-label="Open credit wallet"
      >
        {profile?.name ? (
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#c96442] text-[12.5px] font-semibold text-white">
            {profile.name[0]!.toUpperCase()}
          </span>
        ) : (
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", live ? "bg-indigo/20 text-indigo" : "bg-white/[0.09] text-white/60")}>
            <Wallet size={14} />
          </span>
        )}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] text-foreground">
            {profile?.name ? (
              <>
                {profile.name}
                {profile.plan && <span className="text-white/45"> · {profile.plan}</span>}
              </>
            ) : wallet?.active ? (
              <>
                <Usd micro={Math.max(0, wallet.balanceMicroUsd - spending)} decimals={2} /> credit
              </>
            ) : (
              "Set up credit"
            )}
          </span>
          <span className="block truncate text-[11.5px] text-white/45">
            {profile?.name && wallet?.active && (
              <>
                <Usd micro={Math.max(0, wallet.balanceMicroUsd - spending)} decimals={2} /> credit ·{" "}
              </>
            )}
            {live ? "Live" : "Mock · $0 spend"}
          </span>
        </span>
        <ChevronRight size={14} className="shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
      </button>
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </aside>
  );
}

function NavRow({ icon: Icon, label, hint, active, onClick }: { icon: typeof Plus; label: string; hint?: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-[7px] text-left text-[13.5px] transition-colors",
        active ? "bg-white/[0.09] text-foreground" : "text-white/80 hover:bg-white/[0.05] hover:text-foreground",
      )}
    >
      <Icon size={16} className={cn("shrink-0", active ? "text-foreground" : "text-white/55 group-hover:text-white/80")} />
      <span className="truncate">{label}</span>
      {hint && <kbd className="ml-auto font-sans text-[11px] text-white/30">{hint}</kbd>}
    </button>
  );
}

type MenuItem = { label: string; icon: typeof Trash2; danger?: boolean; onSelect: () => void };

/** The "⋯" button and its small menu, shown on hover like Claude's sidebar. */
function RowMenu({ label, items, forceVisible }: { label: string; items: MenuItem[]; forceVisible?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          "flex size-6 items-center justify-center rounded-md text-white/50 transition-opacity hover:bg-white/[0.1] hover:text-foreground focus-visible:opacity-100",
          open || forceVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <MoreHorizontal size={15} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -2 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-7 z-30 min-w-44 origin-top-right rounded-lg border border-white/[0.09] bg-[var(--popover)] p-1 shadow-xl shadow-black/40"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-white/[0.07]",
                  item.danger ? "text-rose hover:bg-rose/10" : "text-white/85",
                )}
              >
                <item.icon size={14} className="shrink-0 opacity-80" /> {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "Are you sure?" before deleting anything. */
function ConfirmDialog({ confirm, onClose }: { confirm: { title: string; body: string; action: string; run: () => void } | null; onClose: () => void }) {
  useEffect(() => {
    if (!confirm) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [confirm, onClose]);
  return (
    <AnimatePresence>
      {confirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          onMouseDown={onClose}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            initial={{ scale: 0.97, y: 4 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97 }}
            transition={{ duration: 0.14 }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-white/[0.09] bg-[var(--popover)] p-5 shadow-2xl shadow-black/50"
          >
            <h2 id="confirm-title" className="text-[15px] font-semibold text-foreground">
              {confirm.title}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/60">{confirm.body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" autoFocus onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] text-white/75 hover:bg-white/[0.07]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirm.run();
                  onClose();
                }}
                className="rounded-lg bg-rose px-3 py-1.5 text-[13px] font-medium text-white hover:bg-rose/90"
              >
                {confirm.action}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A workspace folder: a small heading (like Claude's project groups) and its sessions. */
function WorkspaceGroup({
  name,
  path,
  open,
  onToggle,
  menu,
  children,
}: {
  name: string;
  path: string;
  open: boolean;
  onToggle: () => void;
  menu: MenuItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-1">
      <div className="group flex items-center rounded-lg pr-1.5">
        <button
          type="button"
          onClick={onToggle}
          title={path}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-[12.5px] text-white/50 outline-none hover:text-white/80 focus-visible:text-white/90"
        >
          <span className="truncate">{name}</span>
          <ChevronDown size={13} className={cn("shrink-0 transition-transform", !open && "-rotate-90")} />
        </button>
        <span className="ml-auto">
          <RowMenu label={`Options for ${name}`} items={menu} />
        </span>
      </div>
      {open && <div className="mt-0.5 space-y-px">{children}</div>}
    </div>
  );
}

function SessionRow({
  title,
  active,
  dot,
  onClick,
  onRename,
  onDelete,
}: {
  title: string;
  active?: boolean;
  dot?: string;
  onClick: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const save = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== title) onRename(next);
    else setDraft(title);
  };
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-lg pr-1.5 transition-colors",
        active ? "bg-white/[0.09] text-foreground" : "text-white/75 hover:bg-white/[0.05] hover:text-foreground",
      )}
    >
      {editing ? (
        <input
          autoFocus
          aria-label="Session name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setDraft(title);
              setEditing(false);
            }
          }}
          className="m-1 min-w-0 flex-1 rounded-md border border-indigo/50 bg-black/30 px-2 py-1 text-[13.5px] text-foreground outline-none"
        />
      ) : (
        <button type="button" onClick={onClick} onDoubleClick={() => setEditing(true)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left">
          <span className="truncate">{title}</span>
          {dot && <i className={cn("ml-auto size-1.5 shrink-0 rounded-full", dot)} />}
        </button>
      )}
      {!editing && (
        <RowMenu
          label={`Options for ${title}`}
          forceVisible={active}
          items={[
            {
              label: "Rename",
              icon: Pencil,
              onSelect: () => {
                setDraft(title);
                setEditing(true);
              },
            },
            { label: "Delete", icon: Trash2, danger: true, onSelect: onDelete },
          ]}
        />
      )}
    </div>
  );
}
