import { describe, expect, it } from "vitest";
import { MockRuntimeAdapter } from "@server/runtime/mock-adapter";
import { SessionRunner } from "@server/runtime/session-runner";
import { deriveTrace, walkOrder } from "@/lib/trace-model";

async function run() {
  const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }), validate: true });
  runner.subscribe((e) => {
    if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "denied", note: "branch please" }));
  });
  return runner.run({ sessionId: "s", prompt: "", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null });
}

describe("GUI trace model", () => {
  it("folds a whole session into turns, spans, cost and context", async () => {
    const events = await run();
    const m = deriveTrace(events);
    expect(m.session?.status).toBe("completed");
    expect(m.turns).toHaveLength(2);
    const ended = events.filter((e) => e.type === "session.ended")[0];
    expect(m.cost.total).toBe(ended?.type === "session.ended" ? ended.totalCostMicroUsd : -1); // live cost == authoritative total
    expect(m.contextHistory.map((c) => c.compacted)).toEqual([false, true]);
    expect(m.paused).toBeNull();
    expect(walkOrder(m)).toHaveLength(m.order.length);
    const denied = Object.values(m.spans).find((s) => s.breakpoint?.decision === "denied");
    expect(denied?.breakpoint).toMatchObject({ rule: "destructive-git", note: "branch please" });
  });

  it("replays any moment from a prefix of the stream", async () => {
    const events = await run();
    const pausedAt = events.findIndex((e) => e.type === "breakpoint.paused");
    const m = deriveTrace(events.slice(0, pausedAt + 1));
    expect(m.paused?.toolName).toBe("Bash");
    expect(m.session?.status).toBe("paused");
    expect(m.turns).toHaveLength(1);
  });

  it("raises few, meaningful alerts", async () => {
    const m = deriveTrace(await run());
    const kinds = m.alerts.map((a) => a.title);
    expect(kinds).toContain("Context compacted");
    expect(kinds.filter((k) => k === "Token spike").length).toBeLessThanOrEqual(2);
  });
});
