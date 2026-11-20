import { describe, expect, it } from "vitest";
import type { VisorEvent } from "@shared/events";
import { createApp } from "@server/app";
import { openDatabase } from "@server/db/client";
import { TraceRecorder } from "@server/db/recorder";
import { MockRuntimeAdapter } from "@server/runtime/mock-adapter";
import { SessionRunner } from "@server/runtime/session-runner";
import { Wallet } from "@server/wallet";

function setup(debit = true) {
  const db = openDatabase(":memory:");
  let t = 1_700_000_000_000;
  const wallet = new Wallet(db, debit, () => (t += 1000));
  return { db, wallet };
}

/** Minimal session lifecycle so ledger rows can reference a stored session. */
function liveSession(db: ReturnType<typeof openDatabase>, wallet: Wallet, id: string, turns: { cost: number; computed?: number }[], total: number) {
  const recorder = new TraceRecorder(db);
  const feed = (e: VisorEvent) => {
    recorder.record(e);
    wallet.onEvent(e, "Fix flaky auth test");
  };
  feed({ type: "session.started", sessionId: id, title: "Fix flaky auth test", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null, at: 1 });
  turns.forEach((turn, i) => {
    feed({ type: "turn.started", sessionId: id, turnId: `${id}-t${i}`, turnIndex: i, prompt: "p", at: 2 });
    feed({
      type: "turn.ended",
      sessionId: id,
      turnId: `${id}-t${i}`,
      costMicroUsd: turn.cost,
      computedCostMicroUsd: turn.computed,
      cacheSavingsMicroUsd: 0,
      contextUsedTokens: 0,
      contextLimitTokens: 1_000_000,
      contextBreakdown: { projectRules: 0, toolSchemas: 0, mentionedFiles: 0, toolResults: 0, thinking: 0, subagents: 0, messages: 0 },
      at: 3,
    });
  });
  feed({ type: "session.ended", sessionId: id, status: "completed", totalCostMicroUsd: total, at: 4 });
}

describe("prepaid credit wallet", () => {
  it("starts inactive and empty, then adds and sets credit with running balances", () => {
    const { wallet } = setup();
    expect(wallet.isActive()).toBe(false);
    expect(wallet.balance()).toBe(0);
    wallet.deposit(20_000_000);
    expect(wallet.balance()).toBe(20_000_000);
    const set = wallet.setBalance(15_000_000)!;
    expect(set).toMatchObject({ entryType: "adjustment", amountMicroUsd: -5_000_000, balanceAfterMicroUsd: 15_000_000 });
    expect(wallet.setBalance(15_000_000)).toBeNull(); // no-op
    expect(() => wallet.deposit(0)).toThrow();
    expect(() => wallet.setBalance(-1)).toThrow();
    expect(wallet.entries().map((e) => e.entryType)).toEqual(["adjustment", "deposit"]); // newest first
  });

  it("debits a live session and books the SDK reconciliation as an adjustment", () => {
    const { db, wallet } = setup();
    wallet.deposit(5_000_000);
    liveSession(db, wallet, "s1", [{ cost: 12_300, computed: 12_250 }, { cost: 8_000, computed: 8_000 }], 20_300);
    const [adj, debit] = wallet.entries();
    expect(debit).toMatchObject({ entryType: "debit", amountMicroUsd: -20_250, sessionId: "s1", note: "Fix flaky auth test" });
    expect(adj).toMatchObject({ entryType: "adjustment", amountMicroUsd: -50, sessionId: "s1" });
    expect(adj!.note).toContain("Reconciled with SDK total_cost_usd");
    expect(wallet.balance()).toBe(5_000_000 - 20_300); // authoritative total in the end
  });

  it("bills only the new part of a session that continues with a follow-up", () => {
    const { db, wallet } = setup();
    wallet.deposit(5_000_000);
    liveSession(db, wallet, "chat", [{ cost: 20_000 }], 20_000);
    // The follow-up failed before any turn ended; its session total includes the first message
    wallet.onEvent({ type: "session.ended", sessionId: "chat", status: "error", totalCostMicroUsd: 26_000, at: 9 }, "chat");
    expect(wallet.entries()[0]).toMatchObject({ entryType: "debit", amountMicroUsd: -6_000, sessionId: "chat" });
    expect(wallet.balance()).toBe(5_000_000 - 26_000);
  });

  it("never debits mock sessions", () => {
    const { db, wallet } = setup(false);
    wallet.deposit(1_000_000);
    liveSession(db, wallet, "mock", [{ cost: 90_000 }], 90_000);
    expect(wallet.balance()).toBe(1_000_000);
    expect(wallet.entries()).toHaveLength(1);
  });

  it("limits a live run's cap to the credit left, and refuses at zero", () => {
    const { wallet } = setup();
    expect(wallet.effectiveCap(5_000_000)).toEqual({ cap: 5_000_000, limitedByCredit: false }); // no wallet yet
    wallet.deposit(2_000_000);
    expect(wallet.effectiveCap(5_000_000)).toEqual({ cap: 2_000_000, limitedByCredit: true });
    expect(wallet.effectiveCap(1_000_000)).toEqual({ cap: 1_000_000, limitedByCredit: false });
    expect(wallet.effectiveCap(null)).toEqual({ cap: 2_000_000, limitedByCredit: true });
    wallet.setBalance(0);
    expect(wallet.effectiveCap(5_000_000)).toEqual({ cap: 0, limitedByCredit: true });
    expect(setup(false).wallet.effectiveCap(5_000_000).limitedByCredit).toBe(false); // mock: never limited
  });

  it("exports the ledger as CSV, oldest first, with integer µUSD and dollars", () => {
    const { wallet } = setup();
    wallet.deposit(20_000_000, 'Top-up, "November"');
    wallet.setBalance(19_500_000);
    const [header, first, second] = wallet.toCsv().split("\n");
    expect(header).toBe("created_at,entry_type,session_id,note,amount_micro_usd,amount_usd,balance_after_micro_usd,balance_after_usd");
    expect(first).toContain('deposit,,"Top-up, ""November""",20000000,20.000000,20000000,20.000000');
    expect(second).toContain("adjustment,,Balance set by you,-500000,-0.500000,19500000,19.500000");
  });
});

