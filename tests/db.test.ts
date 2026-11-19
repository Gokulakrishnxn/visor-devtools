import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@server/db/client";
import { TraceRecorder } from "@server/db/recorder";
import { policyAuditLog, sessions, spans, turns } from "@server/db/schema";
import { doctor } from "@server/doctor";
import { MockRuntimeAdapter } from "@server/runtime/mock-adapter";
import { SessionRunner } from "@server/runtime/session-runner";

const mode = (p: string) => statSync(p).mode & 0o777;

describe("SQLite persistence", () => {
  it("creates ~/.visor-style folders 0700 and the database 0600 in WAL mode", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "visor-db-")), ".visor");
    const path = join(dir, "traces.db");
    const db = openDatabase(path);
    expect(db.$client.pragma("journal_mode", { simple: true })).toBe("wal");
    db.$client.close();
    expect(mode(dir)).toBe(0o700);
    expect(mode(path)).toBe(0o600);
  });

  it("records a full mock session, including the policy audit trail", async () => {
    const db = openDatabase(":memory:");
    const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }), validate: true });
    const recorder = new TraceRecorder(db);
    runner.subscribe((e) => {
      recorder.record(e);
      if (e.type === "breakpoint.paused") queueMicrotask(() => runner.resolveBreakpoint(e.spanId, { decision: "approved" }));
    });
    await runner.run({ sessionId: "01JSESSION", prompt: "", workspacePath: "/tmp/acme", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null });

    const session = db.select().from(sessions).get()!;
    expect(session).toMatchObject({ id: "01JSESSION", status: "completed", effortLevel: "medium" });
    expect(session.totalCostMicroUsd).toBeGreaterThan(0);

    const turn = db.select().from(turns).get()!;
    expect(turn.costMicroUsd).toBe(session.totalCostMicroUsd);
    expect(turn.inputTokens).toBeGreaterThan(0);
    expect(JSON.parse(turn.contextBreakdownJson!)).toHaveProperty("toolResults");

    const rows = db.select().from(spans).all();
    expect(rows.every((r) => r.status !== "running" && r.latencyMs !== null)).toBe(true);
    expect(rows.find((r) => r.spanType === "edit")?.diffText).toContain("+  const fresh");

    const audit = db.select().from(policyAuditLog).all();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ toolName: "Bash", matchedRule: "destructive-git", decision: "approved" });
    expect(JSON.parse(audit[0]!.originalInputJson!)).toEqual({ command: "git push --force origin main" });
  });

  it("vhud doctor reports permissions and WAL without printing secrets", () => {
    const lines: string[] = [];
    const path = join(mkdtempSync(join(tmpdir(), "visor-doc-")), "v", "traces.db");
    const ok = doctor(path, (l) => lines.push(l));
    expect(lines.some((l) => l.includes("0700"))).toBe(true);
    expect(lines.some((l) => l.includes("journal mode wal"))).toBe(true);
    expect(ok).toBe(false); // tests run with ANTHROPIC_API_KEY empty
  });
});
