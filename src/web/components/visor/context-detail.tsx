import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ContextDetail } from "@shared/events";
import { fmtTokens } from "@/components/visor/primitives";
import { cn } from "@/lib/utils";

type Category = ContextDetail["categories"][number];

// Same idea as the Claude app: the big rows get colors, the rest stay gray
const COLOR: Record<string, string> = {
  messages: "#5b8def",
  mcp_tools: "#e07a45",
  system_tools: "#3fae8c",
  system_prompt: "#a3a3a3",
  skills: "#b9b9b9",
  mcp_instructions: "#8f8f8f",
  custom_agents: "#7d7d7d",
  memory_files: "#c8c8c8",
  autocompact_buffer: "#555555",
  compact_buffer: "#555555",
  free_space: "#2a2a2a",
};
const colorOf = (c: Category) => COLOR[c.id ?? ""] ?? (c.kind === "free" ? "#2a2a2a" : c.kind === "buffer" ? "#555555" : "#9a9a9a");

const pct = (n: number, of: number) => (of > 0 ? `${((n / of) * 100).toFixed(1)}%` : "0%");
const short = (path: string) => path.replace(/^\/Users\/[^/]+/, "~");

/**
 * Claude's own context report, laid out like the Claude app's Context panel:
 * how full the window is, every category, and what is inside the MCP tools,
 * skills, agents, memory files and system tools rows.
 */
export function ContextDetailPanel({ detail }: { detail: ContextDetail }) {
  const inWindow = detail.categories.filter((c) => c.kind !== "deferred");
  const limit = inWindow.reduce((n, c) => n + c.tokens, 0);
  const used = inWindow.filter((c) => c.kind === "used").reduce((n, c) => n + c.tokens, 0);
  const rows = [...inWindow.filter((c) => c.tokens > 0 && c.kind === "used").sort((a, b) => b.tokens - a.tokens), ...inWindow.filter((c) => c.kind !== "used" && c.tokens > 0)];
  const deferred = detail.categories.filter((c) => c.kind === "deferred" && c.tokens > 0);

  const servers = new Map<string, ContextDetail["mcpTools"]>();
  for (const t of detail.mcpTools) servers.set(t.server, [...(servers.get(t.server) ?? []), t]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[15px] text-foreground">{limit ? Math.round((used / limit) * 100) : 0}% used</span>
          <span className="font-mono text-[12px] text-white/50 tabular">
            {fmtTokens(used)} / {fmtTokens(limit)}
          </span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${pct(used, limit)} of the context window used`}>
          {rows
            .filter((c) => c.kind !== "free")
            .map((c) => (
              <span key={c.id ?? c.name} title={`${c.name}: ${fmtTokens(c.tokens)}`} style={{ width: `${(c.tokens / Math.max(1, limit)) * 100}%`, background: colorOf(c) }} className="h-full border-r border-[var(--panel)] last:border-0" />
            ))}
        </div>
      </div>

      <table className="w-full text-[12.5px]">
        <tbody>
          {rows.map((c) => (
            <Row key={c.id ?? c.name} color={colorOf(c)} name={c.name} tokens={c.tokens} share={pct(c.tokens, limit)} dim={c.kind !== "used"} />
          ))}
          {deferred.map((c) => (
            <Row key={c.id ?? c.name} color="#444" name={c.name} tokens={c.tokens} share="—" dim title="Tool definitions loaded only when Claude needs them; not in the window" />
          ))}
        </tbody>
      </table>

      <div className="space-y-1 border-t border-white/[0.07] pt-3">
        <Group title="MCP tools" count={detail.mcpTools.length}>
          {[...servers.entries()].map(([server, tools]) => (
            <div key={server} className="mb-1.5">
              <p className="px-2 py-0.5 text-[11.5px] text-white/45">{server}</p>
              {tools.map((t) => (
                <Item key={t.name} name={t.name.split("__").slice(2).join("__") || t.name} meta={t.loaded === false ? "deferred" : undefined} tokens={t.tokens} />
              ))}
            </div>
          ))}
        </Group>
        <Group title="Skills" count={detail.skills.length}>
          {detail.skills.map((s) => (
            <Item key={`${s.plugin ?? ""}:${s.name}`} name={s.plugin ? `${s.plugin}:${s.name}` : s.name} meta={sourceLabel(s.source)} tokens={s.tokens} />
          ))}
        </Group>
        <Group title="Custom agents" count={detail.agents.length}>
          {detail.agents.map((a) => (
            <Item key={a.name} name={a.name} meta={sourceLabel(a.source)} tokens={a.tokens} />
          ))}
        </Group>
        <Group title="Memory files" count={detail.memoryFiles.length}>
          {detail.memoryFiles.map((f) => (
            <Item key={f.path} name={short(f.path)} meta={f.type} tokens={f.tokens} mono />
          ))}
        </Group>
        <Group title="System tools" count={detail.systemTools.length}>
          {detail.systemTools.map((t) => (
            <Item key={t.name} name={t.name} tokens={t.tokens} />
          ))}
        </Group>
      </div>
    </div>
  );
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = { userSettings: "User", projectSettings: "Project", localSettings: "Local", plugin: "Plugin", syncedSkills: "Claude", policySettings: "Policy" };
  return map[source] ?? source;
}

function Row({ color, name, tokens, share, dim, title }: { color: string; name: string; tokens: number; share: string; dim?: boolean; title?: string }) {
  return (
    <tr title={title}>
      <td className="w-4 py-1">
        <span className="block size-2.5 rounded-[3px]" style={{ background: color }} />
      </td>
      <td className={cn("py-1 pl-2", dim ? "text-white/45" : "text-white/80")}>{name}</td>
      <td className="py-1 text-right font-mono text-white/60 tabular">{fmtTokens(tokens)}</td>
      <td className="w-14 py-1 text-right font-mono text-white/45 tabular">{share}</td>
    </tr>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-[12.5px] text-white/75 hover:bg-white/[0.04]">
        <ChevronRight size={13} className={cn("text-white/40 transition-transform", open && "rotate-90")} />
        {title}
        <span className="ml-auto font-mono text-[11.5px] text-white/40 tabular">{count}</span>
      </button>
      {open && <div className="mb-1 ml-3 border-l border-white/[0.07] pl-1">{children}</div>}
    </div>
  );
}

function Item({ name, meta, tokens, mono }: { name: string; meta?: string; tokens: number; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 rounded px-2 py-0.5 text-[12px] hover:bg-white/[0.03]">
      <span className={cn("min-w-0 truncate text-white/75", mono && "font-mono text-[11.5px]")} title={name}>
        {name}
      </span>
      {meta && <span className="shrink-0 text-[11px] text-white/35">{meta}</span>}
      <span className="ml-auto shrink-0 font-mono text-[11px] text-white/40 tabular">{fmtTokens(tokens)}</span>
    </div>
  );
}
