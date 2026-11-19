"use client";

import { motion } from "motion/react";
import { Database, Gauge, Layers, MonitorSmartphone, Server } from "lucide-react";
import { SectionHeading } from "./section-heading";

const layers = [
  {
    n: "01",
    icon: MonitorSmartphone,
    name: "Desktop & web GUI",
    detail: "React 19 · Tailwind · Shiki · Cmd+K · Electron shell",
    chips: ["Live stream", "Override cards", "Context bar"],
  },
  {
    n: "02",
    icon: Server,
    name: "Local harness daemon",
    detail: "Hono HTTP + WebSocket on 127.0.0.1:4310",
    chips: ["Policy evaluator", "Breakpoint queue", "Budget watchdog"],
  },
  {
    n: "03",
    icon: Layers,
    name: "Agent runtime adapters",
    detail: "Claude Agent SDK + MCP, or a zero-cost mock",
    chips: ["ClaudeSdkAdapter", "MockRuntimeAdapter"],
  },
  {
    n: "04",
    icon: Gauge,
    name: "Telemetry & cost engine",
    detail: "Span trees, dedup by message_id, integer µUSD",
    chips: ["Span builder", "7-category context", "Reconciler"],
  },
  {
    n: "05",
    icon: Database,
    name: "Local persistence",
    detail: "SQLite (WAL) + Drizzle at ~/.visor/traces.db, 0600",
    chips: ["sessions", "spans", "credit_ledger", "policy_audit_log"],
  },
];

export function Architecture() {
  return (
    <section id="architecture" className="relative mx-auto max-w-5xl scroll-mt-24 px-4 py-24 sm:py-32">
      <SectionHeading
        eyebrow="100% local-first"
        title="Five layers. Nothing leaves your machine."
        body="The GUI and the runtime talk over a localhost WebSocket with a per-launch token. No telemetry, prompts, or code ever go to a cloud server."
      />
      <div className="relative mt-16">
        <div aria-hidden className="absolute bottom-6 left-[27px] top-6 w-px bg-gradient-to-b from-accent/60 via-violet/40 to-emerald/50 sm:left-[35px]" />
        <ol className="space-y-3">
          {layers.map((l, i) => (
            <motion.li
              key={l.n}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex gap-4 sm:gap-6"
            >
              <span className="relative z-10 flex size-14 shrink-0 items-center justify-center rounded-2xl border border-line-strong bg-panel sm:size-[70px]">
                <l.icon size={20} className="text-fg-muted" />
              </span>
              <div className="min-w-0 flex-1 rounded-2xl border border-line bg-panel/80 px-5 py-4 backdrop-blur">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-fg-faint">L{l.n}</span>
                  <h3 className="font-medium text-fg">{l.name}</h3>
                  <span className="text-sm text-fg-muted">{l.detail}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {l.chips.map((c) => (
                    <span key={c} className="rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-fg-muted">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
