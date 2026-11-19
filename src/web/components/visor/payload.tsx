import type { TraceModel } from "@/lib/trace-model";
import { JsonView } from "./code";
import { CopyButton, SPAN_LABEL } from "./primitives";

/** Raw input/output (or MCP JSON-RPC request/response) of the selected span. */
export function Payload({ model, spanId }: { model: TraceModel; spanId: string | null }) {
  const span = spanId ? model.spans[spanId] : undefined;
  if (!span) return <p className="text-[12.5px] text-faint">Select a span (click, or J/K) to see its raw payload.</p>;
  const block = (label: string, value: unknown) =>
    value === undefined ? null : (
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-faint">
          {label} <CopyButton text={JSON.stringify(value, null, 2)} />
        </div>
        <div className="max-h-72 overflow-auto rounded-lg bg-code p-3">
          <JsonView value={value} />
        </div>
      </div>
    );
  return (
    <div>
      <p className="mb-3 text-[13px]">
        {SPAN_LABEL[span.spanType]} · <span className="font-mono text-[12px] text-muted-foreground">{span.name}</span>
      </p>
      {block(span.spanType === "mcp" ? "JSON-RPC request" : "Input", span.input)}
      {block(span.spanType === "mcp" ? "JSON-RPC response" : "Output", span.output)}
      {span.breakpoint && block("Override", span.breakpoint)}
      {block("Span", { spanId: span.spanId, parentSpanId: span.parentSpanId, status: span.status, costMicroUsd: span.costMicroUsd, durationMs: span.endedAt ? span.endedAt - span.startedAt : null })}
    </div>
  );
}

