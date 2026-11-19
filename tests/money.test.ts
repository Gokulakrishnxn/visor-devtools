import { describe, expect, it } from "vitest";
import { assertMicro, formatUsd, MICRO_PER_CENT, MICRO_PER_USD, parseUsd } from "@shared/money";

describe("micro-dollar money", () => {
  it("defines the units from the PRD", () => {
    expect(MICRO_PER_USD).toBe(1_000_000);
    expect(MICRO_PER_CENT).toBe(10_000);
  });

  it("parses dollar text without floating point drift", () => {
    expect(parseUsd("5")).toBe(5_000_000);
    expect(parseUsd("$0.25")).toBe(250_000);
    expect(parseUsd("0.1")).toBe(100_000);
    expect(parseUsd("1.000001")).toBe(1_000_001);
    expect(parseUsd("-0.5")).toBe(-500_000);
    expect(() => parseUsd("1.0000001")).toThrow();
    expect(() => parseUsd("abc")).toThrow();
  });

  it("formats only at the edge, as $0.0000", () => {
    expect(formatUsd(41_870)).toBe("$0.0419");
    expect(formatUsd(0)).toBe("$0.0000");
    expect(formatUsd(14_820_000, 2)).toBe("$14.82");
    expect(formatUsd(1_234_567_890)).toBe("$1,234.5679");
    expect(formatUsd(-36_000)).toBe("-$0.0360");
    expect(formatUsd(50, 4)).toBe("$0.0001"); // half rounds up
  });

  it("rejects non-integer amounts", () => {
    expect(() => assertMicro(0.5)).toThrow();
    expect(() => formatUsd(1.5)).toThrow();
  });
});
