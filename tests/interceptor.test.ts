import { describe, expect, it } from "vitest";
import { BreakpointQueue } from "@server/interceptor/breakpoints";
import { BudgetWatchdog } from "@server/interceptor/budget";
import { globToRegex, PolicyEngine } from "@server/interceptor/policy";

describe("policy engine", () => {
  const policy = new PolicyEngine();

  it("blocks secret files with built-in rules", () => {
    expect(policy.evaluate({ toolName: "Read", input: { file_path: ".env" } })).toEqual({ action: "block", rule: "secret-files" });
    expect(policy.evaluate({ toolName: "Read", input: { file_path: "config/.env.local" } })).toMatchObject({ action: "block" });
    expect(policy.evaluate({ toolName: "Read", input: { file_path: "/home/me/.ssh/id_rsa" } })).toMatchObject({ action: "block" });
  });

  it("pauses destructive shell and git commands", () => {
    expect(policy.evaluate({ toolName: "Bash", input: { command: "git push --force origin main" } })).toEqual({
      action: "pause",
      rule: "destructive-git",
    });
    expect(policy.evaluate({ toolName: "Bash", input: { command: "rm -rf dist" } })).toMatchObject({ action: "pause", rule: "destructive-shell" });
  });

  it("allows ordinary calls", () => {
    expect(policy.evaluate({ toolName: "Read", input: { file_path: "src/auth/session.ts" } })).toEqual({ action: "allow" });
    expect(policy.evaluate({ toolName: "Bash", input: { command: "git push origin fix/auth" } })).toEqual({ action: "allow" });
  });

  it("adds user rules without letting them skip built-ins", () => {
    const p = new PolicyEngine([
      { rule: "schema-change", tool: "Edit", path: "src/server/db/**", action: "pause" },
      { rule: "mcp-write", tool: "mcp:*", write: true, action: "pause" },
    ]);
    expect(p.evaluate({ toolName: "Edit", input: { file_path: "src/server/db/schema.ts" } })).toMatchObject({ rule: "schema-change" });
    expect(p.evaluate({ toolName: "mcp:github", input: { name: "create_issue" } })).toMatchObject({ rule: "mcp-write" });
    expect(p.evaluate({ toolName: "mcp:github", input: { name: "list_issues" } })).toEqual({ action: "allow" });
    expect(p.evaluate({ toolName: "Read", input: { file_path: ".env" } })).toMatchObject({ action: "block" });
  });

  it("supports small globs", () => {
    expect(globToRegex("src/**/*.ts").test("src/a/b/c.ts")).toBe(true);
    expect(globToRegex("*.{pem,key}").test("server.key")).toBe(true);
    expect(globToRegex("*.ts").test("a/b.ts")).toBe(false);
  });
});

describe("breakpoint queue", () => {
  it("freezes a call until the operator decides", async () => {
    const q = new BreakpointQueue();
    const pending = q.wait({ sessionId: "s", spanId: "sp1", toolName: "Bash", rule: "r", input: {} });
    expect(q.list()).toHaveLength(1);
    expect(q.resolve("sp1", { decision: "denied", note: "use a branch" })).toBe(true);
    await expect(pending).resolves.toEqual({ decision: "denied", note: "use a branch" });
    expect(q.resolve("sp1", { decision: "approved" })).toBe(false);
  });

  it("denies everything pending when a session aborts", async () => {
    const q = new BreakpointQueue();
    const a = q.wait({ sessionId: "s", spanId: "a", toolName: "Bash", rule: "r", input: {} });
    const b = q.wait({ sessionId: "other", spanId: "b", toolName: "Bash", rule: "r", input: {} });
    expect(q.abortSession("s", "Budget cap reached")).toBe(1);
    await expect(a).resolves.toEqual({ decision: "denied", note: "Budget cap reached" });
    expect(q.list()).toHaveLength(1);
    q.resolve("b", { decision: "approved" });
    await b;
  });
});

describe("budget watchdog", () => {
  it("warns at 80% and trips at the cap", () => {
    const w = new BudgetWatchdog(5_000_000);
    expect(w.check(1_000_000).status).toBe("ok");
    expect(w.check(4_000_000).status).toBe("warning");
    expect(w.check(5_000_000)).toEqual({ status: "exceeded", spent: 5_000_000, cap: 5_000_000, remaining: 0 });
    expect(new BudgetWatchdog(null).check(99_000_000).status).toBe("ok");
    expect(new BudgetWatchdog(null, 100).check(0, 100).status).toBe("exceeded");
  });
});
