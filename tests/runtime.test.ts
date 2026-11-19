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
    ]);
  });

  it("dedupes repeated usage and keeps all money integer", async () => {
    const events = await setup().run({ ...base, sessionId: "s3" });
    const usage = of(events, "usage");
    expect(new Set(usage.map((u) => u.messageId)).size).toBeLessThan(usage.length); // the duplicate was emitted
    const turn = of(events, "turn.ended")[0]!;
    const spanCost = of(events, "span.ended").reduce((n, e) => n + e.costMicroUsd, 0);
    expect(turn.costMicroUsd).toBe(spanCost); // the duplicate was not double-counted
    expect(Number.isInteger(turn.costMicroUsd) && Number.isInteger(turn.cacheSavingsMicroUsd)).toBe(true);
    expect(turn.cacheSavingsMicroUsd).toBeGreaterThan(0);
    const ctx = summarizeContext(turn.contextBreakdown, turn.contextLimitTokens);
    expect(ctx.used).toBe(turn.contextUsedTokens);
    expect(Object.values(turn.contextBreakdown).every((v) => v > 0)).toBe(true); // all 7 categories populated
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
