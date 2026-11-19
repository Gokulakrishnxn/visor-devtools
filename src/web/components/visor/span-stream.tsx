import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import type { TraceModel, TraceSpan } from "@/lib/trace-model";
import { cn } from "@/lib/utils";
import { BreakpointCard } from "./breakpoint-card";
import { CodeView, DiffView, JsonView, diffStats } from "./code";
import { CopyButton, OpenIn, SPAN_ICON, SPAN_LABEL, StatusDot, Usd, fmtMs, fmtTokens, spanTone } from "./primitives";

export type StreamOptions = {
  diffMode?: "unified" | "split";
  /** Roomier cards (Linear Focus) vs compact rows (Studio). */
  spacious?: boolean;
  /** Where the breakpoint card renders; "none" when the design docks it elsewhere. */
  breakpoint?: "inline" | "none";
  selectedId?: string | null;
  onSelect?: (spanId: string) => void;
};

const dur = (s: TraceSpan) => (s.endedAt ? s.endedAt - s.startedAt : undefined);

/** Header row shared by every span card. */
function SpanHeader({ span, open, onToggle, extra }: { span: TraceSpan; open?: boolean; onToggle?: () => void; extra?: ReactNode }) {
  const Icon = SPAN_ICON[span.spanType];
  return (
    <div className="flex min-w-0 items-center gap-2 text-[13px]">
      {onToggle && (
        <ChevronRight size={13} className={cn("shrink-0 text-faint transition-transform", open && "rotate-90")} />
      )}
      <Icon size={14} className={cn("shrink-0", spanTone(span.spanType))} />
      <span className={cn("shrink-0", span.spanType === "thinking" ? "text-violet" : "text-foreground")}>{SPAN_LABEL[span.spanType]}</span>
      <span className="shrink-0 text-faint">·</span>
      <span className={cn("truncate text-muted-foreground", span.filePath && "font-mono text-[12px] underline decoration-white/20 decoration-dotted underline-offset-4")}>
        {span.spanType === "thinking" ? span.text.slice(0, 90) || "…" : span.name}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2 pl-2 font-mono text-[11px] text-faint">
        {extra}
        {span.costMicroUsd > 0 && <Usd micro={span.costMicroUsd} className="text-emerald/90" />}
        <span className="tabular">{fmtMs(dur(span))}</span>
        <StatusDot status={span.status} />
      </span>
    </div>
  );
}

