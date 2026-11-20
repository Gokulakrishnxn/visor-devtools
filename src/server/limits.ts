import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { and, eq, gte, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { TokenUsage } from "@shared/pricing";
import type { VisorDb } from "./db/client";
import { creditLedger, turns } from "./db/schema";

/**
 * Your own limits on top of the credit wallet. Tokens counted are the ones
 * that are new each time: input, cache writes and output. Cache reads (the
 * cheap re-reads of earlier context) are left out so long chats aren't
 * stopped by context they already paid for.
 */
export const Limits = z.object({
  /** One message (run) stops when it has used this many tokens. */
  messageTokens: z.number().int().positive().nullable().default(null),
  /** No new message once today's tokens reach this. */
  dailyTokens: z.number().int().positive().nullable().default(null),
  /** No new message once today's spending reaches this (µUSD); a run's cap shrinks to what's left today. */
  dailyMicroUsd: z.number().int().positive().nullable().default(null),
});
export type Limits = z.infer<typeof Limits>;
export const NO_LIMITS: Limits = { messageTokens: null, dailyTokens: null, dailyMicroUsd: null };

/** Tokens that count toward the limits. */
export const freshTokens = (u: TokenUsage) => u.inputTokens + u.cacheWrite5mTokens + u.cacheWrite1hTokens + u.outputTokens;

/** Midnight today on this computer's clock. */
export function startOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type TodayUsage = { tokens: number; spentMicroUsd: number };

/** The limits file (next to the database, readable only by you) and today's usage. */
export class LimitStore {
  constructor(
    private readonly db: VisorDb,
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
  ) {}

  get(): Limits {
    if (!this.file) return this.memory;
    try {
      return Limits.parse(JSON.parse(readFileSync(this.file, "utf8")));
    } catch {
      return NO_LIMITS;
    }
  }

  private memory: Limits = NO_LIMITS;
  set(next: Limits): Limits {
    const limits = Limits.parse(next);
    if (!this.file) return (this.memory = limits);
    if (!existsSync(dirname(this.file))) mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(this.file, `${JSON.stringify(limits, null, 2)}\n`, { mode: 0o600 });
    chmodSync(this.file, 0o600);
    return limits;
  }

  /** Tokens of turns started today, and what the wallet charged today. */
  today(): TodayUsage {
    const since = startOfToday(this.now());
    const t = this.db
      .select({ n: sql<number>`coalesce(sum(${turns.inputTokens} + ${turns.cacheWriteTokens} + ${turns.outputTokens}), 0)` })
      .from(turns)
      .where(gte(turns.startedAt, since))
      .get();
    const spent = this.db
      .select({ n: sql<number>`coalesce(sum(${creditLedger.amountMicroUsd}), 0)` })
      .from(creditLedger)
      // Real usage only: charges and their SDK reconciliations, never a balance you set by hand
      .where(
        and(
          gte(creditLedger.createdAt, since),
          or(eq(creditLedger.entryType, "debit"), and(eq(creditLedger.entryType, "adjustment"), like(creditLedger.note, "Reconciled with SDK%"))),
        ),
      )
      .get();
    return { tokens: Number(t?.n ?? 0), spentMicroUsd: -Number(spent?.n ?? 0) };
  }

  /**
   * What a new message may use, or why it can't start.
   * `tokens` is the token cap for the run (null = none); `maxMicroUsd` caps its spending.
   */
  allowance(): { ok: true; tokens: number | null; maxMicroUsd: number | null } | { ok: false; error: string } {
    const l = this.get();
    const used = this.today();
    if (l.dailyTokens !== null && used.tokens >= l.dailyTokens) return { ok: false, error: `Daily token limit reached (${used.tokens.toLocaleString("en-US")} of ${l.dailyTokens.toLocaleString("en-US")}). It resets at midnight, or raise it in the wallet.` };
    if (l.dailyMicroUsd !== null && used.spentMicroUsd >= l.dailyMicroUsd) return { ok: false, error: "Daily spending limit reached. It resets at midnight, or raise it in the wallet." };
    const leftToday = l.dailyTokens === null ? null : l.dailyTokens - used.tokens;
    const tokens = l.messageTokens === null ? leftToday : leftToday === null ? l.messageTokens : Math.min(l.messageTokens, leftToday);
    return { ok: true, tokens, maxMicroUsd: l.dailyMicroUsd === null ? null : l.dailyMicroUsd - used.spentMicroUsd };
  }
}
