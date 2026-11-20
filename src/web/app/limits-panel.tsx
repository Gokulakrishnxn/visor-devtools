import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { formatUsd, parseUsd } from "@shared/money";
import { fmtTokens } from "@/components/visor/primitives";
import { parseTokens } from "@/lib/limits-format";
import { cn } from "@/lib/utils";
import { useSession } from "@/stores/session-store";

type Limits = { messageTokens: number | null; dailyTokens: number | null; dailyMicroUsd: number | null };
type Today = { tokens: number; spentMicroUsd: number };

const tokenText = (n: number | null) => (n === null ? "" : String(n));
const usdText = (n: number | null) => (n === null ? "" : (n / 1_000_000).toString());

/**
 * Your limits, in the wallet: tokens per message, tokens per day and spending
 * per day, with today's usage. Counted tokens are input, cache writes and
 * output (cache reads of earlier context are left out).
 */
export function LimitsPanel() {
  const token = useSession((s) => s.token);
  const [saved, setSaved] = useState<Limits | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [form, setForm] = useState({ messageTokens: "", dailyTokens: "", dailyUsd: "" });
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    fetch("/api/limits", { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json() as Promise<{ limits: Limits | null; today: Today | null }>)
      .then((b) => {
        if (!current || !b.limits) return;
        setSaved(b.limits);
        setToday(b.today);
        setForm({ messageTokens: tokenText(b.limits.messageTokens), dailyTokens: tokenText(b.limits.dailyTokens), dailyUsd: usdText(b.limits.dailyMicroUsd) });
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [token]);

  if (!saved) return null;

  const messageTokens = parseTokens(form.messageTokens);
  const dailyTokens = parseTokens(form.dailyTokens);
  let dailyMicroUsd: number | null | undefined = null;
  if (form.dailyUsd.trim()) {
    try {
      const v = parseUsd(form.dailyUsd.trim().replace(/^\$/, ""));
      dailyMicroUsd = v > 0 ? v : undefined;
    } catch {
      dailyMicroUsd = undefined;
    }
  }
  const valid = messageTokens !== undefined && dailyTokens !== undefined && dailyMicroUsd !== undefined;
  const changed = valid && (messageTokens !== saved.messageTokens || dailyTokens !== saved.dailyTokens || dailyMicroUsd !== saved.dailyMicroUsd);

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/limits", {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageTokens, dailyTokens, dailyMicroUsd }),
      });
      const b = (await res.json()) as { limits?: Limits; today?: Today; error?: string };
      if (!res.ok || !b.limits) throw new Error(b.error ?? "Couldn't save");
      setSaved(b.limits);
      if (b.today) setToday(b.today);
      setNote({ ok: true, text: "Limits saved" });
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 border-t border-white/[0.07] px-5 pt-4">
      <div className="flex items-center gap-1.5 text-[12px] text-white/45">
        <Gauge size={13} /> Limits
        <span className="ml-auto text-[11px] text-white/30">empty = no limit</span>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <Field label="Tokens per message" placeholder="200k" value={form.messageTokens} bad={messageTokens === undefined} onChange={(v) => setForm((f) => ({ ...f, messageTokens: v }))} />
        <Field label="Tokens per day" placeholder="2m" value={form.dailyTokens} bad={dailyTokens === undefined} onChange={(v) => setForm((f) => ({ ...f, dailyTokens: v }))} />
        <Field label="Spend per day" placeholder="1.00" prefix="$" value={form.dailyUsd} bad={dailyMicroUsd === undefined} onChange={(v) => setForm((f) => ({ ...f, dailyUsd: v }))} />
      </div>
      {today && (
        <div className="mt-3 space-y-2">
          <Usage label="Tokens today" used={today.tokens} limit={saved.dailyTokens} show={(n) => fmtTokens(n)} />
          <Usage label="Spent today" used={today.spentMicroUsd} limit={saved.dailyMicroUsd} show={(n) => formatUsd(n, 2)} />
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <p className={cn("min-w-0 flex-1 text-[11.5px]", note ? (note.ok ? "text-emerald/90" : "text-rose") : "text-white/35")}>
          {note?.text ?? (valid ? "Tokens counted: input, cache writes and output. Resets at midnight." : "Use a number like 200000, 200k or 1.5m.")}
        </p>
        <button type="button" disabled={!changed || busy} onClick={() => void save()} className="h-8 rounded-lg bg-foreground px-3 text-[12.5px] font-medium text-[var(--primary-foreground)] disabled:opacity-35">
          Save limits
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, placeholder, prefix, bad, onChange }: { label: string; value: string; placeholder: string; prefix?: string; bad: boolean; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] text-white/50">{label}</span>
      <span className={cn("flex items-center gap-1 rounded-lg border bg-code px-2 font-mono text-[12.5px] focus-within:border-[var(--ring)]", bad ? "border-rose/60" : "border-white/[0.1]")}>
        {prefix && <span className="text-white/40">{prefix}</span>}
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} aria-invalid={bad} inputMode="decimal" className="h-8 w-full min-w-0 bg-transparent outline-none placeholder:text-white/20" />
      </span>
    </label>
  );
}

function Usage({ label, used, limit, show }: { label: string; used: number; limit: number | null; show: (n: number) => string }) {
  const share = limit ? Math.min(1, used / limit) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11.5px]">
        <span className="text-white/50">{label}</span>
        <span className="font-mono text-white/60 tabular">
          {show(used)}
          {limit !== null && <span className="text-white/35"> / {show(limit)}</span>}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.07]">
          <div className={cn("h-full rounded-full", share >= 1 ? "bg-rose" : share >= 0.8 ? "bg-amber" : "bg-emerald")} style={{ width: `${share * 100}%` }} />
        </div>
      )}
    </div>
  );
}
