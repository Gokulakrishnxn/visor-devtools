import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, ChevronUp, FileCode2, FileJson2, FileText as FileTextIcon } from "lucide-react";
import { BreakpointCard } from "@/components/visor/breakpoint-card";
import { diffStats } from "@/components/visor/code";
import { SPAN_ICON, StatusDot, Usd, fmtMs, fmtTokens } from "@/components/visor/primitives";
import type { TraceModel, TraceSpan, TraceTurn } from "@/lib/trace-model";
import { cn } from "@/lib/utils";

const VERB: Partial<Record<TraceSpan["spanType"], string>> = {
  thinking: "Thinking",
  read: "Read",
  edit: "Edit",
  bash: "Bash",
  mcp: "Tool call",
  subagent: "Subagent",
  compaction: "Compaction",
};

/** Steps of a turn in order, flattened through model calls, keeping subagent nesting. */
function stepsOf(model: TraceModel, ids: string[], depth = 0): { span: TraceSpan; depth: number }[] {
  const out: { span: TraceSpan; depth: number }[] = [];
  for (const id of ids) {
    const s = model.spans[id];
    if (!s) continue;
    if (s.spanType === "llm") out.push(...stepsOf(model, s.children, depth));
    else {
      out.push({ span: s, depth });
      if (s.spanType === "subagent") out.push(...stepsOf(model, s.children, depth + 1));
    }
  }
  return out;
}

/** Assistant text of the turn (the last model call that said something). */
function answerOf(model: TraceModel, turn: TraceTurn): string {
  const texts = model.order.map((id) => model.spans[id]!).filter((s) => s.turnId === turn.turnId && s.spanType === "llm" && s.parentSpanId === null && s.text);
  return texts.at(-1)?.text ?? "";
}

export type ConversationProps = {
  model: TraceModel;
  selectedId: string | null;
  onSelect: (spanId: string) => void;
  onReview: (turnId: string, spanId: string) => void;
};

export function Conversation({ model, selectedId, onSelect, onReview }: ConversationProps) {
  return (
    <div className="space-y-10">
      {model.turns.map((t) => (
        <Turn key={t.turnId} model={model} turn={t} selectedId={selectedId} onSelect={onSelect} onReview={onReview} />
      ))}
    </div>
  );
}

