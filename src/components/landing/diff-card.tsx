import { X, Columns2 } from "lucide-react";
import { tokenLines } from "@/lib/highlight";

type Line = { kind: " " | "+" | "-"; old?: number; new?: number; code: string };

const LINES: Line[] = [
  { kind: " ", old: 41, new: 41, code: "export async function getSession(req: Request) {" },
  { kind: " ", old: 42, new: 42, code: "  const token = readToken(req);" },
  { kind: "-", old: 43, code: "  refreshToken(token);" },
  { kind: "-", old: 44, code: "  return sessions.get(token.id);" },
  { kind: "+", new: 43, code: "  const fresh = await refreshToken(token);" },
  { kind: "+", new: 44, code: "  if (!fresh) throw new AuthError(\"expired\");" },
  { kind: "+", new: 45, code: "  return sessions.get(fresh.id);" },
  { kind: " ", old: 45, new: 46, code: "}" },
];

const ROW: Record<Line["kind"], string> = {
  " ": "",
  "+": "bg-emerald/[0.09] shadow-[inset_2px_0_0_var(--emerald)]",
  "-": "bg-rose/[0.09] shadow-[inset_2px_0_0_var(--rose)]",
};

/** Server-rendered Shiki diff, the way V.I.S.O.R. shows an Edit span. */
export async function DiffCard() {
  const tokens = await tokenLines(LINES.map((l) => l.code).join("\n"), "ts");
  return (
    <div className="overflow-hidden rounded-xl border border-line-strong bg-[#0d1117] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[13px]">
        <span className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1 text-fg">
          Review · turn 3 <X size={12} className="text-fg-faint" />
        </span>
        <span className="truncate font-mono text-[12px] text-fg-muted">src/auth/session.ts</span>
        <span className="ml-auto font-mono text-[12px] tabular">
          <span className="text-emerald">+3</span> <span className="text-rose">−2</span>
        </span>
        <Columns2 size={14} className="hidden text-fg-faint sm:block" />
      </div>
      <div className="overflow-x-auto py-2 font-mono text-[12px] leading-[22px]">
        <div className="px-4 text-fg-faint">@@ -41,5 +41,6 @@</div>
        {LINES.map((l, i) => (
          <div key={i} className={`flex min-w-max pr-4 ${ROW[l.kind]}`}>
            <span className="w-9 shrink-0 select-none pr-2 text-right text-fg-faint tabular">{l.old ?? ""}</span>
            <span className="w-9 shrink-0 select-none pr-2 text-right text-fg-faint tabular">{l.new ?? ""}</span>
            <span className={`w-5 shrink-0 select-none ${l.kind === "+" ? "text-emerald" : l.kind === "-" ? "text-rose" : "text-fg-faint"}`}>
              {l.kind === " " ? "" : l.kind}
            </span>
            <span>
              {tokens[i]?.map((t, j) => (
                <span key={j} style={{ color: t.color }}>
                  {t.content}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
