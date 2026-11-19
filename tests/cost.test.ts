import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bucketCost, computeCost, reconcile, UsageLedger } from "@server/telemetry/cost";
import { DEFAULT_PRICING, PricingRegistry } from "@server/telemetry/pricing";

const opus = DEFAULT_PRICING["claude-opus-5-5"]!;
const usage = { inputTokens: 3_412, cacheWrite5mTokens: 1_920, cacheWrite1hTokens: 0, cacheReadTokens: 48_210, outputTokens: 1_388 };

describe("cost engine", () => {
  it("prices one bucket in integer µUSD", () => {
    expect(bucketCost(1_000_000, 4_000_000)).toBe(4_000_000); // 1M tokens at $4
    expect(bucketCost(3_412, 4_000_000)).toBe(13_648);
    expect(bucketCost(1, 200_000)).toBe(0); // 0.2 µUSD rounds down
    expect(bucketCost(3, 200_000)).toBe(1); // 0.6 µUSD rounds up
    expect(() => bucketCost(1.5, 4_000_000)).toThrow();
  });

  it("splits a message into the PRD buckets and sums exactly", () => {
    const c = computeCost(usage, opus);
    expect(c).toEqual({
      input: 13_648,
      cacheWrite5m: 9_600,
      cacheWrite1h: 0,
      cacheRead: 9_642,
      output: 27_760,
      total: 60_650,
      cacheSavings: 192_840 - 9_642,
    });
    for (const v of Object.values(c)) expect(Number.isInteger(v)).toBe(true);
  });

  it("counts each message_id once when parallel tool calls repeat usage", () => {
    const ledger = new UsageLedger();
    expect(ledger.add("msg_1", "claude-opus-5-5", usage)).toBe(true);
    expect(ledger.add("msg_1", "claude-opus-5-5", usage)).toBe(false);
    expect(ledger.add("msg_2", "claude-haiku-4-5", { ...usage, cacheReadTokens: 0 })).toBe(true);
    expect(ledger.messageCount).toBe(2);
    const total = ledger.cost((id) => new PricingRegistry().get(id)).total;
    const expected = computeCost(usage, opus).total + computeCost({ ...usage, cacheReadTokens: 0 }, DEFAULT_PRICING["claude-haiku-4-5"]!).total;
    expect(total).toBe(expected);
  });

  it("reconciles against the SDK's total_cost_usd", () => {
    expect(reconcile(60_650, 0.06065)).toEqual({ computed: 60_650, authoritative: 60_650, adjustment: 0 });
    expect(reconcile(60_650, 0.0607).adjustment).toBe(50);
  });

  it("loads ~/.visor/pricing.json overrides as dollar strings", () => {
    const dir = mkdtempSync(join(tmpdir(), "visor-pricing-"));
    const file = join(dir, "pricing.json");
    writeFileSync(
      file,
      JSON.stringify({
        "my-model": { input: "1.50", cacheWrite5m: "2", cacheWrite1h: "3", cacheRead: "0.15", output: "7.5", contextWindow: 100000 },
      }),
    );
    const reg = PricingRegistry.load(file);
    expect(reg.get("my-model").input).toBe(1_500_000);
    expect(reg.get("claude-sonnet-5").output).toBe(10_000_000); // alias falls back to 5.5 pricing
    expect(() => reg.get("unknown")).toThrow(/pricing\.json/);
  });
});
