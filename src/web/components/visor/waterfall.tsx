import { useRef } from "react";
import { Pause, Play, Radio } from "lucide-react";
import { walkOrder, type TraceModel, type TraceSpan } from "@/lib/trace-model";
import { cn } from "@/lib/utils";
import { useSession, useSessionEvents } from "@/stores/session-store";
import { SPAN_ICON, fmtMs, spanTone } from "./primitives";

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

/** Millisecond span waterfall: one lane per span, nested by depth. */
export function Waterfall({ model, selectedId, onSelect }: { model: TraceModel; selectedId: string | null; onSelect: (id: string) => void }) {
  const order = walkOrder(model);
  const t0 = model.firstAt;
  const t1 = Math.max(model.lastAt, t0 + 1);
  const span = t1 - t0;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b border-border py-1 pl-32 pr-3 font-mono text-[10.5px] text-faint">
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
              className={cn("flex h-6 w-full items-center pr-3 text-left hover:bg-white/[0.03]", selectedId === id && "bg-indigo/10")}
            >
              <span className="flex w-32 shrink-0 items-center gap-1.5 truncate pr-2 text-[11.5px] text-muted-foreground" style={{ paddingLeft: 10 + s.depth * 12 }}>
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


/** Replay scrubber: drag back through the event stream; "Live" returns to now. */
export function ReplayBar({ className }: { className?: string }) {
  const events = useSessionEvents();
  const cursor = useSession((s) => s.cursor);
  const setCursor = useSession((s) => s.setCursor);
  const live = cursor === null;
  return (
    <div className={cn("flex items-center gap-3 text-[11.5px]", className)}>
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
      <span className="w-24 text-right font-mono text-faint tabular">
        {cursor ?? events.length}/{events.length}
      </span>
      {!live && (
        <button type="button" onClick={() => setCursor(null)} className="text-indigo hover:underline" aria-label="Back to live">
          <Pause size={12} />
        </button>
      )}
    </div>
  );
}
