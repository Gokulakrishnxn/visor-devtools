import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, Wallet as WalletIcon, X } from "lucide-react";
import { formatUsd } from "@shared/money";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";
import { useSession, type LedgerEntry } from "@/stores/session-store";
import { LimitsPanel } from "./limits-panel";

const TYPE_TONE: Record<LedgerEntry["entryType"], string> = {
  deposit: "text-emerald",
  debit: "text-foreground",
  adjustment: "text-amber",
};

function when(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** The ledger table, shared by the dialog and the Credit ledger page. */
export function LedgerTable({ entries, limit }: { entries: LedgerEntry[]; limit?: number }) {
  const rows = limit ? entries.slice(0, limit) : entries;
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-white/40">No ledger entries yet.</p>;
  return (
    <table className="w-full text-[12.5px]">
      <thead className="text-left text-[11px] text-white/40">
        <tr>
          <th className="py-1.5 pr-3 font-normal">When</th>
          <th className="py-1.5 pr-3 font-normal">What</th>
          <th className="py-1.5 pr-3 text-right font-normal">Amount</th>
          <th className="py-1.5 text-right font-normal">Balance</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-white/[0.06] align-top">
            <td className="whitespace-nowrap py-2 pr-3 text-white/45 tabular">{when(r.createdAt)}</td>
            <td className="py-2 pr-3">
              <span className="block max-w-[260px] truncate text-white/80" title={r.note ?? ""}>
                {r.note || r.entryType}
              </span>
              <span className={cn("text-[11px] capitalize", TYPE_TONE[r.entryType])}>{r.entryType}</span>
            </td>
            <td className={cn("whitespace-nowrap py-2 pr-3 text-right font-mono tabular", r.amountMicroUsd > 0 ? "text-emerald" : "text-foreground")}>
              {r.amountMicroUsd > 0 ? "+" : ""}
              {formatUsd(r.amountMicroUsd)}
            </td>
            <td className="whitespace-nowrap py-2 text-right font-mono text-white/55 tabular">{formatUsd(r.balanceAfterMicroUsd, 2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Prepaid credit: balance, add or set credit, history and CSV export. */
export function WalletDialog({ open, onClose, model }: { open: boolean; onClose: () => void; model: TraceModel }) {
  const wallet = useSession((s) => s.wallet);
  const info = useSession((s) => s.info);
  const change = useSession((s) => s.changeWallet);
  const exportLedger = useSession((s) => s.exportLedger);
  const refresh = useSession((s) => s.refreshWallet);
  const [mode, setMode] = useState<"deposit" | "set">("deposit");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = info?.runtime === "claude";
  const running = model.session && (model.session.status === "running" || model.session.status === "paused");
  // A live run in progress is spending credit that isn't debited yet
  const pending = live && running ? model.cost.total : 0;
  const balance = (wallet?.balanceMicroUsd ?? 0) - pending;

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const submit = async () => {
    if (!amount.trim()) return;
    setBusy(true);
    const err = await change(mode, amount);
    setBusy(false);
    setError(err);
    if (!err) setAmount("");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-start justify-center bg-black/55 p-4 pt-[10vh]" onClick={onClose}>
          <motion.div
            initial={{ y: 12, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Credit wallet"
            className="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-popover shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-3.5">
              <WalletIcon size={16} className="text-white/55" />
              <span className="text-[14px] font-medium">Credit wallet</span>
              <button type="button" aria-label="Close" onClick={onClose} className="ml-auto rounded-md p-1 text-white/45 hover:bg-white/[0.08] hover:text-foreground">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 pt-5">
              <p className="text-[12px] text-white/45">{wallet?.active ? "Credit left" : "No credit set yet"}</p>
              <p className="mt-1 font-mono text-[34px] font-medium leading-none tracking-tight tabular">{formatUsd(Math.max(0, balance), 2)}</p>
              <p className="mt-2 text-[12.5px] text-white/50">
                {!live
                  ? "Mock runs are free and never use credit. Credit applies to live runs (--live)."
                  : !wallet?.active
                    ? "Set credit to cap live runs at what you've put in. Without it, only the per-session cap applies."
                    : pending > 0
                      ? `Includes ${formatUsd(pending)} being spent by the run in progress.`
                      : "Live runs can't spend more than this; the cap shrinks to fit."}
              </p>
            </div>

            <div className="px-5 pt-4">
              <div className="flex gap-2">
                <div className="flex rounded-lg bg-white/[0.05] p-0.5 text-[12.5px]">
                  {(["deposit", "set"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)} className={cn("rounded-md px-2.5 py-1", mode === m ? "bg-white/[0.1] text-foreground" : "text-white/50")}>
                      {m === "deposit" ? "Add credit" : "Set balance"}
                    </button>
                  ))}
                </div>
                <label className="flex flex-1 items-center gap-1 rounded-lg border border-white/[0.1] bg-code px-2.5 font-mono text-[13px] focus-within:border-[var(--ring)]">
                  <span className="text-white/40">$</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void submit()}
                    inputMode="decimal"
                    placeholder={mode === "deposit" ? "20.00" : "15.00"}
                    aria-label="Amount in dollars"
                    className="h-8 w-full bg-transparent outline-none placeholder:text-white/25"
                  />
                </label>
                <button type="button" disabled={busy || !amount.trim()} onClick={() => void submit()} className="rounded-lg bg-foreground px-3 text-[13px] font-medium text-[var(--primary-foreground)] disabled:opacity-40">
                  {mode === "deposit" ? "Add" : "Set"}
                </button>
              </div>
              {error && <p className="mt-2 text-[12.5px] text-rose">{error}</p>}
            </div>

            <LimitsPanel />

            <div className="mt-5 flex items-center border-t border-white/[0.07] px-5 pt-3">
              <span className="text-[12px] text-white/45">History</span>
              <button type="button" onClick={() => void exportLedger()} className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-foreground">
                <Download size={13} /> Export CSV
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
              <LedgerTable entries={wallet?.entries ?? []} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
