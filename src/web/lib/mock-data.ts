// Static display data: MCP server health (until 3.5 reads it live) and context colors.

export const MCP_SERVERS = [
  { name: "filesystem", online: true, tools: 11 },
  { name: "github", online: true, tools: 26 },
  { name: "postgres", online: false, tools: 0 },
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
