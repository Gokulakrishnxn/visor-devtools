import type { MicroUsd } from "./money";

/** Prices in µUSD per 1,000,000 tokens (so $4.00 / MTok = 4_000_000). */
export type ModelPricing = {
  input: MicroUsd;
  cacheWrite5m: MicroUsd;
  cacheWrite1h: MicroUsd;
  cacheRead: MicroUsd;
  /** Output tokens, including extended thinking. */
  output: MicroUsd;
  contextWindow: number;
};

/** Token counts for one assistant message, as the API reports them. */
export type TokenUsage = {
  inputTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
};

export const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  cacheReadTokens: 0,
  outputTokens: 0,
};

export type CostBreakdown = {
  input: MicroUsd;
  cacheWrite5m: MicroUsd;
  cacheWrite1h: MicroUsd;
  cacheRead: MicroUsd;
  output: MicroUsd;
  total: MicroUsd;
  /** What cache reads saved versus paying fresh input for the same tokens. */
  cacheSavings: MicroUsd;
};