function Card({ span, opts, children, defaultOpen = false, extra }: { span: TraceSpan; opts: StreamOptions; children?: ReactNode; defaultOpen?: boolean; extra?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const selected = opts.selectedId === span.spanId;
  return (
    <div
      id={`span-${span.spanId}`}
      data-span={span.spanId}
      className={cn(
        "group rounded-lg border transition-colors",
        opts.spacious ? "px-4 py-3" : "px-3 py-2",
        selected ? "border-indigo/50 bg-indigo/[0.06]" : "border-transparent hover:border-border hover:bg-white/[0.02]",
        (span.status === "denied" || span.status === "error") && "border-rose/20 bg-rose/[0.04]",
      )}
    >
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => {
          opts.onSelect?.(span.spanId);
          if (children) setOpen((o) => !o);
        }}
        aria-expanded={children ? open : undefined}
      >
        <SpanHeader span={span} open={open} onToggle={children ? () => undefined : undefined} extra={extra} />
      </button>
      {span.error && <p className="mt-1.5 pl-6 text-[12.5px] text-rose">{span.error}</p>}
      {span.breakpoint?.decision && span.breakpoint.decision !== "auto_blocked" && (
        <p className="mt-1.5 pl-6 text-[12px] text-faint">
          Override: <span className={span.breakpoint.decision === "approved" ? "text-emerald" : span.breakpoint.decision === "edited" ? "text-amber" : "text-rose"}>{span.breakpoint.decision}</span>
          {span.breakpoint.rule && <> · rule {span.breakpoint.rule}</>}
        </p>
      )}
      <AnimatePresence initial={false}>
        {open && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-2.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Panel({ children, actions, label }: { children: ReactNode; actions?: ReactNode; label?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-code">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11px] text-faint">
        <span className="truncate font-mono">{label}</span>
        <span className="ml-auto flex items-center gap-1">{actions}</span>
      </div>
      {children}
    </div>
  );
}

function SpanNode({ model, id, opts }: { model: TraceModel; id: string; opts: StreamOptions }) {
  const span = model.spans[id];
  if (!span) return null;
  const kids = span.children.map((c) => <SpanNode key={c} model={model} id={c} opts={opts} />);
  const paused = model.paused?.spanId === id && opts.breakpoint !== "none";

  switch (span.spanType) {
    case "llm":
      // The model call itself is quiet: its thinking, text and tools carry the story.
      return (
        <>
          {kids.filter((_, i) => model.spans[span.children[i]!]?.spanType === "thinking")}
          {span.text && (
            <div className={cn("whitespace-pre-wrap text-[14px] leading-relaxed text-foreground", opts.spacious ? "px-4 py-2" : "px-3 py-1.5")}>{span.text}</div>
          )}
          {kids.filter((_, i) => model.spans[span.children[i]!]?.spanType !== "thinking")}
        </>
      );
    case "thinking":
      return (
        <Card span={span} opts={opts} extra={<span>{fmtTokens(Math.ceil(span.text.length / 4))} tok</span>}>
          <div className="ml-6 border-l-2 border-violet/40 pl-3 text-[13px] italic leading-relaxed text-violet/90">
            {span.text}
            {span.status === "running" && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-violet/70 align-middle" />}
          </div>
        </Card>
      );
    case "read":
      return (
        <Card span={span} opts={opts} extra={typeof span.output === "string" ? <span>{span.output.split("\n").length} lines</span> : null}>
          {typeof span.output === "string" ? (
            <Panel label={span.filePath ?? span.name} actions={<>{span.filePath && <OpenIn path={span.filePath} />}<CopyButton text={span.output} /></>}>
              <CodeView code={span.output} path={span.filePath} maxLines={16} />
            </Panel>
          ) : (
            <Panel label={span.name} actions={<CopyButton text={JSON.stringify(span.output, null, 2)} />}>
              <JsonView value={span.output} className="px-3 py-2" />
            </Panel>
          )}
        </Card>
      );
    case "edit": {
      const stats = span.diff ? diffStats(span.diff) : null;
      return (
        <Card
          span={span}
          opts={opts}
          defaultOpen
          extra={stats && <span><span className="text-emerald">+{stats.added}</span> <span className="text-rose">−{stats.removed}</span></span>}
        >
          {span.diff && (
            <Panel label={span.filePath} actions={<>{span.filePath && <OpenIn path={span.filePath} />}<CopyButton text={span.diff} label="Copy diff" /></>}>
              <DiffView diff={span.diff} path={span.filePath} mode={opts.diffMode} />
            </Panel>
          )}
        </Card>
      );
    }
    case "bash":
      return (
        <>
          <Card span={span} opts={opts} defaultOpen={Boolean(span.text)}>
            {Boolean(span.text || span.input) && (
              <Panel label={`$ ${(span.input as { command?: string })?.command ?? span.name}`} actions={<CopyButton text={span.text} />}>
                <pre className="max-h-48 overflow-auto px-3 py-2 font-mono text-[12px] leading-5 text-muted-foreground">{span.text || "(no output yet)"}</pre>
              </Panel>
            )}
          </Card>
          {paused && <BreakpointCard key={span.spanId} paused={model.paused!} />}
        </>
      );
    case "mcp":
      return (
        <Card span={span} opts={opts}>
          <div className="grid gap-2 sm:grid-cols-2">
            <Panel label="request" actions={<CopyButton text={JSON.stringify(span.input, null, 2)} />}>
              <JsonView value={span.input} className="px-3 py-2" />
            </Panel>
            <Panel label="response" actions={<CopyButton text={JSON.stringify(span.output, null, 2)} />}>
              <JsonView value={span.output ?? null} className="px-3 py-2" />
            </Panel>
          </div>
        </Card>
      );
    case "subagent":
      return (
        <div className="rounded-xl border border-violet/20 bg-violet/[0.03]">
          <Card span={span} opts={opts} extra={<span>{span.children.length} span{span.children.length === 1 ? "" : "s"}</span>} />
          <div className="ml-5 border-l border-violet/25 pb-1 pl-2">{kids}</div>
        </div>
      );
    case "compaction": {
      const o = span.output as { beforeTokens?: number; afterTokens?: number } | undefined;
      return (
        <div className="flex items-center gap-3 px-3 py-2 text-[12px] text-faint">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber/40" />
          <span className="text-amber/90">
            Context compacted{o?.beforeTokens ? ` · ${fmtTokens(o.beforeTokens)} → ${fmtTokens(o.afterTokens ?? 0)} tokens` : "…"}
          </span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-amber/40" />
        </div>
      );
    }
    default:
      return <Card span={span} opts={opts} />;
  }
}

/** The conversation + span stream for every turn. */
export function SpanStream({ model, opts = {} }: { model: TraceModel; opts?: StreamOptions }) {
  return (
    <div className="space-y-6">
      {model.turns.map((turn) => (
        <section key={turn.turnId} className="space-y-1.5" aria-label={`Turn ${turn.index + 1}`}>
          <div className="mb-3 flex justify-end">
            <div className="max-w-[80%] rounded-2xl bg-white/[0.07] px-4 py-2.5 text-[14px] text-foreground">{turn.prompt}</div>
          </div>
          {turn.rootSpanIds.map((id) => (
            <SpanNode key={id} model={model} id={id} opts={opts} />
          ))}
          {turn.costMicroUsd !== undefined && (
            <div className="flex items-center justify-end gap-3 px-3 pt-1 font-mono text-[11px] text-faint">
              <span>turn {turn.index + 1}</span>
              <Usd micro={turn.costMicroUsd} className="text-emerald/80" />
              {turn.context && <span>{fmtTokens(turn.context.used)} ctx</span>}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
