import { Wallet } from "lucide-react";
import { formatUsd } from "@shared/money";
import { WALLET_BEFORE_MICRO } from "@/lib/mock-data";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";
import { Usd } from "@/components/visor/primitives";

// Small HUD pieces several designs share.

export const MODEL_LABEL: Record<string, string> = {
  "claude-opus-5-5": "Opus 5.5",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-haiku-4-5": "Haiku 4.5",
};

export function cacheHit(model: TraceModel) {
  const cacheable = model.usage.cacheReadTokens + model.usage.inputTokens;
  return cacheable ? Math.round((model.usage.cacheReadTokens * 100) / cacheable) : 0;
}

export function CostPill({ model, className }: { model: TraceModel; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 items-center rounded-full bg-emerald/10 px-3 font-mono text-[12px] text-emerald", className)} title="Session cost so far">
      <Usd micro={model.cost.total} />
    </span>
  );
}

export function CachePill({ model }: { model: TraceModel }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.05] px-3 font-mono text-[12px] text-muted-foreground" title="Prompt cache savings">
      {cacheHit(model)}% hit · <span className="text-emerald">−{formatUsd(model.cost.cacheSavings)}</span>
    </span>
  );
}

export function WalletPill({ model }: { model: TraceModel }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-3 font-mono text-[12px] text-foreground" title="Prepaid credit left">
      <Wallet size={13} className="text-faint" />
      <Usd micro={WALLET_BEFORE_MICRO - model.cost.total} decimals={2} /> <span className="text-faint">left</span>
    </span>
  );
}

export function BudgetBar({ model, className }: { model: TraceModel; className?: string }) {
  const cap = model.session?.capMicroUsd;
  if (!cap) return null;
  const pct = Math.min(1, model.cost.total / cap);
  const tone = pct >= 1 ? "bg-rose" : pct >= 0.8 ? "bg-amber" : "bg-emerald";
  return (
    <span className={cn("flex items-center gap-2 font-mono text-[11px] text-faint", className)} title="Hard budget cap">
      <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.07]">
        <span className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", tone)} style={{ width: `${pct * 100}%` }} />
      </span>
      <span className="tabular">cap {formatUsd(cap, 2)}</span>
    </span>
  );
}

export function SessionStatus({ model }: { model: TraceModel }) {
  const s = model.session?.status ?? "running";
  const map = {
    running: ["bg-white/50 animate-pulse", "Running"],
    paused: ["bg-amber animate-pulse", "Paused"],
    completed: ["bg-emerald", "Completed"],
    aborted_budget: ["bg-rose", "Budget cap hit"],
    error: ["bg-rose", "Error"],
  } as const;
  const [dot, label] = map[s];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <i className={cn("size-1.5 rounded-full", dot)} /> {label}
    </span>
  );
}
