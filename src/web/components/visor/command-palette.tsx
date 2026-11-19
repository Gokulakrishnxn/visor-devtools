import { Command } from "cmdk";
import { AlertTriangle, History, Play, Search, Square } from "lucide-react";
import { PAST_SESSIONS } from "@/lib/mock-data";
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
export function CommandPalette({ model, onSelectSpan }: { model: TraceModel; onSelectSpan: (spanId: string) => void }) {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPalette);
  const start = useSession((s) => s.start);
  const stop = useSession((s) => s.stop);
  const close = () => setOpen(false);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[12vh] z-[81] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border-strong bg-[#12151b] shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search size={16} className="text-faint" />
        <Command.Input autoFocus placeholder="Search spans, files, thinking, outputs, alerts…" className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
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

        <Command.Group heading="Sessions" className={group}>
          {PAST_SESSIONS.map((s) => (
            <Command.Item key={s.id} className={item} value={`session ${s.title}`} onSelect={close}>
              <History size={14} className="text-faint" /> {s.title}
              <span className="ml-auto text-[11px] text-faint">{s.when}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
