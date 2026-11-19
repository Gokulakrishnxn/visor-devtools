import { describe, expect, it } from "vitest";
import { checkToolInput } from "@shared/tool-inputs";

describe("Edit JSON validation", () => {
  it("accepts a valid edited Bash call", () => {
    expect(checkToolInput("Bash", '{"command":"git push origin fix/auth-flake"}')).toEqual({
      ok: true,
      value: { command: "git push origin fix/auth-flake" },
    });
  });

  it("explains wrong keys and bad JSON", () => {
    const wrongKey = checkToolInput("Bash", '{"cmd":"git push"}');
    expect(wrongKey.ok).toBe(false);
    if (!wrongKey.ok) expect(wrongKey.errors.join(" ")).toMatch(/command/);
    const bad = checkToolInput("Bash", "{command: oops");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]).toMatch(/Invalid JSON/);
  });

  it("falls back to any JSON object for unknown tools", () => {
    expect(checkToolInput("mcp:github.create_issue", '{"title":"x"}').ok).toBe(true);
    expect(checkToolInput("mcp:github.create_issue", "[1,2]").ok).toBe(false);
  });
});
