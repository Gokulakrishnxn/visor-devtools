import { useMemo } from "react";
import { langFor, useTokens, type TokenLine } from "@/lib/shiki";
import { cn } from "@/lib/utils";

function Tokens({ line, fallback }: { line?: TokenLine; fallback: string }) {
  if (!line) return <>{fallback || " "}</>;
  return (
    <>
      {line.length === 0 ? " " : line.map((t, i) => (
        <span key={i} style={{ color: t.color }}>
          {t.content}
        </span>
      ))}
    </>
  );
}

/** Read-only, syntax-highlighted file view with line numbers. */
export function CodeView({ code, path, maxLines, className }: { code: string; path?: string; maxLines?: number; className?: string }) {
  const lines = code.split("\n");
  const shown = maxLines ? lines.slice(0, maxLines) : lines;
  const tokens = useTokens(shown.join("\n"), langFor(path));
  return (
    <pre className={cn("overflow-x-auto py-2 font-mono text-[12px] leading-[20px]", className)}>
      {shown.map((l, i) => (
        <div key={i} className="flex min-w-max pr-4">
          <span className="w-10 shrink-0 select-none pr-3 text-right text-faint tabular">{i + 1}</span>
          <span>
            <Tokens line={tokens?.[i]} fallback={l} />
          </span>
        </div>
      ))}
      {maxLines && lines.length > maxLines && <div className="pl-10 text-faint">… {lines.length - maxLines} more lines</div>}
    </pre>
  );
}

type DiffLine = { kind: " " | "+" | "-" | "@"; text: string; old?: number; new?: number };

export function parseDiff(diff: string): DiffLine[] {
  const out: DiffLine[] = [];
  let o = 0;
  let n = 0;
  for (const raw of diff.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(raw);
    if (hunk) {
      o = Number(hunk[1]);
      n = Number(hunk[2]);
      out.push({ kind: "@", text: raw });
      continue;
    }
    const kind = (raw[0] === "+" || raw[0] === "-" ? raw[0] : " ") as DiffLine["kind"];
    const text = raw.slice(1);
    if (kind === "+") out.push({ kind, text, new: n++ });
    else if (kind === "-") out.push({ kind, text, old: o++ });
    else out.push({ kind, text, old: o++, new: n++ });
  }
  return out;
}

export function diffStats(diff: string) {
  const lines = parseDiff(diff);
  return { added: lines.filter((l) => l.kind === "+").length, removed: lines.filter((l) => l.kind === "-").length };
}

const ROW = {
  "+": "bg-emerald/[0.09] shadow-[inset_2px_0_0_var(--emerald)]",
  "-": "bg-rose/[0.09] shadow-[inset_2px_0_0_var(--rose)]",
  " ": "",
  "@": "",
};

/** Shiki-highlighted unified or side-by-side diff. */
export function DiffView({ diff, path, mode = "unified", className }: { diff: string; path?: string; mode?: "unified" | "split"; className?: string }) {
  const lines = useMemo(() => parseDiff(diff), [diff]);
  const code = lines.filter((l) => l.kind !== "@").map((l) => l.text);
  const tokens = useTokens(code.join("\n"), langFor(path));
  let k = -1;
  type Row = DiffLine & { tok?: TokenLine };
  const withTokens: Row[] = lines.map((l) => (l.kind === "@" ? { ...l } : { ...l, tok: tokens?.[++k] }));

  if (mode === "split") {
    // Pair removed/added runs side by side; context lines appear on both sides.
    const left: Row[] = [];
    const right: Row[] = [];
    let dels: Row[] = [];
    let adds: Row[] = [];
    const flush = () => {
      const len = Math.max(dels.length, adds.length);
      for (let i = 0; i < len; i++) {
        left.push(dels[i] ?? { kind: " ", text: "" });
        right.push(adds[i] ?? { kind: " ", text: "" });
      }
      dels = [];
      adds = [];
    };
    for (const l of withTokens) {
      if (l.kind === "-") dels.push(l);
      else if (l.kind === "+") adds.push(l);
      else {
        flush();
        if (l.kind !== "@") {
          left.push(l);
          right.push(l);
        }
      }
    }
    flush();
    const side = (rows: Row[], num: "old" | "new") => (
      <div className="min-w-0 overflow-x-auto">
        {rows.map((l, i) => (
          <div key={i} className={cn("flex min-w-max pr-3", ROW[l.kind])}>
            <span className="w-9 shrink-0 select-none pr-2 text-right text-faint tabular">{l[num] ?? ""}</span>
            <span>
              <Tokens line={l.tok} fallback={l.text} />
            </span>
          </div>
        ))}
      </div>
    );
    return (
      <div className={cn("grid grid-cols-2 divide-x divide-border py-2 font-mono text-[12px] leading-[22px]", className)}>
        {side(left, "old")}
        {side(right, "new")}
      </div>
    );
  }

  return (
    <div className={cn("overflow-x-auto py-2 font-mono text-[12px] leading-[22px]", className)}>
      {withTokens.map((l, i) =>
        l.kind === "@" ? (
          <div key={i} className="px-4 text-faint">
            {l.text}
          </div>
        ) : (
          <div key={i} className={cn("flex min-w-max pr-4", ROW[l.kind])}>
            <span className="w-9 shrink-0 select-none pr-2 text-right text-faint tabular">{l.old ?? ""}</span>
            <span className="w-9 shrink-0 select-none pr-2 text-right text-faint tabular">{l.new ?? ""}</span>
            <span className={cn("w-4 shrink-0 select-none", l.kind === "+" ? "text-emerald" : l.kind === "-" ? "text-rose" : "")}>
              {l.kind === " " ? "" : l.kind}
            </span>
            <span>
              <Tokens line={l.tok} fallback={l.text} />
            </span>
          </div>
        ),
      )}
    </div>
  );
}

/** Pretty JSON with Shiki highlighting. */
export function JsonView({ value, className }: { value: unknown; className?: string }) {
  const text = JSON.stringify(value, null, 2) ?? "undefined";
  const tokens = useTokens(text, "json");
  return (
    <pre className={cn("overflow-x-auto font-mono text-[12px] leading-[20px]", className)}>
      {text.split("\n").map((l, i) => (
        <div key={i}>
          <Tokens line={tokens?.[i]} fallback={l} />
        </div>
      ))}
    </pre>
  );
}
