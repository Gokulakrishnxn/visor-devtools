import { DEFAULT_PRICING } from "@server/telemetry/pricing-table";
import { formatUsd } from "@shared/money";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";
import { Usd } from "./primitives";

/** Exact micro-dollar receipt: tokens × rate per bucket, integer math only. */
export function CostReceipt({ model, className }: { model: TraceModel; className?: string }) {
  const price = DEFAULT_PRICING[model.session?.modelId ?? "claude-opus-5-5"] ?? DEFAULT_PRICING["claude-opus-5-5"]!;
  const rows = [
    { label: "Fresh input", tokens: model.usage.inputTokens, rate: price.input, micro: model.cost.input },
    { label: "Cache write · 5m", tokens: model.usage.cacheWrite5mTokens, rate: price.cacheWrite5m, micro: model.cost.cacheWrite5m },
    { label: "Cache write · 1h", tokens: model.usage.cacheWrite1hTokens, rate: price.cacheWrite1h, micro: model.cost.cacheWrite1h },
    { label: "Cache read", tokens: model.usage.cacheReadTokens, rate: price.cacheRead, micro: model.cost.cacheRead },
    { label: "Output + thinking", tokens: model.usage.outputTokens, rate: price.output, micro: model.cost.output },
  ];
  const cacheable = model.usage.cacheReadTokens + model.usage.inputTokens;
  const hitRate = cacheable ? Math.round((model.usage.cacheReadTokens * 100) / cacheable) : 0;
  return (
    <div className={cn("font-mono text-[12px]", className)}>
      <div className="text-[30px] font-medium leading-none tracking-tight text-foreground">
        <Usd micro={model.cost.total} />
      </div>
      <p className="mt-2 text-[11.5px] text-emerald">
        −{formatUsd(model.cost.cacheSavings)} saved · {hitRate}% cache hit
      </p>
      <table className="mt-4 w-full border-t border-dashed border-border-strong">
        <thead>
          <tr className="text-left text-[10.5px] uppercase tracking-wider text-faint">
            <th className="pb-1 pt-3 font-normal">Bucket</th>
            <th className="pb-1 pt-3 text-right font-normal">Tokens</th>
            <th className="pb-1 pt-3 text-right font-normal">$/MTok</th>
            <th className="pb-1 pt-3 text-right font-normal">µUSD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="tabular">
              <td className="py-1 text-muted-foreground">{r.label}</td>
              <td className="py-1 text-right text-faint">{r.tokens.toLocaleString("en-US")}</td>
              <td className="py-1 text-right text-faint">{formatUsd(r.rate, 2)}</td>
              <td className="py-1 text-right text-foreground">{r.micro.toLocaleString("en-US")}</td>
            </tr>
          ))}
          <tr className="border-t border-border tabular">
            <td className="pt-2 text-foreground">Total</td>
            <td colSpan={2} />
            <td className="pt-2 text-right text-foreground">{model.cost.total.toLocaleString("en-US")}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
        Counted once per message_id, priced per bucket in integer micro-dollars, reconciled against the SDK total at turn end.
      </p>
    </div>
  );
}
