import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { parseUsd } from "@shared/money";
import type { ModelPricing } from "@shared/pricing";

export { DEFAULT_PRICING } from "./pricing-table";
import { DEFAULT_PRICING } from "./pricing-table";

/** Older or alternate IDs that share a price row. */
const ALIASES: Record<string, string> = {
  "claude-sonnet-5": "claude-sonnet-5-5",
};

// ~/.visor/pricing.json uses readable dollar strings, converted to µUSD here.
const usd = z.union([z.string(), z.number()]).transform((v) => parseUsd(v));
const OverrideFile = z.record(
  z.string(),
  z.object({
    input: usd,
    cacheWrite5m: usd,
    cacheWrite1h: usd,
    cacheRead: usd,
    output: usd,
    contextWindow: z.number().int().positive(),
  }),
);

export class PricingRegistry {
  private readonly table: Map<string, ModelPricing>;

  constructor(overrides: Record<string, ModelPricing> = {}) {
    this.table = new Map(Object.entries({ ...DEFAULT_PRICING, ...overrides }));
  }

  /** Loads `~/.visor/pricing.json` (or `path`) on top of the defaults, if present. */
  static load(path = join(homedir(), ".visor", "pricing.json")): PricingRegistry {
    if (!existsSync(path)) return new PricingRegistry();
    const parsed = OverrideFile.parse(JSON.parse(readFileSync(path, "utf8")));
    return new PricingRegistry(parsed);
  }

  get(modelId: string): ModelPricing {
    const row = this.table.get(modelId) ?? this.table.get(ALIASES[modelId] ?? "");
    if (!row) throw new Error(`No pricing for model "${modelId}". Add it to ~/.visor/pricing.json.`);
    return row;
  }

  has(modelId: string): boolean {
    return this.table.has(modelId) || modelId in ALIASES;
  }
}