function Turn({ model, turn, selectedId, onSelect, onReview }: ConversationProps & { turn: TraceTurn }) {
  const done = turn.endedAt !== undefined;
  const paused = model.paused && model.spans[model.paused.spanId]?.turnId === turn.turnId;
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? (!done || Boolean(paused));
  const steps = stepsOf(model, turn.rootSpanIds);
  const answer = answerOf(model, turn);
  const edits = steps.filter((s) => s.span.spanType === "edit" && s.span.diff);
  const seconds = done ? ((turn.endedAt! - turn.startedAt) / 1000).toFixed(1) : null;
  const toolCount = steps.filter((s) => s.span.spanType !== "thinking").length;

  return (
    <section aria-label={`Turn ${turn.index + 1}`}>
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-[22px] bg-[var(--bubble)] px-5 py-3 text-[15px] leading-relaxed text-foreground">{turn.prompt}</div>
      </div>

      <div className="mt-7">
        <button
          type="button"
          onClick={() => setUserOpen(!open)}
          className="flex w-full items-center gap-1.5 border-b border-white/[0.08] pb-3 text-left text-[14px] text-white/55 hover:text-white/80"
          aria-expanded={open}
        >
          {done ? (
            <>
              Thought for {seconds}s<span className="text-white/35"> · {toolCount} steps</span>
              {turn.costMicroUsd !== undefined && (
                <span className="text-white/35">
                  {" "}
                  · <Usd micro={turn.costMicroUsd} />
                </span>
              )}
            </>
          ) : paused ? (
            <span className="text-amber">Paused for your decision</span>
          ) : (
            <span className="bg-[linear-gradient(90deg,rgba(255,255,255,.45),rgba(255,255,255,.9),rgba(255,255,255,.45))] bg-[length:200%_100%] bg-clip-text text-transparent [animation:shimmer_1.6s_linear_infinite]">
              Deep diving…
            </span>
          )}
          {open ? <ChevronUp size={15} className="text-white/40" /> : <ChevronRight size={15} className="text-white/40" />}
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden pt-2"
            >
              {steps.map(({ span, depth }) => (
                <Step
                  key={span.spanId}
                  span={span}
                  alerts={model.alerts.filter((a) => a.spanId === span.spanId && !a.id.startsWith("bp-") && !a.id.startsWith("spike-"))}
                  agent={span.spanType === "subagent" ? model.agents.find((a) => a.spanId === span.spanId) : undefined}
                  depth={depth}
                  selected={selectedId === span.spanId}
                  onClick={() => {
                    onSelect(span.spanId);
                    if (span.spanType === "edit" || span.spanType === "read") onReview(turn.turnId, span.spanId);
                  }}
                />
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        {paused && model.paused && (
          <div className="mt-3">
            <BreakpointCard key={model.paused.spanId} paused={model.paused} />
          </div>
        )}
      </div>

      {answer && <div className="mt-5 whitespace-pre-wrap text-[15.5px] leading-[1.75] text-foreground/95">{answer}</div>}

      {edits.length > 0 && done && (
        <div className="mt-5 flex flex-wrap gap-2.5">
          {edits.map(({ span }) => (
            <FileCard key={span.spanId} span={span} onClick={() => (onSelect(span.spanId), onReview(turn.turnId, span.spanId))} />
          ))}
        </div>
      )}
    </section>
  );
}

function Step({ span, depth, selected, onClick, alerts, agent }: { span: TraceSpan; depth: number; selected: boolean; onClick: () => void; alerts: TraceModel["alerts"]; agent?: TraceModel["agents"][number] }) {
  const [open, setOpen] = useState(false);
  const Icon = SPAN_ICON[span.spanType];
  const isFile = span.spanType === "read" || span.spanType === "edit";
  const stats = span.diff ? diffStats(span.diff) : null;
  const thinking = span.spanType === "thinking";
  const accent = span.spanType === "mcp" || span.spanType === "subagent";
  const failed = span.status === "denied" || span.status === "error";

  return (
    <li id={`span-${span.spanId}`} style={{ paddingLeft: depth * 22 }} className={cn(depth > 0 && "relative before:absolute before:bottom-0 before:left-[7px] before:top-0 before:w-px before:bg-white/[0.08]")}>
      <button
        type="button"
        onClick={() => (thinking ? setOpen((o) => !o) : null, onClick())}
        className={cn(
          "group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-[7px] text-left text-[14px] transition-colors",
          selected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
        )}
      >
        <Icon size={15} strokeWidth={1.6} className={cn("shrink-0", accent ? "text-indigo" : failed ? "text-rose" : "text-white/50")} />
        <span className={cn("shrink-0", accent ? "text-indigo" : failed ? "text-rose" : "text-white/85")}>{VERB[span.spanType] ?? span.spanType}</span>
        <span className="shrink-0 text-white/30">·</span>
        <span
          className={cn(
            "truncate",
            thinking ? "text-white/45" : "text-white/55",
            isFile && "underline decoration-white/30 decoration-dashed underline-offset-[5px]",
            failed && "line-through decoration-rose/50",
          )}
        >
          {thinking ? span.text || "…" : span.name}
        </span>
        {agent && (
          <span className="shrink-0 text-[12.5px] text-white/40 tabular">
            {agent.steps} steps · {fmtTokens(agent.tokens)} tok · <Usd micro={agent.costMicroUsd} />
          </span>
        )}
        {stats && (
          <span className="shrink-0 text-[13px] text-white/40 tabular">
            +{stats.added} −{stats.removed}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 pl-2 font-mono text-[11px] text-white/30 opacity-0 transition-opacity group-hover:opacity-100">
          {fmtMs(span.endedAt ? span.endedAt - span.startedAt : undefined)}
        </span>
        <StatusDot status={span.status} className={cn(span.status === "ok" && "opacity-0 group-hover:opacity-100")} />
      </button>
      {failed && span.error && <p className="pb-1 pl-[34px] text-[12.5px] text-rose/90">{span.error}</p>}
      {span.breakpoint?.decision === "edited" && <p className="pb-1 pl-[34px] text-[12.5px] text-amber/90">Edited before it ran</p>}
      {alerts.map((a) => (
        <p key={a.id} className={cn("pb-1 pl-[34px] text-[12.5px]", a.level === "danger" ? "text-rose/90" : "text-amber/90")}>
          {a.title} · <span className="text-white/45">{a.detail}</span>
        </p>
      ))}
      <AnimatePresence initial={false}>
        {thinking && open && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden pb-2 pl-[34px] pr-4 text-[13.5px] italic leading-relaxed text-violet/85"
          >
            {span.text}
          </motion.p>
        )}
      </AnimatePresence>
    </li>
  );
}

function FileCard({ span, onClick }: { span: TraceSpan; onClick: () => void }) {
  const path = span.filePath ?? span.name;
  const name = path.split("/").pop() ?? path;
  const ext = name.split(".").pop() ?? "";
  const Icon = ext === "json" ? FileJson2 : ext === "md" ? FileTextIcon : FileCode2;
  const kind = { ts: "TypeScript code", tsx: "TypeScript code", js: "JavaScript code", json: "JSON", md: "Markdown", py: "Python script" }[ext] ?? "File";
  const stats = span.diff ? diffStats(span.diff) : null;
  return (
    <button type="button" onClick={onClick} className="flex min-w-[220px] items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-left transition-colors hover:bg-white/[0.06]">
      <span className="flex size-9 items-center justify-center rounded-lg bg-indigo/15 text-indigo">
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] text-foreground">{name}</span>
        <span className="block text-[12px] text-white/45">
          {kind}
          {stats && (
            <span className="ml-2 tabular">
              <span className="text-emerald">+{stats.added}</span> <span className="text-rose">−{stats.removed}</span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
