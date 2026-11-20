import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { fmtTokens } from "@/components/visor/primitives";
import { useSession } from "@/stores/session-store";

const PAGE = 400;

/** "Straitjacket condensed 75.2k → 612 tokens · Full output" under a step. */
export function CondensedNote({ condensed, folder }: { condensed: { handle: string | null; originalTokens: number; digestTokens: number }; folder?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="pb-1 pl-[34px] text-[12.5px] text-emerald/85">
        Straitjacket condensed {fmtTokens(condensed.originalTokens)} → {fmtTokens(condensed.digestTokens)} tokens
        {condensed.handle && (
          <>
            {" · "}
            <button type="button" onClick={() => setOpen(true)} className="text-white/60 underline decoration-white/25 underline-offset-2 hover:text-foreground">
              Full output
            </button>
          </>
        )}
      </p>
      {open && condensed.handle && <FullOutput handle={condensed.handle} folder={folder} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The complete output Straitjacket stored, fetched a page at a time with `ctx get`. */
function FullOutput({ handle, folder, onClose }: { handle: string; folder?: string; onClose: () => void }) {
  const token = useSession((s) => s.token);
  const [from, setFrom] = useState(1);
  const [page, setPage] = useState<{ from: number; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const q = new URLSearchParams({ handle, from: String(from), to: String(from + PAGE - 1), ...(folder ? { path: folder } : {}) });
    fetch(`/api/ctx/output?${q}`, { headers: { authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const body = (await res.json()) as { text?: string; error?: string };
        if (!current) return;
        if (res.ok && typeof body.text === "string") {
          setError(null);
          setPage({ from, text: body.text });
        } else setError(body.error ?? "Couldn't load the output");
      })
      .catch(() => current && setError("Couldn't reach V.I.S.O.R."));
    return () => {
      current = false;
    };
  }, [handle, folder, from, token]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const lines = page?.text.split("\n").length ?? 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Full output" onMouseDown={(e) => e.stopPropagation()} className="flex h-[min(720px,90vh)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/[0.09] bg-[var(--popover)] shadow-2xl shadow-black/50">
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
          <h2 className="text-[14px] font-semibold text-foreground">Full output</h2>
          <code className="font-mono text-[11.5px] text-white/45">{handle}</code>
          <span className="ml-auto font-mono text-[11.5px] text-white/45">lines {from}–{from + PAGE - 1}</span>
          <button type="button" aria-label="Earlier lines" disabled={from === 1} onClick={() => setFrom((f) => Math.max(1, f - PAGE))} className="rounded-md p-1 text-white/55 hover:bg-white/[0.07] disabled:opacity-30">
            <ChevronLeft size={15} />
          </button>
          <button type="button" aria-label="Later lines" disabled={!page || lines < PAGE / 2} onClick={() => setFrom((f) => f + PAGE)} className="rounded-md p-1 text-white/55 hover:bg-white/[0.07] disabled:opacity-30">
            <ChevronRight size={15} />
          </button>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1 text-white/55 hover:bg-white/[0.07]">
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {error ? <p className="text-[13px] text-rose/90">{error}</p> : <pre className="whitespace-pre font-mono text-[12px] leading-relaxed text-white/80">{page?.text ?? "Loading…"}</pre>}
        </div>
        <p className="border-t border-white/[0.07] px-4 py-2 text-[11.5px] text-white/40">Stored by Straitjacket. Claude saw a short digest and can fetch any part of this with ctx get or ctx search.</p>
      </div>
    </div>
  );
}
