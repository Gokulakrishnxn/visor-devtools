import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VisorEvent } from "@shared/events";
import { createApp } from "@server/app";
import { openDatabase } from "@server/db/client";
import { TraceRecorder } from "@server/db/recorder";
import { LimitStore, startOfToday } from "@server/limits";
import { MockRuntimeAdapter } from "@server/runtime/mock-adapter";
import { SessionRunner } from "@server/runtime/session-runner";
import { Wallet } from "@server/wallet";
import { parseTokens } from "@/lib/limits-format";

const auth = { authorization: "Bearer t", "content-type": "application/json" };
const run = (runner: SessionRunner, tokenCap: number | null) =>
  runner.run({ sessionId: `s${Math.random()}`, prompt: "", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null, tokenCap });

function approvingRunner() {
  const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }), validate: true });
  runner.subscribe((e) => {
    if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "approved" }));
  });
  return runner;
}

describe("token and daily limits", () => {
  it("stops a run at its token limit, like the money cap", async () => {
    const free = await run(approvingRunner(), null);
    const capped = await run(approvingRunner(), 3_000);
    const end = (ev: VisorEvent[]) => ev.find((e) => e.type === "session.ended");
    expect(end(free)).toMatchObject({ status: "completed" });
    expect(end(capped)).toMatchObject({ status: "aborted_budget" });
    expect(capped.some((e) => e.type === "alert" && e.title === "Token limit reached")).toBe(true);
    expect(capped.length).toBeLessThan(free.length);
  });

  it("saves limits privately, counts today's usage and refuses new messages over a daily limit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "visor-limits-"));
    const db = openDatabase(":memory:");
    const limits = new LimitStore(db, join(dir, "limits.json"));
    const runner = approvingRunner();
    const recorder = new TraceRecorder(db);
    runner.subscribe((e) => recorder.record(e));
    const wallet = new Wallet(db, true);
    const app = createApp({ runner, token: "t", workspacePath: "/w", limits, wallet });

    expect(await (await app.request("/api/limits", { headers: auth })).json()).toEqual({ limits: { messageTokens: null, dailyTokens: null, dailyMicroUsd: null }, today: { tokens: 0, spentMicroUsd: 0 } });
    const put = await app.request("/api/limits", { method: "PUT", headers: auth, body: JSON.stringify({ messageTokens: 200_000, dailyTokens: 1_000, dailyMicroUsd: 2_000_000 }) });
    expect(put.status).toBe(200);
    expect(statSync(join(dir, "limits.json")).mode & 0o777).toBe(0o600);
    expect((await app.request("/api/limits", { method: "PUT", headers: auth, body: JSON.stringify({ dailyTokens: -5 }) })).status).toBe(400);

    // A finished run counts toward today
    await run(runner, null);
    expect(limits.today().tokens).toBeGreaterThan(1_000);
    const refused = await app.request("/api/sessions", { method: "POST", headers: auth, body: JSON.stringify({ prompt: "hi" }) });
    expect(refused.status).toBe(429);
    expect(((await refused.json()) as { error: string }).error).toContain("Daily token limit reached");

    // Spending: the run's cap shrinks to what's left today
    limits.set({ messageTokens: null, dailyTokens: null, dailyMicroUsd: 500_000 });
    wallet.deposit(10_000_000);
    wallet.chargeExtra(200_000, "test spend");
    wallet.setBalance(9_000_000); // a balance you set isn't spending
    expect(limits.today().spentMicroUsd).toBe(200_000);
    const ok = await app.request("/api/sessions", { method: "POST", headers: auth, body: JSON.stringify({ prompt: "hi", capUsd: "5" }) });
    expect(await ok.json()).toMatchObject({ capMicroUsd: 300_000 });
    wallet.chargeExtra(400_000, "more");
    expect((await app.request("/api/sessions", { method: "POST", headers: auth, body: JSON.stringify({ prompt: "hi" }) })).status).toBe(429);
    expect(startOfToday(new Date(2026, 10, 20, 15, 30).getTime())).toBe(new Date(2026, 10, 20).getTime());
  });

  it("reads token amounts the way people write them", () => {
    expect(parseTokens("200k")).toBe(200_000);
    expect(parseTokens("1.5M")).toBe(1_500_000);
    expect(parseTokens("250,000")).toBe(250_000);
    expect(parseTokens("")).toBeNull();
    expect(parseTokens("lots")).toBeUndefined();
    expect(parseTokens("0")).toBeUndefined();
  });
});
