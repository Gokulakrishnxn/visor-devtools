import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Check, ShieldAlert, X } from "lucide-react";
import { checkToolInput } from "@shared/tool-inputs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSession } from "@/stores/session-store";
import { useUi } from "@/stores/ui-store";
import { JsonEditor } from "./json-editor";
import { JsonView } from "./code";
import { Kbd } from "./primitives";

export type PausedCall = { spanId: string; toolName: string; rule: string; input: unknown };

/** Field-level differences between the original and the edited payload. */
function payloadDiff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ key: k, before: before[k], after: after[k] }));
}

/**
 * The override breakpoint: Approve, Edit JSON (CodeMirror + live Zod
 * validation), or Deny with steering. `variant` only changes the chrome so
 * each design can place it differently (inline card, floating dock, banner).
 */
export function BreakpointCard({ paused, variant = "inline", showDiff = false }: { paused: PausedCall; variant?: "inline" | "dock" | "banner"; showDiff?: boolean }) {
  const resolve = useSession((s) => s.resolve);
  const editing = useUi((s) => s.editing);
  const setEditing = useUi((s) => s.setEditing);
  const original = (paused.input ?? {}) as Record<string, unknown>;
  const [text, setText] = useState(() => JSON.stringify(original, null, 2));
  const [note, setNote] = useState("");
  const denying = useUi((s) => s.denying);
  const setDenying = useUi((s) => s.setDenying);
  const check = useMemo(() => checkToolInput(paused.toolName, text), [paused.toolName, text]);
  const changes = check.ok ? payloadDiff(original, check.value) : [];

  const sendEdit = () => {
    if (!check.ok) return;
    void resolve({ decision: "edited", input: check.value });
    setEditing(false);
  };
  const deny = () => {
    void resolve({ decision: "denied", note: note.trim() || undefined });
    setDenying(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "rounded-xl border border-amber/30 bg-[color-mix(in_srgb,var(--amber)_6%,var(--card))] p-4",
        variant === "dock" && "shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl",
        variant === "banner" && "rounded-none border-x-0 border-t-0 bg-amber/[0.06]",
      )}
      role="alertdialog"
      aria-label={`Paused before ${paused.toolName}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <ShieldAlert size={15} className="text-amber" />
        <span className="font-medium text-amber">Paused before {paused.toolName}</span>
        <span className="rounded-md bg-amber/10 px-1.5 py-0.5 font-mono text-[11px] text-amber/90">{paused.rule}</span>
        <span className="ml-auto text-[11px] text-faint">Execution is frozen until you decide</span>
      </div>

      <div className={cn("mt-3", showDiff && editing && "grid gap-3 lg:grid-cols-2")}>
        {(!editing || showDiff) && (
          <div className="rounded-lg bg-code px-3 py-2">
            {showDiff && editing && <p className="mb-1 text-[11px] text-faint">Original</p>}
            <JsonView value={original} />
          </div>
        )}
        {editing && (
          <div>
            {showDiff && <p className="mb-1 text-[11px] text-faint">Edited</p>}
            <JsonEditor value={text} onChange={setText} onSubmit={sendEdit} />
            <div className="mt-2 min-h-5 text-[12px]">
              {check.ok ? (
                <span className="flex items-center gap-1.5 text-emerald">
                  <Check size={13} /> Valid {paused.toolName} input
                  {changes.length > 0 && <span className="text-faint">· {changes.length} field{changes.length > 1 ? "s" : ""} changed</span>}
                </span>
              ) : (
                <span className="flex items-start gap-1.5 text-rose">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {check.errors[0]}
                </span>
              )}
            </div>
            {showDiff && changes.length > 0 && (
              <div className="mt-2 space-y-1 rounded-lg bg-code p-2 font-mono text-[11.5px]">
                {changes.map((c) => (
                  <div key={c.key}>
                    <span className="text-faint">{c.key}: </span>
                    <span className="text-rose line-through decoration-rose/60">{JSON.stringify(c.before)}</span>
                    <span className="text-faint"> → </span>
                    <span className="text-emerald">{JSON.stringify(c.after)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {denying && (
        <input
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") deny();
            if (e.key === "Escape") setDenying(false);
          }}
          placeholder="Steering for Claude, e.g. “Push to a branch instead.” (Enter to send)"
          className="mt-3 h-9 w-full rounded-lg border border-rose/30 bg-code px-3 text-[13px] outline-none placeholder:text-faint focus:border-rose/60"
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Button size="sm" variant="approve" disabled={!check.ok} onClick={sendEdit}>
              Send edited call <Kbd className="border-emerald/20 text-emerald/70">⌘↵</Kbd>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X /> Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="approve" onClick={() => void resolve({ decision: "approved" })}>
              Approve <Kbd className="border-emerald/20 text-emerald/70">A</Kbd>
            </Button>
            <Button size="sm" variant="edit" onClick={() => setEditing(true)}>
              Edit JSON <Kbd>E</Kbd>
            </Button>
            <Button size="sm" variant="deny" onClick={() => (denying ? deny() : setDenying(true))}>
              {denying ? "Send denial" : "Deny"} <Kbd className="border-rose/20 text-rose/70">D</Kbd>
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}
