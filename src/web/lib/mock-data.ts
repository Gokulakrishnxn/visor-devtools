// Static demo data around the live mock run: past sessions, the prepaid
// wallet, MCP server health and project memory. All money in integer µUSD.

export type PastSession = { id: string; title: string; status: "completed" | "aborted_budget" | "error"; costMicroUsd: number; when: string };

export const WORKSPACE = { name: "acme-api", path: "~/code/acme-api", branch: "fix/auth-flake" };

export const PAST_SESSIONS: PastSession[] = [
  { id: "past-1", title: "Pricing registry overrides", status: "completed", costMicroUsd: 182_400, when: "2h ago" },
  { id: "past-2", title: "Migrate users table", status: "aborted_budget", costMicroUsd: 1_000_000, when: "Yesterday" },
  { id: "past-3", title: "Rate limiter for /login", status: "completed", costMicroUsd: 96_210, when: "Yesterday" },
  { id: "past-4", title: "Flaky e2e on Safari", status: "error", costMicroUsd: 41_380, when: "Mon" },
];

export const MCP_SERVERS = [
  { name: "filesystem", online: true, tools: 11 },
  { name: "github", online: true, tools: 26 },
  { name: "postgres", online: false, tools: 0 },
];

export const PROJECT_MEMORY = [
  "Use pnpm, never npm.",
  "Tests live in tests/, run with `pnpm test`.",
  "Never force-push main; open a PR from a branch.",
  "Auth tokens are refreshed async; always await refreshToken().",
];

export const CONTEXT_META = {
  projectRules: { label: "Project rules", hint: "CLAUDE.md (global, project, directory)", color: "#7aa2ff" },
  toolSchemas: { label: "MCP & tool schemas", hint: "Connected tool definitions and skills", color: "#5eead4" },
  mentionedFiles: { label: "Mentioned files", hint: "@-referenced workspace files", color: "#fbbf24" },
  toolResults: { label: "Tool results", hint: "Reads, grep, bash stdout, MCP responses", color: "#34d399" },
  thinking: { label: "Extended thinking", hint: "Retained reasoning blocks", color: "#a78bfa" },
  subagents: { label: "Subagent overhead", hint: "Handoff prompts and returned payloads", color: "#f472b6" },
  messages: { label: "Messages", hint: "User and assistant turns", color: "#94a3b8" },
} as const;
