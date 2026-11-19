import { AlertTriangle, Bell, Download } from "lucide-react";
import { formatUsd } from "@shared/money";
import { BUILT_IN_RULES } from "@server/interceptor/policy";
import { CostReceipt } from "@/components/visor/cost-receipt";
import { SPAN_LABEL, StatusDot, Usd, fmtMs } from "@/components/visor/primitives";
import { MCP_SERVERS } from "@/lib/mock-data";
import { useEffect } from "react";
import { useNotificationPref } from "@/hooks/use-notifications";
import { useSession } from "@/stores/session-store";
import { LedgerTable } from "./wallet-dialog";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";

// Full-page views opened from the sidebar: rules & audit, MCP health, ledger.

export function RulesView({ model, onSelect }: { model: TraceModel; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-8">
      <Header title="Overrides & rules" body="Built-in protections run in the PreToolUse hook before any allow rule. Add your own rules and triggers in .visor.json." />
      <PauseSwitches />
      <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
        <table className="w-full text-[13px]">
          <thead className="bg-white/[0.03] text-left text-[11.5px] text-white/45">
            <tr>
              <th className="px-4 py-2 font-normal">Rule</th>
              <th className="px-4 py-2 font-normal">Tool</th>
              <th className="px-4 py-2 font-normal">Action</th>
            </tr>
          </thead>
          <tbody>
            {BUILT_IN_RULES.map((r) => (
              <tr key={r.rule} className="border-t border-white/[0.06]">
                <td className="px-4 py-2.5 font-mono text-[12.5px]">{r.rule}</td>
                <td className="px-4 py-2.5 text-white/60">{r.tool}</td>
                <td className={cn("px-4 py-2.5", r.action === "block" ? "text-rose" : "text-amber")}>{r.action === "block" ? "Block" : "Pause for approval"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <OverridesPane model={model} onSelect={onSelect} />
      <AuditLog />
    </div>
  );
}

function Switch({ on, onChange, label, hint, disabled }: { on: boolean; onChange: () => void; label: string; hint: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onChange} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-white/[0.02] disabled:opacity-50">
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px]">{label}</span>
        <span className="block text-[12px] text-white/45">{hint}</span>
      </span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-indigo" : "bg-white/[0.12]")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-[left]", on ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

function PauseSwitches() {
  const toggles = useSession((s) => s.toggles);
  const setToggles = useSession((s) => s.setToggles);
  const notify = useNotificationPref();
  if (!toggles) return null;
  return (
    <div>
      <p className="mb-2 text-[12.5px] text-white/45">Pause before…</p>
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08]">
        <Switch on={toggles.bash} onChange={() => void setToggles({ bash: !toggles.bash })} label="Shell commands" hint="Every Bash call waits for Approve / Edit JSON / Deny" />
        <Switch on={toggles.edits} onChange={() => void setToggles({ edits: !toggles.edits })} label="File edits" hint="Edit, MultiEdit, Write and notebook edits" />
        <Switch on={toggles.mcpWrites} onChange={() => void setToggles({ mcpWrites: !toggles.mcpWrites })} label="MCP writes" hint="MCP tools that create, update, delete or send" />
        <Switch
          on={notify.on}
          onChange={() => void notify.toggle()}
          disabled={!notify.supported || notify.denied}
          label="Desktop notifications"
          hint={notify.denied ? "Blocked in this browser's site settings" : "Notify when a run pauses or an alert fires while you're in another window"}
        />
      </div>
      <p className="mt-2 text-[12px] text-white/40">Secrets stay blocked and destructive commands still pause whatever these are set to.</p>
    </div>
  );
}

const DECISION_TONE = { approved: "text-emerald", edited: "text-amber", denied: "text-rose", auto_blocked: "text-rose" } as const;

function AuditLog() {
  const audit = useSession((s) => s.audit);
  const refresh = useSession((s) => s.refreshAudit);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <div>
      <p className="mb-2 text-[12.5px] text-white/45">Audit log · every session</p>
      {audit.length === 0 ? (
        <p className="text-[13px] text-white/40">No decisions recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
          {audit.map((a) => {
            const edited = a.decision === "edited" && a.finalInputJson;
            return (
              <div key={a.id} className="border-t border-white/[0.06] px-4 py-2.5 first:border-t-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                  <span className={cn("font-medium capitalize", DECISION_TONE[a.decision])}>{a.decision.replace("_", " ")}</span>
                  <span className="text-foreground">{a.toolName}</span>
                  <span className="font-mono text-[11.5px] text-white/45">{a.matchedRule}</span>
                  <span className="ml-auto truncate text-[11.5px] text-white/40">
                    {a.sessionTitle ?? a.sessionId} · {new Date(a.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {a.operatorNote && <p className="mt-1 text-[12px] text-white/55">“{a.operatorNote}”</p>}
                {edited && (
                  <p className="mt-1 truncate font-mono text-[11.5px]">
                    <span className="text-rose/80 line-through">{a.originalInputJson}</span> <span className="text-white/35">→</span> <span className="text-emerald/90">{a.finalInputJson}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function McpView() {
  return (
    <div className="space-y-6">
      <Header title="MCP servers" body="Servers connected for this workspace, from .visor.json." />
      <div className="grid gap-3 sm:grid-cols-3">
        {MCP_SERVERS.map((m) => (
          <div key={m.name} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <span className="flex items-center gap-2 text-[14px]">
              <i className={cn("size-2 rounded-full", m.online ? "bg-emerald" : "bg-rose")} /> {m.name}
            </span>
            <span className="mt-1 block font-mono text-[12px] text-white/45">{m.online ? `${m.tools} tools · online` : "offline · connection refused"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LedgerView({ model, onOpenWallet }: { model: TraceModel; onOpenWallet: () => void }) {
  const wallet = useSession((s) => s.wallet);
  const exportLedger = useSession((s) => s.exportLedger);
  const top = Object.values(model.spans)
    .filter((s) => s.costMicroUsd > 0)
    .sort((a, b) => b.costMicroUsd - a.costMicroUsd)
    .slice(0, 5);
  return (
    <div className="space-y-8">
      <Header title="Credit ledger" body="Prepaid credit and every live session's debit, in integer micro-dollars. Differences from the SDK's own total are booked as adjustments." />
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[28px] font-medium tabular">{formatUsd(wallet?.balanceMicroUsd ?? 0, 2)}</span>
        <span className="text-[13px] text-white/45">{wallet?.active ? "credit left" : "no credit set"}</span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={onOpenWallet} className="rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-[var(--primary-foreground)]">
            Add or set credit
          </button>
          <button type="button" onClick={() => void exportLedger()} className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-1.5 text-[13px] text-white/70 hover:text-foreground">
            <Download size={13} /> Export CSV
          </button>
        </span>
      </div>
      <LedgerTable entries={wallet?.entries ?? []} />
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-[12.5px] text-white/45">This session&apos;s receipt</p>
          <CostReceipt model={model} />
        </div>
        <div>
          <p className="mb-3 text-[12.5px] text-white/45">Most expensive steps</p>
          {top.length === 0 && <p className="text-[13px] text-white/40">Nothing spent yet.</p>}
          {top.map((s) => (
            <div key={s.spanId} className="flex items-center gap-2 py-1 text-[12.5px]">
              <span className="truncate text-white/65">
                {SPAN_LABEL[s.spanType]} · turn {model.turns.findIndex((t) => t.turnId === s.turnId) + 1}
              </span>
              <span className="relative ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="absolute inset-y-0 left-0 bg-emerald/70" style={{ width: `${(s.costMicroUsd / (top[0]?.costMicroUsd || 1)) * 100}%` }} />
              </span>
              <Usd micro={s.costMicroUsd} className="w-16 text-right font-mono text-emerald/90" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Header({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-[22px] font-medium tracking-tight">{title}</h2>
      <p className="mt-1.5 text-[14px] text-white/55">{body}</p>
    </div>
  );
}

function OverridesPane({ model, onSelect }: { model: TraceModel; onSelect: (id: string) => void }) {
  const overrides = Object.values(model.spans).filter((s) => s.breakpoint);
  const mcp = Object.values(model.spans).filter((s) => s.spanType === "mcp");
  return (
    <div className="grid gap-6 p-4 xl:grid-cols-2">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[12px] text-faint">
          <Bell size={12} /> Trigger & alert feed
        </p>
        <ul className="space-y-1.5">
          {model.alerts.length === 0 && <li className="text-[12.5px] text-faint">No alerts yet.</li>}
          {[...model.alerts].reverse().map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => a.spanId && onSelect(a.spanId)} className="flex w-full items-start gap-2 rounded-lg border border-border px-3 py-2 text-left text-[12.5px] hover:bg-white/[0.03]">
                <AlertTriangle size={13} className={cn("mt-0.5 shrink-0", a.level === "danger" ? "text-rose" : a.level === "warning" ? "text-amber" : "text-indigo")} />
                <span className="min-w-0">
                  <span className="block text-foreground">{a.title}</span>
                  <span className="block truncate text-faint">{a.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mb-2 mt-6 text-[12px] text-faint">This session&apos;s overrides</p>
        {overrides.length === 0 && <p className="text-[12.5px] text-faint">No overrides yet.</p>}
        {overrides.map((s) => (
          <div key={s.spanId} className="mb-1.5 flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 font-mono text-[11.5px]">
            <span className="text-foreground">{s.breakpoint!.toolName}</span>
            <span className="text-faint">{s.breakpoint!.rule}</span>
            <span className={cn("ml-auto", !s.breakpoint!.decision ? "text-amber" : s.breakpoint!.decision === "approved" ? "text-emerald" : s.breakpoint!.decision === "edited" ? "text-amber" : "text-rose")}>
              {s.breakpoint!.decision ?? "paused"}
            </span>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-2 text-[12px] text-faint">MCP servers</p>
        <div className="mb-6 grid grid-cols-3 gap-2">
          {MCP_SERVERS.map((m) => (
            <div key={m.name} className="rounded-lg border border-border px-3 py-2">
              <span className="flex items-center gap-1.5 text-[12.5px]">
                <i className={cn("size-1.5 rounded-full", m.online ? "bg-emerald" : "bg-rose")} /> {m.name}
              </span>
              <span className="font-mono text-[11px] text-faint">{m.online ? `${m.tools} tools` : "offline"}</span>
            </div>
          ))}
        </div>
        <p className="mb-2 text-[12px] text-faint">MCP JSON-RPC calls</p>
        {mcp.length === 0 && <p className="text-[12.5px] text-faint">No MCP calls yet.</p>}
        {mcp.map((s) => (
          <button key={s.spanId} type="button" onClick={() => onSelect(s.spanId)} className="mb-1.5 flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-[12.5px] hover:bg-white/[0.03]">
            <StatusDot status={s.status} /> <span className="font-mono">{s.name}</span>
            <span className="ml-auto font-mono text-[11px] text-faint">{fmtMs(s.endedAt ? s.endedAt - s.startedAt : undefined)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
