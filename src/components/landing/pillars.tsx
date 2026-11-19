"use client";

import { motion } from "motion/react";
import { Activity, Eye, GitFork, Hand, Cpu } from "lucide-react";
import { SectionHeading } from "./section-heading";

const pillars = [
  {
    letter: "V",
    name: "Verified",
    icon: Activity,
    tone: "text-emerald",
    body: "Grounded in real execution data: exact token counts, prompt-cache savings, and real-money USD per prompt. No rough estimates.",
  },
  {
    letter: "I",
    name: "Inspection",
    icon: Eye,
    tone: "text-accent",
    body: "Live visibility behind the scenes: streaming reasoning, context-window usage, and raw tool inputs and outputs as they happen.",
  },
  {
    letter: "S",
    name: "Spans",
    icon: GitFork,
    tone: "text-violet",
    body: "Every prompt becomes a nested tree of timed spans across model calls, MCP tools, and subagents, so spikes in latency, errors, or spend are obvious.",
  },
  {
    letter: "O",
    name: "Overrides",
    icon: Hand,
    tone: "text-amber",
    body: "Active control instead of passive logs: freeze the agent mid-flight, edit tool JSON before it runs, and enforce hard dollar caps.",
  },
  {
    letter: "R",
    name: "Runtime",
    icon: Cpu,
    tone: "text-clay",
    body: "Not a post-run log viewer. It is the harness itself, driving the agent loop, tool execution, and guardrails on your machine.",
  },
];

export function Pillars() {
  return (
    <section id="pillars" className="relative mx-auto max-w-6xl scroll-mt-24 px-4 py-24 sm:py-32">
      <SectionHeading
        eyebrow="Five letters, one harness"
        title={
          <>
            Verified Inspection, Spans,
            <br className="hidden sm:block" /> Overrides &amp; Runtime.
          </>
        }
        body="Terminal agents collapse everything into “Edited 2 files”. V.I.S.O.R. opens the box."
      />

      <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {pillars.map((p, i) => (
          <motion.article
            key={p.letter}
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -4 }}
            className="group relative overflow-hidden rounded-2xl border border-line bg-panel p-6 transition-colors hover:border-line-strong"
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-5xl font-medium text-fg/90">{p.letter}</span>
              <p.icon size={18} className={p.tone} />
            </div>
            <h3 className={`mt-6 text-sm font-medium ${p.tone}`}>{p.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{p.body}</p>
            <div className="pointer-events-none absolute -bottom-16 -right-16 size-40 rounded-full bg-white/[0.03] blur-2xl transition-opacity group-hover:opacity-100" />
          </motion.article>
        ))}
      </div>
    </section>
  );
}
