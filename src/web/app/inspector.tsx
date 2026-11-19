import { X } from "lucide-react";
import { CompactionTimeline, ContextSummary } from "@/components/visor/context-panel";
import { CostReceipt } from "@/components/visor/cost-receipt";
import { Payload } from "@/components/visor/payload";
import { Usd, fmtMs, fmtTokens } from "@/components/visor/primitives";
import { ReplayBar, Waterfall } from "@/components/visor/waterfall";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";

export type InspectorTab = "context" | "payload" | "cost" | "timeline";
const TABS: { id: InspectorTab; label: string }[] = [
  { id: "context", label: "Context" },
  { id: "payload", label: "Payload" },
  { id: "cost", label: "Cost" },
  { id: "timeline", label: "Timeline" },
];

/** The right panel: Context (7 categories), Payload, Cost receipt, and the span Timeline with replay. */
export function Inspector({
  model,
  selectedId,
  onSelect,
  tab,
  onTab,
  onClose,
}: {
  model: TraceModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-[var(--panel)]">
      <div role="tablist" className="flex items-center gap-1 border-b border-white/[0.07] px-2 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={cn("rounded-lg px-2.5 py-1 text-[13px]", tab === t.id ? "bg-white/[0.08] text-foreground" : "text-white/50 hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
        <button type="button" aria-label="Close panel" onClick={onClose} className="ml-auto rounded-md p-1 text-white/45 hover:bg-white/[0.08] hover:text-foreground">
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "context" && (
          <div className="space-y-7 p-4">
            <ContextSummary model={model} />
            <div>
              <p className="mb-3 text-[12px] text-white/45">Context per turn · compaction</p>
              <CompactionTimeline model={model} />
            </div>
          </div>
        )}
        {tab === "payload" && (
          <div className="p-4">
            <Payload model={model} spanId={selectedId} />
          </div>
        )}
        {tab === "cost" && (
          <div className="space-y-6 p-4">
            <CostReceipt model={model} />
            <div>
              <p className="mb-2 text-[12px] text-white/45">By agent</p>
              <table className="w-full text-[12.5px]">
                <thead className="text-left text-[11px] text-white/40">
                  <tr>
                    <th className="py-1 font-normal">Agent</th>
                    <th className="py-1 text-right font-normal">Steps</th>
                    <th className="py-1 text-right font-normal">Tokens</th>
                    <th className="py-1 text-right font-normal">Time</th>
                    <th className="py-1 text-right font-normal">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {model.agents.map((a) => (
                    <tr key={a.spanId ?? "main"} className="cursor-pointer border-t border-white/[0.06] hover:bg-white/[0.03]" onClick={() => a.spanId && onSelect(a.spanId)}>
                      <td className="max-w-0 truncate py-1.5 pr-2">
                        <span className={a.spanId ? "text-violet" : "text-foreground"}>{a.name}</span>
                      </td>
                      <td className="py-1.5 text-right text-white/60 tabular">{a.steps}</td>
                      <td className="py-1.5 text-right font-mono text-white/60 tabular">{fmtTokens(a.tokens)}</td>
                      <td className="py-1.5 text-right font-mono text-white/60 tabular">{fmtMs(a.durationMs)}</td>
                      <td className="py-1.5 text-right font-mono tabular">
                        <Usd micro={a.costMicroUsd} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab === "timeline" && (
          <div className="flex h-full flex-col">
            <ReplayBar className="border-b border-white/[0.07] px-3 py-2" />
            <div className="min-h-0 flex-1">
              <Waterfall model={model} selectedId={selectedId} onSelect={onSelect} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
