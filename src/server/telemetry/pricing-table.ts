import type { ModelPricing } from "@shared/pricing";

// Pure data (no Node APIs) so the GUI can price live usage with the same table.
/** Pricing per 1M tokens in integer µUSD (PRD §4.1). */
export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  "claude-opus-5-5": {
    input: 4_000_000,
    cacheWrite5m: 5_000_000,
    cacheWrite1h: 8_000_000,
    cacheRead: 200_000,
    output: 20_000_000,
    contextWindow: 1_000_000,
  },
  "claude-sonnet-5-5": {
    input: 2_000_000,
    cacheWrite5m: 2_500_000,
    cacheWrite1h: 4_000_000,
    cacheRead: 100_000,
    output: 10_000_000,
    contextWindow: 1_000_000,
  },
  "claude-haiku-4-5": {
    input: 1_000_000,
    cacheWrite5m: 1_250_000,
    cacheWrite1h: 2_000_000,
    cacheRead: 100_000,
    output: 5_000_000,
    contextWindow: 200_000,
  },
};

