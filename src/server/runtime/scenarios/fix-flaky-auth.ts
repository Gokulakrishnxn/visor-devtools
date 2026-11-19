import type { SpanType } from "@shared/events";
import type { TokenUsage } from "@shared/pricing";

export type ToolStep = {
  kind: "tool";
  tool: string;
  spanType: Extract<SpanType, "read" | "edit" | "bash" | "mcp">;
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  diff?: string;
  filePath?: string;
  /** Tokens this result adds to the context window. */
  resultTokens: number;
  ms: number;
  /** What the agent does instead when this call is denied. */
  onDenied?: ToolStep;
};

export type LlmStep = {
  kind: "llm";
  messageId: string;
  usage: TokenUsage;
  thinking?: string;
  /** Final assistant text for this call, if any. */
  text?: string;
  ms: number;
  /** Tool calls requested by this message (run in order, may repeat usage). */
  tools?: ToolStep[];
  /** Parallel tool calls re-report the same usage; the ledger must count it once. */
  duplicateUsage?: boolean;
};

export type SubagentStep = {
  kind: "subagent";
  name: string;
  prompt: string;
  steps: LlmStep[];
  handoffTokens: number;
};

/** The harness summarizes old tool output to free context (PreCompact / PostCompact). */
export type CompactionStep = {
  kind: "compaction";
  /** Tool-result tokens dropped from the window. */
  droppedTokens: number;
  /** Size of the summary that replaces them (counted as messages). */
  summaryTokens: number;
  ms: number;
};

export type ScenarioTurn = { prompt: string; steps: (LlmStep | SubagentStep | CompactionStep)[] };

export type Scenario = {
  title: string;
  contextBase: { projectRules: number; toolSchemas: number; mentionedFiles: number; messages: number };
  turns: ScenarioTurn[];
};

const u = (input: number, w5: number, read: number, output: number): TokenUsage => ({
  inputTokens: input,
  cacheWrite5mTokens: w5,
  cacheWrite1hTokens: 0,
  cacheReadTokens: read,
  outputTokens: output,
});

const SESSION_TS = `export async function getSession(req: Request) {
  const token = readToken(req);
  refreshToken(token);
  return sessions.get(token.id);
}`;

const DIFF = `@@ -41,5 +41,6 @@
 export async function getSession(req: Request) {
   const token = readToken(req);
-  refreshToken(token);
-  return sessions.get(token.id);
+  const fresh = await refreshToken(token);
+  if (!fresh) throw new AuthError("expired");
+  return sessions.get(fresh.id);
 }`;

/** The demo run used by every Phase 2 prototype and by the tests. */
const TEST_DIFF = `@@ -18,6 +18,17 @@ describe("getSession", () => {
   it("returns the session for a fresh token", async () => {
     expect(await getSession(req("fresh"))).toMatchObject({ id: "u_1" });
   });
+
+  it("throws AuthError when the refresh fails", async () => {
+    vi.mocked(refreshToken).mockResolvedValueOnce(null);
+    await expect(getSession(req("expired"))).rejects.toThrow(AuthError);
+  });
+
+  it("waits for the refresh before reading the session", async () => {
+    vi.mocked(refreshToken).mockImplementationOnce(() => sleep(20).then(() => fresh));
+    expect(await getSession(req("stale"))).toMatchObject({ id: fresh.id });
+  });
 });`;

