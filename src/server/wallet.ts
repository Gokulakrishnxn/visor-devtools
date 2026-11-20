import { desc, eq, sum } from "drizzle-orm";
import { monotonicFactory } from "ulid";
import type { VisorEvent } from "@shared/events";
import { assertMicro, formatUsd, type MicroUsd } from "@shared/money";
import type { VisorDb } from "./db/client";
import { creditLedger } from "./db/schema";

// Rows written in the same millisecond (a debit and its adjustment) must sort in order
const ulid = monotonicFactory();

export type LedgerRow = {
  id: string;
  sessionId: string | null;
  entryType: "deposit" | "debit" | "adjustment";
  amountMicroUsd: MicroUsd;
  balanceAfterMicroUsd: MicroUsd;
  note: string | null;
  createdAt: number;
};

/**
 * The prepaid credit wallet (PRD §4.2 credit_ledger). Append-only: every
 * change is a row with the balance after it, all in integer micro-dollars.
 *
 * Live sessions are debited when they end: first V.I.S.O.R.'s own computed
 * cost, then an adjustment row for any difference from the SDK's
 * authoritative total, so reconciliation is visible in the history.
 * Mock sessions cost nothing real and are never debited.
 */
export class Wallet {
  /** Per live session: sum of computed and authoritative turn costs. */
  private readonly pending = new Map<string, { computed: MicroUsd; authoritative: MicroUsd }>();

  constructor(
    private readonly db: VisorDb,
    private readonly debitSessions: boolean,
    private readonly now: () => number = Date.now,
  ) {}

  /** True once any credit has been set; until then the wallet doesn't limit runs. */
  isActive(): boolean {
    return this.db.select({ id: creditLedger.id }).from(creditLedger).limit(1).all().length > 0;
  }

  balance(): MicroUsd {
    const last = this.db.select({ b: creditLedger.balanceAfterMicroUsd }).from(creditLedger).orderBy(desc(creditLedger.createdAt), desc(creditLedger.id)).limit(1).get();
    return last?.b ?? 0;
  }

  entries(limit = 200): LedgerRow[] {
    return this.db.select().from(creditLedger).orderBy(desc(creditLedger.createdAt), desc(creditLedger.id)).limit(limit).all();
  }

  /** Charges a live, non-session use of Claude (e.g. writing a commit message). Mock runs are never charged. */
  chargeExtra(amount: MicroUsd, note: string): LedgerRow | null {
    if (!this.debitSessions || amount <= 0) return null;
    return this.append("debit", -amount, note);
  }

  /** What a session has been charged so far (debits and adjustments). */
  private billed(sessionId: string): MicroUsd {
    const row = this.db.select({ total: sum(creditLedger.amountMicroUsd) }).from(creditLedger).where(eq(creditLedger.sessionId, sessionId)).get();
    return -Number(row?.total ?? 0);
  }

  private append(entryType: LedgerRow["entryType"], amount: MicroUsd, note: string, sessionId: string | null = null): LedgerRow {
    assertMicro(amount);
    const row: LedgerRow = {
      id: ulid(),
      sessionId,
      entryType,
      amountMicroUsd: amount,
      balanceAfterMicroUsd: this.balance() + amount,
      note,
      createdAt: this.now(),
    };
    this.db.insert(creditLedger).values(row).run();
    return row;
  }

  deposit(amount: MicroUsd, note = "Prepaid credit"): LedgerRow {
    if (amount <= 0) throw new RangeError("A deposit must be more than $0");
    return this.append("deposit", amount, note);
  }

  /** Sets the balance to an exact amount by recording the difference. */
  setBalance(target: MicroUsd, note = "Balance set by you"): LedgerRow | null {
    if (target < 0) throw new RangeError("The balance can't be negative");
    const delta = target - this.balance();
    return delta === 0 ? null : this.append("adjustment", delta, note);
  }

  /** Feed every VisorEvent here (the daemon subscribes it to the runner). */
  onEvent(e: VisorEvent, sessionTitle?: string): void {
    if (!this.debitSessions) return;
    if (e.type === "turn.ended") {
      const p = this.pending.get(e.sessionId) ?? { computed: 0, authoritative: 0 };
      p.computed += e.computedCostMicroUsd ?? e.costMicroUsd;
      p.authoritative += e.costMicroUsd;
      this.pending.set(e.sessionId, p);
    } else if (e.type === "session.ended") {
      // totalCostMicroUsd covers every message of the session; earlier ones are already billed
      const unbilled = Math.max(0, e.totalCostMicroUsd - this.billed(e.sessionId));
      const p = this.pending.get(e.sessionId) ?? { computed: unbilled, authoritative: unbilled };
      this.pending.delete(e.sessionId);
      const title = sessionTitle ?? "Session";
      // A session that ended before any turn finished still spent what the stream counted
      const computed = p.computed || unbilled;
      const authoritative = p.authoritative || unbilled;
      if (computed > 0) this.append("debit", -computed, title, e.sessionId);
      const diff = authoritative - computed;
      if (diff !== 0) this.append("adjustment", -diff, `Reconciled with SDK total_cost_usd (${diff > 0 ? "+" : ""}${formatUsd(diff, 6)})`, e.sessionId);
    }
  }

  /**
   * The cap a new session may actually use: the requested cap, limited by the
   * credit left once a wallet is in use. null means no cap.
   */
  effectiveCap(requested: MicroUsd | null): { cap: MicroUsd | null; limitedByCredit: boolean } {
    if (!this.debitSessions || !this.isActive()) return { cap: requested, limitedByCredit: false };
    const left = Math.max(0, this.balance());
    if (requested === null || left < requested) return { cap: left, limitedByCredit: true };
    return { cap: requested, limitedByCredit: false };
  }

  /** The ledger as CSV, newest last, amounts in integer micro-dollars and dollars. */
  toCsv(): string {
    const rows = [...this.entries(10_000)].reverse();
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    return [
      "created_at,entry_type,session_id,note,amount_micro_usd,amount_usd,balance_after_micro_usd,balance_after_usd",
      ...rows.map((r) =>
        [
          new Date(r.createdAt).toISOString(),
          r.entryType,
          r.sessionId ?? "",
          esc(r.note ?? ""),
          r.amountMicroUsd,
          formatUsd(r.amountMicroUsd, 6).replace("$", ""),
          r.balanceAfterMicroUsd,
          formatUsd(r.balanceAfterMicroUsd, 6).replace("$", ""),
        ].join(","),
      ),
    ].join("\n");
  }
}
