import { useMemo, useState } from "react";
import { ArrowUpRight, FileText, Globe, Link2, Plug, Search } from "lucide-react";
import { collectSources, type Source, type SourceKind } from "@/lib/sources";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";

const GROUPS: { kind: SourceKind; title: string; icon: typeof Globe }[] = [
  { kind: "web", title: "Pages fetched", icon: Globe },
  { kind: "search", title: "Web searches", icon: Search },
  { kind: "link", title: "Links mentioned", icon: Link2 },
  { kind: "mcp", title: "MCP tools", icon: Plug },
  { kind: "file", title: "Files", icon: FileText },
];

/** "example.com/path" for a URL, so the list reads like a reference list. */
function shortUrl(href: string): { host: string; rest: string } {
  const u = new URL(href);
  const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}`;
  return { host: u.hostname.replace(/^www\./, ""), rest };
}

/**
 * Every source the main agent and its subagents used in this session:
 * pages, searches, links, MCP tools and files. Links open in a new tab;
 * the row jumps to the step that used it.
 */
export function SourcesPanel({ model, onSelect }: { model: TraceModel; onSelect: (spanId: string) => void }) {
  const sources = useMemo(() => collectSources(model), [model]);
  const agents = useMemo(() => [...new Set(sources.flatMap((s) => s.agents))], [sources]);
  const [agent, setAgent] = useState<string | null>(null);
  const shown = agent ? sources.filter((s) => s.agents.includes(agent)) : sources;

  if (!sources.length) {
    return (
      <div className="p-6 text-center">
        <p className="text-[13px] text-white/55">No sources yet</p>
        <p className="mt-1 text-[12px] leading-relaxed text-white/35">Pages, searches, links, files and MCP tools that Claude and its agents use will be listed here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {[null, ...agents].map((a) => (
          <button
            key={a ?? "all"}
            type="button"
            onClick={() => setAgent(a)}
            aria-pressed={agent === a}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors",
              agent === a ? "border-white/20 bg-white/[0.08] text-foreground" : "border-white/[0.08] text-white/50 hover:text-foreground",
            )}
          >
            {a ?? `All · ${sources.length}`}
          </button>
        ))}
      </div>

      {GROUPS.map((g) => {
        const list = shown.filter((s) => s.kind === g.kind);
        if (!list.length) return null;
        return (
          <section key={g.kind}>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] text-white/45">
              <g.icon size={13} /> {g.title}
              <span className="text-white/25">{list.length}</span>
            </h3>
            <ul className="space-y-px">
              {list.map((s) => (
                <SourceRow key={s.key} source={s} onSelect={onSelect} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function SourceRow({ source: s, onSelect }: { source: Source; onSelect: (spanId: string) => void }) {
  const url = s.href ? shortUrl(s.href) : null;
  return (
    <li className="group flex items-start gap-1 rounded-lg hover:bg-white/[0.04]">
      <button type="button" onClick={() => onSelect(s.spanId)} title="Show the step that used it" className="min-w-0 flex-1 px-2 py-1.5 text-left">
        {url ? (
          <span className="block truncate text-[12.5px]">
            <span className="text-foreground/90">{url.host}</span>
            <span className="text-white/40">{url.rest}</span>
          </span>
        ) : (
          <span className={cn("block truncate text-[12.5px] text-foreground/90", s.kind === "file" && "font-mono text-[12px]")}>{s.label}</span>
        )}
        <span className="mt-0.5 block truncate text-[11px] text-white/35">
          {s.agents.join(", ")}
          {s.uses > 1 && ` · ${s.uses}×`}
        </span>
      </button>
      {s.href && (
        <a
          href={s.href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Open ${s.href}`}
          title={s.href}
          className="mr-1 mt-1.5 rounded-md p-1 text-white/35 hover:bg-white/[0.08] hover:text-foreground"
        >
          <ArrowUpRight size={14} />
        </a>
      )}
    </li>
  );
}
