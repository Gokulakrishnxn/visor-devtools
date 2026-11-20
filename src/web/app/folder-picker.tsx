import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, ChevronDown, ChevronRight, Folder, FolderOpen, Home, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { isChatFolder, NO_FOLDER, useSession } from "@/stores/session-store";

type Listing = { path: string; parent: string | null; home: string; folders: { name: string; path: string }[] };

const nameOf = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
const tilde = (path: string, home?: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path);

/** The folder Claude works in right now: the open session's, else the one you picked (NO_FOLDER for no-folder chats). */
export function useCurrentFolder(): string | null {
  const info = useSession((s) => s.info);
  const sessions = useSession((s) => s.sessions);
  const sessionId = useSession((s) => s.sessionId);
  const chosen = useSession((s) => s.folder);
  const open = sessions.find((s) => s.id === sessionId);
  const openPath = open ? (isChatFolder(open.workspacePath, info) ? NO_FOLDER : open.workspacePath) : null;
  return openPath ?? chosen ?? info?.workspacePath ?? null;
}

/**
 * The folder button in the prompt box, like the Claude app's: shows where
 * Claude works, lists recent folders, and opens a folder browser.
 */
export function FolderButton({ disabled }: { disabled?: boolean }) {
  const info = useSession((s) => s.info);
  const sessions = useSession((s) => s.sessions);
  const chosen = useSession((s) => s.folder);
  const setFolder = useSession((s) => s.setFolder);
  const clear = useSession((s) => s.clear);
  const [menu, setMenu] = useState(false);
  const [browse, setBrowse] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // An open session shows its own folder; a new one uses the folder you picked
  const current = useCurrentFolder();
  const noFolder = current === NO_FOLDER;
  const recents = [...new Set([chosen, info?.workspacePath, ...sessions.map((s) => s.workspacePath)].filter((p): p is string => Boolean(p) && p !== NO_FOLDER && !isChatFolder(p!, info)))].slice(0, 6);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const pick = (path: string) => {
    setFolder(path === info?.workspacePath ? null : path);
    setMenu(false);
    setBrowse(false);
    if (path !== current) clear(); // a different folder starts a fresh chat
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setMenu((m) => !m)}
        aria-expanded={menu}
        title={current ?? undefined}
        className="flex h-8 max-w-[200px] items-center gap-1.5 rounded-full px-2.5 text-[13px] text-white/70 hover:bg-white/[0.06] disabled:opacity-50"
      >
        {noFolder ? <MessageSquare size={14} className="shrink-0" /> : <Folder size={14} className="shrink-0" />}
        <span className="truncate">{noFolder ? "No folder" : current ? nameOf(current) : "Open folder"}</span>
        <ChevronDown size={13} className="shrink-0 text-white/40" />
      </button>
      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-10 left-0 z-30 w-72 rounded-xl border border-white/[0.09] bg-[var(--popover)] p-1 shadow-xl shadow-black/40"
          >
            <p className="px-2.5 pb-1 pt-1.5 text-[11.5px] text-white/40">Recent folders</p>
            {recents.map((p) => (
              <button key={p} type="button" onClick={() => pick(p)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-white/[0.07]">
                <Folder size={14} className="shrink-0 text-white/50" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-foreground/90">{nameOf(p)}</span>
                  <span className="block truncate text-[11px] text-white/35">{p}</span>
                </span>
                {p === current && <Check size={14} className="shrink-0 text-indigo" />}
              </button>
            ))}
            <div className="my-1 border-t border-white/[0.07]" />
            {info?.chatsRoot && (
              <button type="button" onClick={() => pick(NO_FOLDER)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-white/[0.07]">
                <MessageSquare size={14} className="shrink-0 text-white/50" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-foreground/90">No folder</span>
                  <span className="block truncate text-[11px] text-white/35">Just chat; Claude gets an empty scratch folder</span>
                </span>
                {noFolder && <Check size={14} className="shrink-0 text-indigo" />}
              </button>
            )}
            <button type="button" onClick={() => (setMenu(false), setBrowse(true))} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-white/85 hover:bg-white/[0.07]">
              <FolderOpen size={14} className="text-white/50" /> Open folder…
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {browse && <FolderBrowser start={noFolder ? null : current} onPick={pick} onClose={() => setBrowse(false)} />}
    </div>
  );
}

/** A simple folder browser: folders only, click to go in, "Open" to choose. */
function FolderBrowser({ start, onPick, onClose }: { start: string | null; onPick: (path: string) => void; onClose: () => void }) {
  const token = useSession((s) => s.token);
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (path?: string | null) => {
    setError(null);
    void fetch(`/api/folders${path ? `?path=${encodeURIComponent(path)}` : ""}`, { headers: { authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const body = (await res.json()) as Listing & { error?: string };
        if (!res.ok) setError(body.error ?? "Couldn't open that folder");
        else setListing(body);
      })
      .catch(() => setError("Couldn't reach V.I.S.O.R."));
  };
  // First listing: the current folder's parent, so its siblings are easy to reach
  const first = useRef(start ? start.replace(/[\\/][^\\/]+$/, "") || start : null);
  useEffect(() => load(first.current), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Open folder"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[min(520px,85vh)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/[0.09] bg-[var(--popover)] shadow-2xl shadow-black/50"
      >
        <div className="flex items-center gap-1 border-b border-white/[0.07] px-3 py-2.5">
          <h2 className="mr-auto text-[14px] font-semibold text-foreground">Open folder</h2>
          <button type="button" aria-label="Home folder" onClick={() => load(listing?.home)} className="rounded-md p-1.5 text-white/55 hover:bg-white/[0.07] hover:text-foreground">
            <Home size={15} />
          </button>
          <button type="button" aria-label="Up one folder" disabled={!listing?.parent} onClick={() => load(listing?.parent)} className="rounded-md p-1.5 text-white/55 hover:bg-white/[0.07] hover:text-foreground disabled:opacity-30">
            <ArrowUp size={15} />
          </button>
        </div>
        <p className="truncate border-b border-white/[0.05] px-4 py-2 font-mono text-[11.5px] text-white/45" title={listing?.path}>
          {listing ? tilde(listing.path, listing.home) : "…"}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {error && <p className="px-3 py-2 text-[12.5px] text-rose/90">{error}</p>}
          {listing && !listing.folders.length && <p className="px-3 py-2 text-[12.5px] text-white/40">No folders inside</p>}
          {listing?.folders.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => load(f.path)}
              onDoubleClick={() => onPick(f.path)}
              className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-white/80 hover:bg-white/[0.06] hover:text-foreground"
            >
              <Folder size={15} className="shrink-0 text-indigo/80" />
              <span className="truncate">{f.name}</span>
              <ChevronRight size={14} className="ml-auto shrink-0 text-white/25 group-hover:text-white/60" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-white/[0.07] px-3 py-2.5">
          <span className="mr-auto min-w-0 truncate text-[12px] text-white/45">{listing ? `Claude will work in ${nameOf(listing.path)}` : ""}</span>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] text-white/75 hover:bg-white/[0.07]">
            Cancel
          </button>
          <button
            type="button"
            disabled={!listing}
            onClick={() => listing && onPick(listing.path)}
            className={cn("rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-[var(--primary-foreground)] disabled:opacity-40")}
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
