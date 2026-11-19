import { describe, expect, it } from "vitest";
import { VisorEvent, type VisorEventOf } from "@shared/events";
import { MockRuntimeAdapter } from "@server/runtime/mock-adapter";
import { SessionRunner } from "@server/runtime/session-runner";
import { SpanTreeBuilder } from "@server/telemetry/span-builder";
import { summarizeContext } from "@server/telemetry/context";

function deterministic() {
  let t = 1_700_000_000_000;
  let n = 0;
  return { now: () => (t += 10), newId: () => `id_${String(++n).padStart(4, "0")}` };
}

function setup() {
  const d = deterministic();
  const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0, ...d }), validate: true, now: d.now });
  // Answer breakpoints like an operator would
  runner.subscribe((e) => {
    if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "denied", note: "Push to a branch" }));
  });
  return runner;
}

const base = { prompt: "", workspacePath: "/tmp/acme", modelId: "claude-opus-5-5", effort: "medium" as const, budgetCapMicroUsd: null };
const of = <T extends VisorEvent["type"]>(events: VisorEvent[], type: T) => events.filter((e): e is VisorEventOf<T> => e.type === type);

describe("MockRuntimeAdapter + SessionRunner", () => {
  it("streams a valid, complete session at zero API cost", async () => {
    const events = await setup().run({ ...base, sessionId: "s1" });
    for (const e of events) expect(VisorEvent.safeParse(e).success).toBe(true);
    expect(events[0]?.type).toBe("session.started");
    expect(events.at(-1)).toMatchObject({ type: "session.ended", status: "completed" });
    const types = new Set(of(events, "span.started").map((e) => e.spanType));
    for (const t of ["llm", "thinking", "read", "edit", "bash", "mcp", "subagent"]) expect(types.has(t as never)).toBe(true);
  });

  it("pauses the force-push, records the denial, and recovers safely", async () => {
    const events = await setup().run({ ...base, sessionId: "s2" });
    const paused = of(events, "breakpoint.paused");
    expect(paused).toHaveLength(1);
    expect(paused[0]).toMatchObject({ toolName: "Bash", rule: "destructive-git" });
    expect(of(events, "breakpoint.resolved")[0]).toMatchObject({ decision: "denied", note: "Push to a branch" });
    const tree = new SpanTreeBuilder();
    events.forEach((e) => tree.apply(e));
    const bash = tree.flatten().filter((s) => s.spanType === "bash");
    expect(bash.map((s) => [s.name, s.status])).toEqual([
      ["pnpm test auth --repeat 50", "ok"],
      ["git push --force origin main", "denied"],
      ["git push origin fix/auth-flake", "ok"],
      ["pnpm test auth", "ok"], // turn 2
    ]);
  });

  it("dedupes repeated usage and keeps all money integer", async () => {
    const events = await setup().run({ ...base, sessionId: "s3" });
    const usage = of(events, "usage");
    expect(new Set(usage.map((u) => u.messageId)).size).toBeLessThan(usage.length); // the duplicate was emitted
    const turnsEnded = of(events, "turn.ended");
    expect(turnsEnded).toHaveLength(2);
    const turnTotal = turnsEnded.reduce((n, t) => n + t.costMicroUsd, 0);
    const spanCost = of(events, "span.ended").reduce((n, e) => n + e.costMicroUsd, 0);
    expect(turnTotal).toBe(spanCost); // the duplicate was not double-counted
    expect(of(events, "session.ended")[0]!.totalCostMicroUsd).toBe(turnTotal);
    const turn = turnsEnded[0]!;
    expect(Number.isInteger(turn.costMicroUsd) && Number.isInteger(turn.cacheSavingsMicroUsd)).toBe(true);
    expect(turn.cacheSavingsMicroUsd).toBeGreaterThan(0);
    const ctx = summarizeContext(turn.contextBreakdown, turn.contextLimitTokens);
    expect(ctx.used).toBe(turn.contextUsedTokens);
    expect(Object.values(turn.contextBreakdown).every((v) => v > 0)).toBe(true); // all 7 categories populated
  });

  it("plays a second turn after compacting old tool output", async () => {
    const events = await setup().run({ ...base, sessionId: "s7" });
    const turnsStarted = of(events, "turn.started");
    expect(turnsStarted.map((t) => t.turnIndex)).toEqual([0, 1]);
    const compaction = of(events, "span.started").find((s) => s.spanType === "compaction")!;
    expect(compaction.turnId).toBe(turnsStarted[1]!.turnId);
    const out = of(events, "span.ended").find((e) => e.spanId === compaction.spanId)!.output as { beforeTokens: number; afterTokens: number };
    expect(out.afterTokens).toBeLessThan(out.beforeTokens);
    const [t1, t2] = of(events, "turn.ended");
    expect(t2!.contextBreakdown.toolResults).toBeLessThan(t1!.contextBreakdown.toolResults + 2_000);
  });

  it("nests subagent spans and rolls up their cost", async () => {
    const events = await setup().run({ ...base, sessionId: "s4" });
    const tree = new SpanTreeBuilder();
    events.forEach((e) => tree.apply(e));
    const sub = tree.flatten().find((s) => s.spanType === "subagent")!;
    expect(sub.children.map((c) => c.spanType)).toEqual(["llm"]);
    expect(sub.children[0]!.children.map((c) => c.spanType)).toEqual(["thinking", "mcp"]);
    expect(tree.rolledUpCost(sub.spanId)).toBeGreaterThan(0);
  });

  it("aborts at the budget cap and denies pending calls", async () => {
    const events = await setup().run({ ...base, sessionId: "s5", budgetCapMicroUsd: 50_000 });
    expect(events.at(-1)).toMatchObject({ type: "session.ended", status: "aborted_budget" });
    expect(of(events, "span.started").some((s) => s.name === "git push --force origin main")).toBe(false);
  });

  it("applies an edited payload", async () => {
    const d = deterministic();
    const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0, ...d }), validate: true, now: d.now });
    runner.subscribe((e) => {
      if (e.type === "breakpoint.paused")
        queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "edited", input: { command: "git push origin main" } }));
    });
    const events = await runner.run({ ...base, sessionId: "s6" });
    const ended = of(events, "span.ended").find((e) => e.status === "edited");
    expect(ended?.output).toMatchObject({ ranWith: { command: "git push origin main" } });
  });
});
