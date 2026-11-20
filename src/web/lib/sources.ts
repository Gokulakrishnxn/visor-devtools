import type { TraceModel, TraceSpan } from "@/lib/trace-model";

/** Where something Claude used came from. */
export type SourceKind = "web" | "search" | "link" | "file" | "mcp";

export type Source = {
  key: string;
  kind: SourceKind;
  /** What to show: a URL, a search query, a file path or an MCP tool. */
  label: string;
  /** Only http(s) links are ever clickable. */
  href?: string;
  /** Who used it: "Main agent" or the subagent's name. */
  agents: string[];
  /** How many steps used or mentioned it. */
  uses: number;
  /** The first step that used it, to jump there. */
  spanId: string;
};

const URL_RE = /https?:\/\/[^\s<>"'`)\]}]+/g;

/** http(s) URLs in a piece of text, without trailing punctuation. */
export function urlsIn(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return found.map((u) => u.replace(/[.,;:!?*_]+$/, "")).filter((u) => safeHref(u));
}

/** The URL itself when it is a well-formed http(s) link, else undefined. */
export function safeHref(u: string): string | undefined {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const flatten = (v: unknown): string => (typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v));

/** The agent a step belongs to: the nearest subagent above it, else the main agent. */
function agentOf(model: TraceModel, span: TraceSpan): string {
  let parent = span.parentSpanId ? model.spans[span.parentSpanId] : undefined;
  while (parent) {
    if (parent.spanType === "subagent") return parent.name;
    parent = parent.parentSpanId ? model.spans[parent.parentSpanId] : undefined;
  }
  return "Main agent";
}

/**
 * Everything the main agent and its subagents looked at or pointed to:
 * pages fetched, searches, links in answers and tool results, files read
 * and MCP tools called. Deduplicated, in the order first used.
 */
export function collectSources(model: TraceModel): Source[] {
  const byKey = new Map<string, Source>();
  const add = (kind: SourceKind, label: string, span: TraceSpan, href?: string) => {
    const key = `${kind}:${href ?? label}`;
    const agent = agentOf(model, span);
    const s = byKey.get(key);
    if (s) {
      s.uses++;
      if (!s.agents.includes(agent)) s.agents.push(agent);
    } else byKey.set(key, { key, kind, label, href, agents: [agent], uses: 1, spanId: span.spanId });
  };

  for (const id of model.order) {
    const span = model.spans[id];
    if (!span) continue;
    const input = asRecord(span.input);

    // What the step itself used
    const url = str(input.url);
    const query = str(input.query);
    const file = str(input.file_path) ?? str(input.notebook_path) ?? span.filePath;
    if (url && safeHref(url)) add("web", url, span, safeHref(url));
    else if (query && span.spanType === "read") add("search", query, span);
    else if (span.spanType === "mcp") add("mcp", span.name, span);
    else if (file && (span.spanType === "read" || span.spanType === "edit")) add("file", file, span);

    // Links in what came back (search results, fetched pages, tool output) and in Claude's answers
    const text = `${span.spanType === "llm" || span.spanType === "subagent" ? span.text : ""}\n${flatten(span.output)}`;
    for (const link of new Set(urlsIn(text))) if (link !== safeHref(url ?? "")) add("link", link, span, link);
  }
  return [...byKey.values()];
}
