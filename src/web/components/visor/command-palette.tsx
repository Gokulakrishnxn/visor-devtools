import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { AlertTriangle, History, Play, Search, Square } from "lucide-react";
import type { TraceModel } from "@/lib/trace-model";
import { useSession } from "@/stores/session-store";
import { useUi } from "@/stores/ui-store";
import { SPAN_ICON, SPAN_LABEL, spanTone } from "./primitives";

const group =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-faint";
const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] data-[selected=true]:bg-white/[0.07]";

function snippet(text: string, n = 70) {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

/** ⌘K: search sessions, file paths, thinking, tool output and alerts. */
type Hit = { sessionId: string; sessionTitle: string; spanId: string | null; kind: string; label: string; snippet: string; at: number };

export function CommandPalette({ model, onSelectSpan }: { model: TraceModel; onSelectSpan: (spanId: string) => void }) {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPalette);
  const start = useSession((s) => s.start);
  const stop = useSession((s) => s.stop);
  const token = useSession((s) => s.token);
  const sessions = useSession((s) => s.sessions);
  const currentId = useSession((s) => s.sessionId);
  const openSession = useSession((s) => s.open);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const close = () => setOpen(false);

  // Search every stored session on the daemon as you type
  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { headers: { authorization: `Bearer ${token}` }, signal: ctrl.signal })
        .then((r) => r.json() as Promise<{ hits: Hit[] }>)
        .then((r) => setHits(r.hits.filter((h) => h.sessionId !== currentId)))
        .catch(() => undefined);
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, query, token, currentId]);
  const shownHits = query.trim().length >= 2 ? hits : [];

  const jump = async (sessionId: string, spanId: string | null) => {
    close();
    await openSession(sessionId);
    if (spanId) setTimeout(() => onSelectSpan(spanId), 50);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[12vh] z-[81] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border-strong bg-popover shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search size={16} className="text-faint" />
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search every session: files, thinking, outputs, errors, prompts…"
          className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
        />
        <kbd className="rounded border border-border-strong px-1.5 font-mono text-[10px] text-faint">esc</kbd>
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-[13px] text-faint">No matches.</Command.Empty>

        <Command.Group heading="Actions" className={group}>
          <Command.Item className={item} onSelect={() => (void start(), close())}>
            <Play size={14} className="text-emerald" /> Run a new mock session
          </Command.Item>
          <Command.Item className={item} onSelect={() => (void stop(), close())}>
            <Square size={14} className="text-rose" /> Stop the current session
          </Command.Item>
        </Command.Group>

        {model.order.length > 0 && (
          <Command.Group heading="Spans" className={group}>
            {model.order.map((id) => {
              const s = model.spans[id]!;
              const Icon = SPAN_ICON[s.spanType];
              const body = s.text || (typeof s.output === "string" ? s.output : s.output ? JSON.stringify(s.output) : "");
              return (
                <Command.Item
                  key={id}
                  className={item}
                  value={`${SPAN_LABEL[s.spanType]} ${s.name} ${s.filePath ?? ""} ${body} ${s.error ?? ""} ${id}`}
                  onSelect={() => (onSelectSpan(id), close())}
                >
                  <Icon size={14} className={spanTone(s.spanType)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">
                      {SPAN_LABEL[s.spanType]}
                      {s.name !== SPAN_LABEL[s.spanType] && <span className="font-mono text-[12px] text-muted-foreground"> · {s.name}</span>}
                    </span>
                    {body && <span className="block truncate text-[11.5px] text-faint">{snippet(body)}</span>}
                  </span>
                </Command.Item>
              );
            })}
          </Command.Group>
        )}

        {model.alerts.length > 0 && (
          <Command.Group heading="Alerts" className={group}>
            {model.alerts.map((a) => (
              <Command.Item key={a.id} className={item} value={`alert ${a.title} ${a.detail}`} onSelect={() => (a.spanId && onSelectSpan(a.spanId), close())}>
                <AlertTriangle size={14} className={a.level === "danger" ? "text-rose" : a.level === "warning" ? "text-amber" : "text-indigo"} />
                <span className="truncate">
                  {a.title} <span className="text-faint">· {a.detail}</span>
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {shownHits.length > 0 && (
          <Command.Group heading="Other sessions" className={group}>
            {shownHits.map((h, i) => (
              <Command.Item key={`${h.sessionId}-${h.spanId ?? "p"}-${i}`} className={item} value={`${query} ${h.snippet} ${h.sessionTitle} ${i}`} onSelect={() => void jump(h.sessionId, h.spanId)}>
                <History size={14} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground">
                    {h.kind === "prompt" ? "Prompt" : h.label} <span className="text-[11.5px] text-faint">· {h.sessionTitle}</span>
                  </span>
                  <span className="block truncate text-[11.5px] text-faint">{h.snippet}</span>
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {sessions.length > 0 && (
          <Command.Group heading="Sessions" className={group}>
            {sessions.slice(0, 12).map((s) => (
              <Command.Item key={s.id} className={item} value={`session ${s.title} ${s.id}`} onSelect={() => void jump(s.id, null)}>
                <History size={14} className="text-faint" /> <span className="truncate">{s.title}</span>
                <span className="ml-auto shrink-0 text-[11px] text-faint">{new Date(s.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
