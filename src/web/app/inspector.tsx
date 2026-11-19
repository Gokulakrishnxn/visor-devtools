import { X } from "lucide-react";
import { CompactionTimeline, ContextSummary } from "@/components/visor/context-panel";
import { CostReceipt } from "@/components/visor/cost-receipt";
import { Payload } from "@/components/visor/payload";
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
          <div className="p-4">
            <CostReceipt model={model} />
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
