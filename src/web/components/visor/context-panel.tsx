import { useState } from "react";
import { motion } from "motion/react";
import { CONTEXT_CATEGORIES, type ContextBreakdown } from "@shared/events";
import { CONTEXT_META } from "@/lib/mock-data";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";
import { fmtTokens } from "./primitives";

/** The 7-category stacked bar (PRD §4.3). Width is relative to the window. */
export function ContextBar({ breakdown, limit, className }: { breakdown: ContextBreakdown; limit: number; className?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className={cn("relative", className)}>
      <div className="flex h-2.5 gap-px overflow-hidden rounded-full bg-white/[0.05]">
        {CONTEXT_CATEGORIES.map((c) => (
          <motion.span
            key={c}
            onMouseEnter={() => setHover(c)}
            onMouseLeave={() => setHover(null)}
            animate={{ width: `${(breakdown[c] / limit) * 100}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ background: CONTEXT_META[c].color, opacity: hover && hover !== c ? 0.35 : 1 }}
            className="h-full min-w-[2px]"
          />
        ))}
      </div>
      {hover && (
        <div className="pointer-events-none absolute left-0 top-4 z-10 rounded-md border border-border-strong bg-card px-2 py-1 text-[11px] shadow-xl">
          {CONTEXT_META[hover as keyof typeof CONTEXT_META].label}: {fmtTokens(breakdown[hover as keyof ContextBreakdown])} tokens
        </div>
      )}
    </div>
  );
}

export function ContextTable({ breakdown, limit }: { breakdown: ContextBreakdown; limit: number }) {
  const used = CONTEXT_CATEGORIES.reduce((n, c) => n + breakdown[c], 0);
  return (
    <table className="w-full text-[12.5px]">
      <tbody>
        {CONTEXT_CATEGORIES.map((c) => (
          <tr key={c} className="border-b border-border last:border-0" title={CONTEXT_META[c].hint}>
            <td className="py-1.5 pr-2">
              <span className="flex items-center gap-2">
                <i className="size-2 shrink-0 rounded-full" style={{ background: CONTEXT_META[c].color }} />
                <span className="truncate text-muted-foreground">{CONTEXT_META[c].label}</span>
              </span>
            </td>
            <td className="py-1.5 text-right font-mono text-foreground tabular">{fmtTokens(breakdown[c])}</td>
            <td className="w-12 py-1.5 text-right font-mono text-faint tabular">{used ? Math.round((breakdown[c] * 100) / used) : 0}%</td>
          </tr>
        ))}
        <tr>
          <td className="pt-2 text-faint">Free</td>
          <td className="pt-2 text-right font-mono text-faint tabular">{fmtTokens(Math.max(0, limit - used))}</td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}

/** Context per turn, with compaction boundaries marked. */
export function CompactionTimeline({ model }: { model: TraceModel }) {
  const hist = model.contextHistory;
  if (!hist.length) return <p className="text-[12px] text-faint">Finishes after the first turn.</p>;
  const max = Math.max(...hist.map((h) => h.used));
  return (
    <div className="flex items-end gap-3">
      {hist.map((h) => (
        <div key={h.turnIndex} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="font-mono text-[10.5px] text-faint tabular">{fmtTokens(h.used)}</span>
          <div className="flex h-20 w-full items-end justify-center">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${(h.used / max) * 100}%` }}
              className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-md"
            >
              {CONTEXT_CATEGORIES.map((c) => (
                <span key={c} style={{ height: `${(h.breakdown[c] / h.used) * 100}%`, background: CONTEXT_META[c].color }} />
              ))}
            </motion.div>
          </div>
          <span className={cn("text-[11px]", h.compacted ? "text-amber" : "text-faint")}>
            T{h.turnIndex + 1}
            {h.compacted && " · compacted"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ContextSummary({ model }: { model: TraceModel }) {
  const ctx = model.contextHistory.at(-1);
  if (!ctx) return <p className="text-[12.5px] text-faint">Context appears when the first turn finishes.</p>;
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between text-[13px]">
          <span className="text-foreground tabular">
            {fmtTokens(ctx.used)} <span className="text-faint">/ {fmtTokens(ctx.limit)} tokens</span>
          </span>
          <span className="font-mono text-[11px] text-faint">{((ctx.used / ctx.limit) * 100).toFixed(1)}%</span>
        </div>
        <ContextBar breakdown={ctx.breakdown} limit={ctx.used} />
      </div>
      <ContextTable breakdown={ctx.breakdown} limit={ctx.limit} />
    </div>
  );
}
