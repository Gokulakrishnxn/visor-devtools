import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HookCallback, Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import type { VisorEvent } from "@shared/events";
import { loadConfig } from "@server/config";
import { ClaudeSdkAdapter, type QueryFn } from "@server/runtime/claude-sdk-adapter";
import { SessionRunner } from "@server/runtime/session-runner";
import { condense, ctxGet, handleOf, nameFor, replacedOutput, resultText } from "@server/straitjacket";
import { deriveTrace } from "@/lib/trace-model";

/** A stand-in for Straitjacket's `ctx`: `intake` prints a digest, `get` prints lines. */
function fakeCtx(): string {
  const dir = mkdtempSync(join(tmpdir(), "visor-ctx-"));
  const bin = join(dir, "ctx");
  writeFileSync(
    bin,
    `#!/bin/sh
case "$1" in
  --version) echo "ctx 0.44.0" ;;
  intake) n=$(wc -c | tr -d ' '); printf '[ctx run:abcdef123456 profile=logtemplate/v1]\\nintake: %s bytes\\nnext:\\n  ctx get run:abcdef123456#stdout --lines 1:40\\n' "$n" ;;
  get) echo "line for $2 $4" ;;
  *) exit 2 ;;
esac
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

describe("Straitjacket integration", () => {
  it("reads tool results of any shape and names digests safely", () => {
    expect(resultText({ stdout: "out", stderr: "err" })).toBe("out\nerr");
    expect(resultText("plain")).toBe("plain");
    expect(resultText([{ type: "text", text: "a" }, "b"])).toBe("a\nb");
    expect(nameFor("/usr/bin/pytest -q; rm -rf /")).toBe("pytest");
    expect(nameFor(undefined)).toBe("bash");
    expect(handleOf("[ctx run:690d46e45560 profile=x]\nbody run:ffffffffffff")).toBe("run:690d46e45560");
    expect(replacedOutput({ stdout: "big", stderr: "x", interrupted: false }, "digest")).toEqual({ stdout: "digest", stderr: "", interrupted: false });
    expect(replacedOutput("big", "digest")).toBe("digest");
  });

  it("condenses only big output, and only when ctx works", async () => {
    const ctx = fakeCtx();
    const cwd = mkdtempSync(join(tmpdir(), "visor-ws-"));
    const big = "x".repeat(50_000);
    const done = await condense({ stdout: big }, { command: "pytest -q" }, cwd, { command: ctx, minChars: 20_000 });
    expect(done).toMatchObject({ handle: "run:abcdef123456", originalChars: 50_000 });
    expect(done!.digest).toContain("intake: 50000 bytes");
    expect(await condense({ stdout: "small" }, {}, cwd, { command: ctx, minChars: 20_000 })).toBeNull();
    expect(await condense({ stdout: big }, {}, cwd, { command: join(cwd, "no-such-ctx"), minChars: 20_000 })).toBeNull();
    expect(await ctxGet(ctx, "run:abcdef123456", 1, 400, cwd)).toBe("line for run:abcdef123456#stdout 1:400\n");
    expect(await ctxGet(ctx, "run:$(whoami)", 1, 400, cwd)).toBeNull(); // only real handles
  });

  it("swaps a big shell result for the digest, records the saving, and leaves other tools alone", async () => {
    let post: HookCallback | undefined;
    const replies: unknown[] = [];
    const query: QueryFn = async function* ({ options }) {
      const o = options as Options;
      const pre = o.hooks!.PreToolUse![0]!.hooks[0]! as HookCallback;
      post = o.hooks!.PostToolUse?.[0]?.hooks[0] as HookCallback | undefined;
      const sig = { signal: new AbortController().signal };
      const base = { session_id: "sdk", transcript_path: "", cwd: "/w" };
      yield { type: "assistant", message: { id: "m1", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "pytest -q" } }, { type: "tool_use", id: "t2", name: "Read", input: { file_path: "a" } }], usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, parent_tool_use_id: null, uuid: "u", session_id: "sdk" } as unknown as SDKMessage;
      await pre({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "pytest -q" }, tool_use_id: "t1" } as never, "t1", sig);
      replies.push(await post!({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "pytest -q" }, tool_response: { stdout: "E".repeat(80_000), stderr: "" }, tool_use_id: "t1" } as never, "t1", sig));
      await pre({ ...base, hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "a" }, tool_use_id: "t2" } as never, "t2", sig);
      replies.push(await post!({ ...base, hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "a" }, tool_response: "R".repeat(80_000), tool_use_id: "t2" } as never, "t2", sig));
      yield { type: "result", subtype: "success", total_cost_usd: 0.001, is_error: false, num_turns: 1, result: "", usage: {}, modelUsage: {}, uuid: "u", session_id: "sdk" } as unknown as SDKMessage;
    };
    const adapter = new ClaudeSdkAdapter({
      query,
      straitjacket: { command: "ctx", minChars: 20_000 },
      condense: async (output) => ({ digest: "[ctx run:abcdef123456 profile=pytest/v1]\n3 failed", handle: "run:abcdef123456", originalChars: resultText(output).length }),
    });
    const runner = new SessionRunner({ adapter, validate: true });
    const events: VisorEvent[] = await runner.run({ sessionId: "sj", prompt: "test", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null });

    expect(replies[0]).toEqual({ hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: { stdout: "[ctx run:abcdef123456 profile=pytest/v1]\n3 failed", stderr: "" } } });
    expect(replies[1]).toEqual({}); // only shell output is condensed
    const condensed = events.filter((e) => e.type === "output.condensed");
    expect(condensed).toHaveLength(1);
    expect(condensed[0]).toMatchObject({ tool: "Bash", handle: "run:abcdef123456", originalChars: 80_000, originalTokens: 20_000 });
    const m = deriveTrace(events);
    expect(m.condensed.outputs).toBe(1);
    expect(m.condensed.tokensSaved).toBeGreaterThan(19_000);
    expect(Object.values(m.spans).find((s) => s.condensed)?.condensed?.handle).toBe("run:abcdef123456");
  });

  it("is on by default (used when ctx exists) and can be turned off or tuned", () => {
    const dir = mkdtempSync(join(tmpdir(), "visor-sjcfg-"));
    expect(loadConfig(dir).config.straitjacket).toEqual({ enabled: "auto", minChars: 20_000, command: "ctx" });
    writeFileSync(join(dir, ".visor.json"), JSON.stringify({ straitjacket: { enabled: false, minChars: 5000 } }));
    expect(loadConfig(dir).config.straitjacket).toMatchObject({ enabled: false, minChars: 5000 });
  });
});