export const FIX_FLAKY_AUTH: Scenario = {
  title: "Fix flaky auth test",
  contextBase: { projectRules: 3_200, toolSchemas: 14_800, mentionedFiles: 2_100, messages: 1_400 },
  turns: [
    {
      prompt: "Fix the flaky auth test and get CI green.",
      steps: [
    {
      kind: "llm",
      messageId: "msg_01",
      usage: u(3_412, 1_920, 18_210, 412),
      thinking:
        "The test fails about 1 in 10 runs. That smells like a race. getSession calls refreshToken without awaiting it, so sessions.get can read the old token. I'll read the file, then check other callers.",
      ms: 900,
      duplicateUsage: true,
      tools: [
        {
          kind: "tool",
          tool: "Read",
          spanType: "read",
          name: "src/auth/session.ts",
          filePath: "src/auth/session.ts",
          input: { file_path: "src/auth/session.ts" },
          output: SESSION_TS,
          resultTokens: 1_850,
          ms: 120,
        },
        {
          kind: "tool",
          tool: "Grep",
          spanType: "read",
          name: "refreshToken(",
          input: { pattern: "refreshToken(", path: "src" },
          output: ["src/auth/session.ts:43", "src/auth/middleware.ts:18", "src/api/login.ts:27"],
          resultTokens: 240,
          ms: 80,
        },
      ],
    },
    {
      kind: "subagent",
      name: "explore",
      prompt: "Find every caller that assumes refreshToken is synchronous.",
      handoffTokens: 1_100,
      steps: [
        {
          kind: "llm",
          messageId: "msg_sub_01",
          usage: u(1_250, 0, 6_400, 380),
          thinking: "Checking middleware.ts and login.ts for un-awaited calls.",
          ms: 700,
          tools: [
            {
              kind: "tool",
              tool: "mcp:github.search_code",
              spanType: "mcp",
              name: "github · search_code",
              input: { method: "tools/call", name: "search_code", arguments: { q: "refreshToken repo:acme/api" } },
              output: { jsonrpc: "2.0", result: { total_count: 3, items: ["session.ts", "middleware.ts", "login.ts"] } },
              resultTokens: 620,
              ms: 340,
            },
          ],
        },
      ],
    },
    {
      kind: "llm",
      messageId: "msg_02",
      usage: u(820, 0, 24_300, 650),
      thinking: "Only session.ts is affected. Await the refresh and guard the expired case.",
      ms: 800,
      tools: [
        {
          kind: "tool",
          tool: "Edit",
          spanType: "edit",
          name: "src/auth/session.ts",
          filePath: "src/auth/session.ts",
          input: {
            file_path: "src/auth/session.ts",
            old_string: "  refreshToken(token);\n  return sessions.get(token.id);",
            new_string:
              '  const fresh = await refreshToken(token);\n  if (!fresh) throw new AuthError("expired");\n  return sessions.get(fresh.id);',
          },
          output: { ok: true },
          diff: DIFF,
          resultTokens: 160,
          ms: 90,
        },
        {
          kind: "tool",
          tool: "Bash",
          spanType: "bash",
          name: "pnpm test auth --repeat 50",
          input: { command: "pnpm test auth --repeat 50" },
          output: "✓ auth/session.test.ts (50 runs) 4.1s\n\nTests  50 passed (50)",
          resultTokens: 310,
          ms: 1_400,
        },
      ],
    },
    {
      kind: "llm",
      messageId: "msg_03",
      usage: u(410, 0, 25_100, 220),
      ms: 600,
      tools: [
        {
          kind: "tool",
          tool: "Bash",
          spanType: "bash",
          name: "git push --force origin main",
          input: { command: "git push --force origin main" },
          output: "To github.com:acme/api.git\n + 3f2c1a9...9b7e410 main -> main (forced update)",
          resultTokens: 90,
          ms: 700,
          onDenied: {
            kind: "tool",
            tool: "Bash",
            spanType: "bash",
            name: "git push origin fix/auth-flake",
            input: { command: "git push origin fix/auth-flake" },
            output: "To github.com:acme/api.git\n * [new branch] fix/auth-flake -> fix/auth-flake",
            resultTokens: 80,
            ms: 650,
          },
        },
      ],
    },
    {
      kind: "llm",
      messageId: "msg_04",
      usage: u(260, 0, 25_600, 180),
      text: "The session test raced the token refresh. I awaited the refresh, guarded the expired case, and the suite now passes 50 out of 50 runs.",
      ms: 500,
    },
      ],
    },
    {
      prompt: "Add a regression test for the expired-token case.",
      steps: [
        { kind: "compaction", droppedTokens: 2_600, summaryTokens: 420, ms: 500 },
        {
          kind: "llm",
          messageId: "msg_05",
          usage: u(640, 2_400, 22_900, 520),
          thinking: "Two cases: refresh returns null should throw AuthError, and a slow refresh must be awaited. I'll extend the existing describe block.",
          ms: 800,
          tools: [
            {
              kind: "tool",
              tool: "Read",
              spanType: "read",
              name: "tests/auth/session.test.ts",
              filePath: "tests/auth/session.test.ts",
              input: { file_path: "tests/auth/session.test.ts" },
              output: `import { describe, expect, it, vi } from "vitest";
import { getSession } from "../../src/auth/session";

describe("getSession", () => {
  it("returns the session for a fresh token", async () => {
    expect(await getSession(req("fresh"))).toMatchObject({ id: "u_1" });
  });
});`,
              resultTokens: 980,
              ms: 110,
            },
            {
              kind: "tool",
              tool: "Edit",
              spanType: "edit",
              name: "tests/auth/session.test.ts",
              filePath: "tests/auth/session.test.ts",
              input: { file_path: "tests/auth/session.test.ts", old_string: "});", new_string: "  // 2 new cases\n});" },
              output: { ok: true },
              diff: TEST_DIFF,
              resultTokens: 140,
              ms: 90,
            },
            {
              kind: "tool",
              tool: "Bash",
              spanType: "bash",
              name: "pnpm test auth",
              input: { command: "pnpm test auth" },
              output: "✓ auth/session.test.ts (3 tests) 212ms\n\nTests  3 passed (3)",
              resultTokens: 120,
              ms: 900,
            },
          ],
        },
        {
          kind: "llm",
          messageId: "msg_06",
          usage: u(180, 0, 26_100, 140),
          text: "Added two regression tests: one for a failed refresh throwing AuthError, one proving the refresh is awaited. All 3 tests pass.",
          ms: 500,
        },
      ],
    },
  ],
};
