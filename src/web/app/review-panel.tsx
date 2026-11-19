import { useState } from "react";
import { ChevronDown, Columns2, Rows2, X } from "lucide-react";
import { CodeView, DiffView, diffStats } from "@/components/visor/code";
import { CopyButton, OpenIn } from "@/components/visor/primitives";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";

/**
 * "Review · turn N": the files a turn read or changed, one at a time, with
 * a file switcher, +/− counts, unified or split diff, copy and Open in….
 */
export function ReviewPanel({ model, turnId, spanId, onSpan, onClose }: { model: TraceModel; turnId: string; spanId: string; onSpan: (id: string) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"unified" | "split">("unified");
  const [menu, setMenu] = useState(false);
  const turn = model.turns.find((t) => t.turnId === turnId);
  const files = model.order
    .map((id) => model.spans[id]!)
    .filter((s) => s.turnId === turnId && (s.spanType === "edit" || s.spanType === "read") && (s.diff || typeof s.output === "string"));
  const span = model.spans[spanId] ?? files[0];
  if (!turn || !span) return null;
  const stats = span.diff ? diffStats(span.diff) : null;
  const path = span.filePath ?? span.name;

  return (
    <div className="flex h-full flex-col bg-[var(--panel)]">
      <div className="flex items-center gap-2 px-3 pt-3">
        <span className="flex items-center gap-2 rounded-xl bg-white/[0.07] px-3 py-1.5 text-[13.5px]">
          Review · turn {turn.index + 1}
          <button type="button" aria-label="Close review" onClick={onClose} className="text-white/50 hover:text-foreground">
            <X size={14} />
          </button>
        </span>
      </div>
      <div className="relative flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
        <button type="button" onClick={() => setMenu((m) => !m)} className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 font-mono text-[13px] hover:bg-white/[0.06]" aria-expanded={menu}>
          <span className="rounded bg-indigo/20 px-1 text-[10px] font-semibold text-indigo">{path.split(".").pop()?.toUpperCase()}</span>
          <span className="truncate">{path}</span>
          <ChevronDown size={13} className="shrink-0 text-white/40" />
        </button>
        {menu && (
          <div className="absolute left-3 top-10 z-20 w-72 rounded-xl border border-white/10 bg-popover p-1 shadow-2xl">
            {files.map((f) => (
              <button
                key={f.spanId}
                type="button"
                onClick={() => (onSpan(f.spanId), setMenu(false))}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-mono text-[12.5px] hover:bg-white/[0.06]", f.spanId === span.spanId && "bg-white/[0.06]")}
              >
                <span className="truncate">{f.filePath ?? f.name}</span>
                <span className="ml-auto shrink-0 font-sans text-[11px] text-white/40">{f.spanType === "edit" ? "edited" : "read"}</span>
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[13px] tabular">
          {stats && (
            <>
              <span className="text-emerald">+{stats.added}</span>
              <span className="text-rose">−{stats.removed}</span>
            </>
          )}
          {span.diff && (
            <button
              type="button"
              onClick={() => setMode((m) => (m === "unified" ? "split" : "unified"))}
              aria-label={mode === "unified" ? "Side by side" : "Unified"}
              title={mode === "unified" ? "Side by side" : "Unified"}
              className="rounded p-1 text-white/50 hover:bg-white/[0.08] hover:text-foreground"
            >
              {mode === "unified" ? <Columns2 size={15} /> : <Rows2 size={15} />}
            </button>
          )}
          <CopyButton text={span.diff ?? String(span.output ?? "")} label={span.diff ? "Copy diff" : "Copy file"} />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {span.diff ? <DiffView diff={span.diff} path={path} mode={mode} className="text-[12.5px]" /> : <CodeView code={String(span.output ?? "")} path={path} />}
      </div>
      <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-2 text-[12px] text-white/45">
        Open in
        <OpenIn path={path} />
      </div>
    </div>
  );
}
