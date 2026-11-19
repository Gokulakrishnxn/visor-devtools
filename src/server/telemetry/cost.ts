import { assertMicro, parseUsd, type MicroUsd } from "@shared/money";
import { EMPTY_USAGE, type CostBreakdown, type ModelPricing, type TokenUsage } from "@shared/pricing";

/**
 * µUSD for `tokens` at `pricePerMTok` µUSD per million tokens, rounded half up.
 * tokens * price stays far below 2^53, so this is exact integer math.
 */
export function bucketCost(tokens: number, pricePerMTok: MicroUsd): MicroUsd {
  if (!Number.isSafeInteger(tokens) || tokens < 0) throw new TypeError(`Invalid token count: ${tokens}`);
  assertMicro(pricePerMTok, "price");
  return Math.floor((tokens * pricePerMTok + 500_000) / 1_000_000);
}

export function computeCost(usage: TokenUsage, price: ModelPricing): CostBreakdown {
  const input = bucketCost(usage.inputTokens, price.input);
  const cacheWrite5m = bucketCost(usage.cacheWrite5mTokens, price.cacheWrite5m);
  const cacheWrite1h = bucketCost(usage.cacheWrite1hTokens, price.cacheWrite1h);
  const cacheRead = bucketCost(usage.cacheReadTokens, price.cacheRead);
  const output = bucketCost(usage.outputTokens, price.output);
  const cacheSavings = bucketCost(usage.cacheReadTokens, price.input) - cacheRead;
  return {
    input,
    cacheWrite5m,
    cacheWrite1h,
    cacheRead,
    output,
    total: input + cacheWrite5m + cacheWrite1h + cacheRead + output,
    cacheSavings,
  };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cacheWrite5mTokens: a.cacheWrite5mTokens + b.cacheWrite5mTokens,
    cacheWrite1hTokens: a.cacheWrite1hTokens + b.cacheWrite1hTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/**
 * Accumulates usage for one turn. Parallel tool calls repeat the same
 * assistant message's usage, so each `messageId` is counted exactly once.
 */
export class UsageLedger {
  private readonly seen = new Map<string, { modelId: string; usage: TokenUsage }>();

  /** Returns false when this message was already counted. */
  add(messageId: string, modelId: string, usage: TokenUsage): boolean {
    if (this.seen.has(messageId)) return false;
    this.seen.set(messageId, { modelId, usage });
    return true;
  }

  get messageCount(): number {
    return this.seen.size;
  }

  totalUsage(): TokenUsage {
    let total = EMPTY_USAGE;
    for (const { usage } of this.seen.values()) total = addUsage(total, usage);
    return total;
  }

  /** Cost summed per message with each message's own model price. */
  cost(priceOf: (modelId: string) => ModelPricing): CostBreakdown {
    const zero: CostBreakdown = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0, total: 0, cacheSavings: 0 };
    let sum = zero;
    for (const { modelId, usage } of this.seen.values()) {
      const c = computeCost(usage, priceOf(modelId));
      sum = {
        input: sum.input + c.input,
        cacheWrite5m: sum.cacheWrite5m + c.cacheWrite5m,
        cacheWrite1h: sum.cacheWrite1h + c.cacheWrite1h,
        cacheRead: sum.cacheRead + c.cacheRead,
        output: sum.output + c.output,
        total: sum.total + c.total,
        cacheSavings: sum.cacheSavings + c.cacheSavings,
      };
    }
    return sum;
  }
}

export type Reconciliation = {
  computed: MicroUsd;
  authoritative: MicroUsd;
  /** authoritative − computed; recorded as a ledger adjustment when non-zero. */
  adjustment: MicroUsd;
};

/**
 * Reconciles our computed total against the SDK's `total_cost_usd`. The SDK
 * reports a float in dollars; it is converted once, here, via its decimal text.
 */
export function reconcile(computed: MicroUsd, sdkTotalCostUsd: number): Reconciliation {
  const authoritative = parseUsd(sdkTotalCostUsd.toFixed(6));
  return { computed, authoritative, adjustment: authoritative - computed };
}
