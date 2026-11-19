import { useState, type ReactNode } from "react";
import { Brain, Check, Copy, Cpu, FilePen, FileText, Layers, Network, ShieldAlert, SquareTerminal, Wrench } from "lucide-react";
import type { SpanStatus, SpanType } from "@shared/events";
import { formatUsd } from "@shared/money";
import { cn } from "@/lib/utils";

export function Usd({ micro, className, decimals = 4 }: { micro: number; className?: string; decimals?: 2 | 4 | 6 }) {
  return <span className={cn("tabular", className)}>{formatUsd(micro, decimals)}</span>;
}

export const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-US"));
export const fmtMs = (ms?: number) => (ms === undefined ? "…" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn("rounded border border-white/10 bg-white/[0.04] px-1 font-mono text-[10px] leading-4 text-faint", className)}>{children}</kbd>
  );
}

export const SPAN_ICON: Record<SpanType, typeof FileText> = {
  llm: Cpu,
  thinking: Brain,
  read: FileText,
  edit: FilePen,
  bash: SquareTerminal,
  mcp: Wrench,
  subagent: Network,
  compaction: Layers,
  override: ShieldAlert,
};

export const SPAN_LABEL: Record<SpanType, string> = {
  llm: "Model",
  thinking: "Thinking",
  read: "Read",
  edit: "Edit",
  bash: "Bash",
  mcp: "MCP",
  subagent: "Subagent",
  compaction: "Compaction",
  override: "Override",
};

/** Saturated color only for state (PRD §2). */
export function spanTone(type: SpanType): string {
  if (type === "thinking" || type === "subagent") return "text-violet";
  if (type === "mcp") return "text-indigo";
  return "text-faint";
}

export const STATUS_TONE: Record<SpanStatus, string> = {
  running: "text-muted-foreground",
  paused: "text-amber",
  ok: "text-emerald",
  error: "text-rose",
  denied: "text-rose",
  edited: "text-amber",
};

export function StatusDot({ status, className }: { status: SpanStatus; className?: string }) {
  const bg = { running: "bg-white/40 animate-pulse", paused: "bg-amber animate-pulse", ok: "bg-emerald", error: "bg-rose", denied: "bg-rose", edited: "bg-amber" }[status];
  return <i className={cn("inline-block size-1.5 shrink-0 rounded-full", bg, className)} />;
}

export function CopyButton({ text, className, label = "Copy" }: { text: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className={cn("inline-flex size-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-white/10 hover:text-foreground", className)}
    >
      {done ? <Check size={13} className="text-emerald" /> : <Copy size={13} />}
    </button>
  );
}

/** A thin progress ring (context %, budget %). */
export function Ring({ value, size = 22, tone = "#7aa2ff", label }: { value: number; size?: number; tone?: string; label?: string }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - v)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)" }}
      />
    </svg>
  );
}

/** "Open in…" launcher (PRD §1 non-goal: no IDE, just hand off). */
export function OpenIn({ path }: { path: string }) {
  const editors = [
    { name: "Cursor", href: `cursor://file/${path}` },
    { name: "VS Code", href: `vscode://file/${path}` },
    { name: "Zed", href: `zed://file/${path}` },
  ];
  return (
    <span className="flex items-center gap-1">
      {editors.map((e) => (
        <a key={e.name} href={e.href} onClick={(ev) => ev.stopPropagation()} className="rounded px-1.5 py-0.5 text-[11px] text-faint hover:bg-white/10 hover:text-foreground">
          {e.name}
        </a>
      ))}
    </span>
  );
}
