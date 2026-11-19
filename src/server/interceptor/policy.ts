import { z } from "zod";

/**
 * Policy rules decide what happens to a tool call before it runs:
 * - "block": denied automatically and logged as auto_blocked
 * - "pause": frozen as a breakpoint until an operator decides
 * - "allow": runs immediately
 * Rules run in the PreToolUse hook, before any allow/deny settings (PRD §3).
 */
export const PolicyRule = z.object({
  rule: z.string().min(1),
  /** Tool name, `*` for any, or a prefix wildcard such as `mcp:*`. */
  tool: z.string().default("*"),
  /** Regex tested against the tool input serialized as JSON. */
  match: z.string().optional(),
  /** Simple glob tested against the input's file path (`**`, `*`). */
  path: z.string().optional(),
  /** For MCP tools: only calls that write. */
  write: z.boolean().optional(),
  action: z.enum(["pause", "block"]).default("pause"),
});
export type PolicyRule = z.infer<typeof PolicyRule>;

export type ToolCall = { toolName: string; input: Record<string, unknown> };
export type Verdict = { action: "allow" } | { action: "pause" | "block"; rule: string };

/** Always on: secrets are never read, destructive commands always pause. */
export const BUILT_IN_RULES: PolicyRule[] = [
  { rule: "secret-files", tool: "*", path: "**/{.env,.env.*,*.pem,*.key,id_rsa,id_ed25519}", action: "block" },
  {
    rule: "destructive-shell",
    tool: "Bash",
    match: String.raw`rm\s+-[a-zA-Z]*r[a-zA-Z]*f|rm\s+-[a-zA-Z]*f[a-zA-Z]*r|mkfs|dd\s+if=|:\(\)\s*\{`,
    action: "pause",
  },
  { rule: "destructive-git", tool: "Bash", match: String.raw`git\s+push\s+.*(--force|-f\b)|git\s+reset\s+--hard`, action: "pause" },
  { rule: "destructive-sql", tool: "*", match: String.raw`\b(DROP\s+(TABLE|DATABASE)|TRUNCATE)\b`, action: "pause" },
];

/** Converts a small glob (`**`, `*`, `{a,b}`) to an anchored regex. */
export function globToRegex(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (ch === "*") re += "[^/]*";
    else if (ch === "{") {
      const end = glob.indexOf("}", i);
      const alts = glob.slice(i + 1, end).split(",").map((a) => globToRegex(a).source.slice(1, -1));
      re += `(?:${alts.join("|")})`;
      i = end;
    } else re += /[.+?^$()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
  }
  return new RegExp(`^${re}$`);
}

function toolMatches(pattern: string, toolName: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) return toolName.startsWith(pattern.slice(0, -1));
  return pattern === toolName;
}

function filePathOf(input: Record<string, unknown>): string | undefined {
  const v = input.file_path ?? input.path ?? input.filePath;
  return typeof v === "string" ? v : undefined;
}

function isWrite(input: Record<string, unknown>): boolean {
  return input.write === true || /create|update|delete|write|insert|merge|push/i.test(String(input.method ?? input.name ?? ""));
}

export class PolicyEngine {
  private readonly rules: PolicyRule[];

  constructor(userRules: PolicyRule[] = []) {
    // Built-ins first, so user config can add rules but never skip them
    this.rules = [...BUILT_IN_RULES, ...userRules.map((r) => PolicyRule.parse(r))];
  }

  evaluate(call: ToolCall): Verdict {
    const json = JSON.stringify(call.input);
    const file = filePathOf(call.input);
    let paused: Verdict | null = null;
    for (const r of this.rules) {
      if (!toolMatches(r.tool, call.toolName)) continue;
      if (r.match && !new RegExp(r.match, "i").test(json)) continue;
      if (r.path && !(file && (globToRegex(r.path).test(file) || globToRegex(`**/${r.path}`).test(file)))) continue;
      if (r.write && !isWrite(call.input)) continue;
      if (!r.match && !r.path && !r.write && r.tool === "*") continue; // a rule must say what it matches
      if (r.action === "block") return { action: "block", rule: r.rule }; // block wins over pause
      paused ??= { action: "pause", rule: r.rule };
    }
    return paused ?? { action: "allow" };
  }
}
