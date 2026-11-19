export type DocPage = { title: string; href: string; description: string; keywords?: string };
export type DocGroup = { title: string; pages: DocPage[] };

export const docsNav: DocGroup[] = [
  {
    title: "Getting started",
    pages: [
      { title: "Introduction", href: "/docs", description: "What V.I.S.O.R. is and why it exists." },
      { title: "Quickstart", href: "/docs/quickstart", description: "Run the harness locally in a few minutes.", keywords: "install npx setup" },
      { title: "Architecture", href: "/docs/architecture", description: "The five decoupled layers, from GUI to SQLite.", keywords: "daemon websocket hono layers" },
    ],
  },
  {
    title: "The five pillars",
    pages: [
      { title: "Verified", href: "/docs/verified", description: "Exact tokens, cache savings and micro-dollar cost.", keywords: "pricing cost tokens wallet budget micro-dollar" },
      { title: "Inspection", href: "/docs/inspection", description: "Thinking, reads, diffs, MCP payloads and context.", keywords: "thinking diff shiki context seven categories" },
      { title: "Spans", href: "/docs/spans", description: "OpenTelemetry-style trees of timed execution.", keywords: "trace waterfall latency subagent" },
      { title: "Overrides", href: "/docs/overrides", description: "Breakpoints: approve, edit JSON, or deny with steering.", keywords: "breakpoint pretooluse approve deny edit rules" },
      { title: "Runtime", href: "/docs/runtime", description: "The local daemon and runtime adapters.", keywords: "adapter mock claude agent sdk mcp" },
    ],
  },
  {
    title: "Reference",
    pages: [
      { title: "Configuration", href: "/docs/configuration", description: "The .visor.json rules, triggers and MCP servers.", keywords: "visor.json config rules triggers" },
      { title: "CLI", href: "/docs/cli", description: "The vhud launcher and vhud doctor.", keywords: "vhud doctor command line" },
      { title: "Data model", href: "/docs/data-model", description: "SQLite tables for sessions, spans and the ledger.", keywords: "sqlite drizzle schema tables" },
      { title: "Roadmap", href: "/docs/roadmap", description: "Phases, gates and what ships when.", keywords: "phase plan milestones" },
    ],
  },
];

export const allDocs = docsNav.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.title })));

export function findDoc(pathname: string) {
  const path = pathname.replace(/\/$/, "") || "/docs";
  const i = allDocs.findIndex((d) => d.href === path);
  return { doc: allDocs[i], prev: allDocs[i - 1], next: allDocs[i + 1] };
}
