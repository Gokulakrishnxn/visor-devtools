import type { ReactNode } from "react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";
import { DiffCard } from "./diff-card";
import { ContextStage, CostStage, SpanStage, WaterfallStage } from "./feature-stages";

function Card({
  title,
  body,
  children,
  className = "",
  delay = 0,
}: {
  title: string;
  body: string;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <Reveal
      delay={delay}
      className={`flex flex-col overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-[#12151b] to-[#0c0e12] p-6 sm:p-8 ${className}`}
    >
      <h3 className="text-xl font-medium tracking-tight text-fg">{title}</h3>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-fg-muted">{body}</p>
      <div className="mt-8 flex-1">{children}</div>
    </Reveal>
  );
}

export function Features() {
  return (
    <section id="features" className="relative mx-auto max-w-6xl scroll-mt-24 px-4 py-24 sm:py-32">
      <SectionHeading
        eyebrow="Inspection, not summaries"
        title="See what the agent actually did."
        body="Real selectable text, syntax-highlighted diffs, and numbers that never jitter. Everything a terminal hides, laid out like a developer tool."
      />
      <div className="mt-16 grid gap-4 lg:grid-cols-6">
        <Card
          className="lg:col-span-3"
          title="Every step, in the open"
          body="Thinking, reads, MCP calls, and subagents stream in as spans the moment they start. No more “Edited 2 files”."
        >
          <SpanStage />
        </Card>
        <Card
          className="lg:col-span-3"
          delay={0.08}
          title="Diffs you can actually read"
          body="Each Edit span carries its unified diff with Shiki highlighting, one-click copy, and Open in Cursor, VS Code, or Zed."
        >
          <DiffCard />
        </Card>
        <Card
          className="lg:col-span-2"
          title="Cost, to the micro-dollar"
          body="Integer micro-dollar accounting per bucket, reconciled against the SDK's own totals."
        >
          <CostStage />
        </Card>
        <Card
          className="lg:col-span-2"
          delay={0.08}
          title="Context in seven colors"
          body="Know exactly what fills the window before compaction hits."
        >
          <ContextStage />
        </Card>
        <Card
          className="lg:col-span-2"
          delay={0.16}
          title="Spans as a waterfall"
          body="Find the slow tool, the failing Bash, the subagent that ate the budget."
        >
          <WaterfallStage />
        </Card>
      </div>
    </section>
  );
}
