"use client";

import { motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Brain,
  ChevronUp,
  FilePen,
  FilePlus,
  FileText,
  Network,
  Wrench,
} from "lucide-react";

const ease = [0.22, 1, 0.36, 1] as const;

/* ---------- Span stream ---------- */

const steps = [
  { icon: BookOpen, verb: "Load skill", target: "release-notes", link: false },
  { icon: FileText, verb: "Read", target: "CHANGELOG.md", link: true },
  { icon: Brain, verb: "Thinking", target: "The last tag was v0.3.1, so this is a minor bump…", link: false, violet: true },
  { icon: Network, verb: "Subagent", target: "explore · 3 spans · $0.0031", link: false, violet: true },
  { icon: Wrench, verb: "MCP", target: "github · list_pull_requests", link: false, accent: true },
  { icon: FilePlus, verb: "Write", target: "docs/releases/v0.4.0.md", delta: "+48 −0", link: true },
  { icon: FilePen, verb: "Edit", target: "package.json", delta: "+1 −1", link: true },
];

export function SpanStream() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div ref={ref} className="px-1">
      <div className="mb-4 flex justify-end">
        <span className="rounded-2xl bg-white/[0.07] px-4 py-2.5 text-sm text-fg">Draft the v0.4 release notes.</span>
      </div>
      <div className="flex items-center gap-1.5 border-b border-line pb-2 text-[13px] text-fg-muted">
        Working · 7 spans <ChevronUp size={13} />
      </div>
      <ul className="mt-2 space-y-0.5">
        {steps.map((s, i) => (
          <motion.li
            key={s.verb + i}
            initial={{ opacity: 0, x: -8 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.25 + i * 0.22, ease }}
            className="flex h-8 min-w-0 items-center gap-2 text-[13px] text-fg-muted"
          >
            <s.icon size={14} className={s.violet ? "shrink-0 text-violet" : s.accent ? "shrink-0 text-accent" : "shrink-0 text-fg-faint"} />
            <span className={s.accent ? "shrink-0 text-accent" : "shrink-0 text-fg"}>{s.verb}</span>
            <span className="shrink-0 text-fg-faint">·</span>
            <span
              className={`truncate ${s.link ? "font-mono text-[12px] underline decoration-white/25 decoration-dotted underline-offset-4" : ""}`}
            >
              {s.target}
            </span>
            {s.delta && <span className="shrink-0 font-mono text-[12px] text-fg-faint tabular">{s.delta}</span>}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Cost receipt ---------- */

// Integer micro-dollars; formatted only here, at the UI edge.
const receipt = [
  { label: "Fresh input", tokens: 3_412, micro: 13_648 },
  { label: "Cache write · 5m", tokens: 1_920, micro: 9_600 },
  { label: "Cache read", tokens: 48_210, micro: 9_642 },
  { label: "Output + thinking", tokens: 1_388, micro: 27_760 },
];
const total = receipt.reduce((n, r) => n + r.micro, 0);
const saved = 183_198; // what the cache reads would have cost as fresh input

const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`;

function useTicker(target: number, run: boolean, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

export function CostReceipt() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const shown = useTicker(total, inView);
  return (
    <div ref={ref} className="font-mono text-[12.5px]">
      <div className="text-[34px] font-medium tracking-tight text-fg tabular">{usd(shown)}</div>
      <div className="mt-1 text-[12px] text-emerald tabular">−{usd(saved)} saved by prompt cache</div>
      <div className="mt-5 space-y-2 border-t border-dashed border-line-strong pt-4">
        {receipt.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 tabular">
            <span className="truncate text-fg-muted">{r.label}</span>
            <span className="ml-auto text-fg-faint">{r.tokens.toLocaleString("en-US")}</span>
            <span className="w-16 text-right text-fg">{usd(r.micro)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Context bar ---------- */

const ctx = [
  { name: "Project rules", pct: 6, color: "#7aa2ff" },
  { name: "MCP & tool schemas", pct: 14, color: "#5eead4" },
  { name: "Mentioned files", pct: 9, color: "#fbbf24" },
  { name: "Tool results", pct: 31, color: "#34d399" },
  { name: "Thinking", pct: 12, color: "#a78bfa" },
  { name: "Subagents", pct: 8, color: "#f472b6" },
  { name: "Messages", pct: 20, color: "#94a3b8" },
];

export function ContextBar() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div ref={ref}>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-fg tabular">412k / 1M tokens</span>
        <span className="text-fg-faint">turn 9</span>
      </div>
      <div className="mt-3 flex h-3 gap-[2px] overflow-hidden rounded-full bg-white/[0.04]">
        {ctx.map((c, i) => (
          <motion.span
            key={c.name}
            initial={{ width: 0 }}
            animate={inView ? { width: `${c.pct * 0.412}%` } : {}}
            transition={{ duration: 0.9, delay: 0.1 + i * 0.08, ease }}
            style={{ background: c.color }}
            className="h-full first:rounded-l-full"
          />
        ))}
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        {ctx.map((c) => (
          <li key={c.name} className="flex min-w-0 items-center gap-2 text-fg-muted">
            <i className="size-2 shrink-0 rounded-full" style={{ background: c.color }} />
            <span className="truncate">{c.name}</span>
            <span className="ml-auto text-fg-faint tabular">{c.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Waterfall ---------- */

const lanes = [
  { name: "turn 3", start: 0, len: 100, color: "bg-white/15" },
  { name: "llm", start: 0, len: 22, color: "bg-accent/70" },
  { name: "thinking", start: 4, len: 14, color: "bg-violet/70" },
  { name: "read", start: 23, len: 6, color: "bg-emerald/70" },
  { name: "subagent", start: 30, len: 38, color: "bg-violet/50" },
  { name: "mcp", start: 36, len: 18, color: "bg-accent/50" },
  { name: "bash", start: 70, len: 24, color: "bg-rose/70", error: true },
];

export function Waterfall() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div ref={ref} className="space-y-2 font-mono text-[11px]">
      {lanes.map((l, i) => (
        <div key={l.name} className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-fg-faint" style={{ paddingLeft: i === 0 ? 0 : i === 2 || i === 5 ? 16 : 8 }}>
            {l.name}
          </span>
          <div className="relative h-4 flex-1">
            <motion.span
              initial={{ scaleX: 0 }}
              animate={inView ? { scaleX: 1 } : {}}
              transition={{ duration: 0.7, delay: 0.15 + i * 0.1, ease }}
              style={{ left: `${l.start}%`, width: `${l.len}%`, transformOrigin: "0 50%" }}
              className={`absolute inset-y-0 rounded ${l.color} ${l.error ? "ring-1 ring-rose" : ""}`}
            />
          </div>
        </div>
      ))}
      <div className="flex justify-between pl-[76px] pt-1 text-fg-faint tabular">
        <span>0ms</span>
        <span>2.1s</span>
        <span>4.2s</span>
      </div>
    </div>
  );
}