describe("wallet API and caps", () => {
  const auth = { authorization: "Bearer t", "content-type": "application/json" };

  function app(debit = true) {
    const { db, wallet } = setup(debit);
    const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }), validate: true });
    return { wallet, runner, app: createApp({ runner, token: "t", workspacePath: "/w", wallet, defaultCapMicroUsd: 3_000_000 }), db };
  }

  it("adds and sets credit, validates amounts, and exports CSV", async () => {
    const { app: a } = app();
    expect(await (await a.request("/api/wallet", { headers: auth })).json()).toMatchObject({ enabled: true, active: false, balanceMicroUsd: 0 });
    const dep = await a.request("/api/wallet/deposit", { method: "POST", headers: auth, body: JSON.stringify({ amountUsd: "20" }) });
    expect(await dep.json()).toMatchObject({ balanceMicroUsd: 20_000_000 });
    const set = await a.request("/api/wallet/balance", { method: "POST", headers: auth, body: JSON.stringify({ amountUsd: "12.5" }) });
    expect(await set.json()).toMatchObject({ balanceMicroUsd: 12_500_000 });
    expect((await a.request("/api/wallet/deposit", { method: "POST", headers: auth, body: JSON.stringify({ amountUsd: "lots" }) })).status).toBe(400);
    expect((await a.request("/api/wallet/deposit", { method: "POST", headers: auth, body: JSON.stringify({ amountUsd: "0" }) })).status).toBe(400);
    const csv = await a.request("/api/wallet/export.csv", { headers: auth });
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect((await csv.text()).split("\n")).toHaveLength(3);
    expect((await a.request("/api/wallet")).status).toBe(401); // token required
  });

  it("applies the default cap, shrinks it to the credit left, and refuses with no credit", async () => {
    const { app: a, wallet } = app();
    const start = async (body: object) => a.request("/api/sessions", { method: "POST", headers: auth, body: JSON.stringify(body) });
    expect(await (await start({})).json()).toMatchObject({ capMicroUsd: 3_000_000, limitedByCredit: false }); // .visor.json default
    wallet.deposit(1_000_000);
    expect(await (await start({ capUsd: "5" })).json()).toMatchObject({ capMicroUsd: 1_000_000, limitedByCredit: true });
    wallet.setBalance(0);
    const refused = await start({ capUsd: "5" });
    expect(refused.status).toBe(402);
    expect(((await refused.json()) as { error: string }).error).toContain("No credit left");
  });

  it("enforces the per-turn cap from .visor.json", async () => {
    const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }), validate: true, turnCapMicroUsd: 20_000 });
    runner.subscribe((e) => {
      if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "approved" }));
    });
    const events = await runner.run({ sessionId: "tc", prompt: "", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null });
    expect(events.at(-1)).toMatchObject({ type: "session.ended", status: "aborted_budget" });
  });
});
