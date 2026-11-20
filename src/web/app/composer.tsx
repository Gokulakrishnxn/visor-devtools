import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, Plus, ShieldCheck, Square } from "lucide-react";
import { Usd } from "@/components/visor/primitives";
import type { TraceModel } from "@/lib/trace-model";
import { cn } from "@/lib/utils";
import { useSession } from "@/stores/session-store";
import { FolderButton } from "./folder-picker";

export const MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
] as const;
export const EFFORTS = ["low", "medium", "high"] as const;
/** Presets over the daemon's pause toggles; secrets are blocked and destructive commands pause in every mode. */
export const PERMISSIONS = [
  { id: "risky", label: "Ask before risky tools", hint: "Pause only on destructive shell, git and SQL", toggles: { bash: false, edits: false, mcpWrites: false } },
  { id: "shell", label: "Ask before commands", hint: "Also pause before every shell command", toggles: { bash: true, edits: false, mcpWrites: false } },
  { id: "every", label: "Ask before every change", hint: "Pause before commands, file edits and MCP writes", toggles: { bash: true, edits: true, mcpWrites: true } },
] as const;

export type ComposerValue = { modelId: string; effort: (typeof EFFORTS)[number]; capUsd: string };

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, close]);
  return ref;
}

/** Rounded prompt box: attach, permission mode, model + effort, cap, send / stop. */
export function Composer({
  model,
  value,
  onChange,
  onSend,
  onStop,
}: {
  model: TraceModel;
  value: ComposerValue;
  onChange: (v: ComposerValue) => void;
  onSend: (prompt: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [menu, setMenu] = useState<"perm" | "model" | null>(null);
  const close = () => setMenu(null);
  const permRef = useOutside(menu === "perm", close);
  const modelRef = useOutside(menu === "model", close);
  const running = model.session?.status === "running" || model.session?.status === "paused";
  const toggles = useSession((s) => s.toggles);
  const setToggles = useSession((s) => s.setToggles);
  const same = (a: object, b: object | null) => b !== null && JSON.stringify(a) === JSON.stringify(b);
  const perm = PERMISSIONS.find((p) => same(p.toggles, toggles));
  const permLabel = perm?.label ?? "Custom pauses";
  const modelLabel = MODELS.find((m) => m.id === value.modelId)?.label ?? value.modelId;

  const send = () => {
    if (!text.trim() || running) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="@container rounded-[22px] border border-white/[0.08] bg-[var(--composer)] px-4 pb-3 pt-3.5 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.8)] focus-within:border-white/[0.16]">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        rows={1}
        placeholder="Describe what you want to build, / commands, @ files or sessions"
        className="max-h-40 min-h-[26px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-white/40 [field-sizing:content]"
        aria-label="Prompt"
      />
      <div className="mt-3 flex items-center gap-1.5 whitespace-nowrap">
        <button type="button" aria-label="Attach files" className="flex size-8 items-center justify-center rounded-full border border-white/[0.1] text-white/60 hover:bg-white/[0.06] hover:text-foreground">
          <Plus size={16} />
        </button>

        <FolderButton disabled={running} />
        <div ref={permRef} className="relative">
          <button type="button" onClick={() => setMenu(menu === "perm" ? null : "perm")} className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-white/70 hover:bg-white/[0.06]" aria-expanded={menu === "perm"}>
            <ShieldCheck size={15} className="text-white/55" />
            <span className="hidden @[520px]:inline">{permLabel}</span>
            <ChevronDown size={13} className="text-white/40" />
          </button>
          {menu === "perm" && (
            <div className="absolute bottom-10 left-0 z-30 w-72 rounded-2xl border border-white/10 bg-popover p-1.5 shadow-2xl">
              {PERMISSIONS.map((p) => (
                <button key={p.id} type="button" onClick={() => (void setToggles(p.toggles), close())} className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left hover:bg-white/[0.06]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] text-foreground">{p.label}</span>
                    <span className="block text-[12px] text-white/45">{p.hint}</span>
                  </span>
                  {perm?.id === p.id && <Check size={15} className="mt-0.5 text-indigo" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="hidden h-8 items-center gap-1 rounded-full px-2.5 font-mono text-[12px] text-white/50 hover:bg-white/[0.06] @[640px]:flex" title="Hard budget cap (USD)">
          cap $
          <input value={value.capUsd} onChange={(e) => onChange({ ...value, capUsd: e.target.value })} inputMode="decimal" className="w-10 bg-transparent text-white/80 outline-none" aria-label="Budget cap in dollars" />
        </label>

        <span className="ml-auto hidden font-mono text-[12px] text-emerald/80 @[600px]:inline" title="Session cost so far">
          <Usd micro={model.cost.total} />
        </span>

        <div ref={modelRef} className="relative ml-auto @[600px]:ml-0">
          <button type="button" onClick={() => setMenu(menu === "model" ? null : "model")} className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13.5px] text-foreground/90 hover:bg-white/[0.06]" aria-expanded={menu === "model"}>
            {modelLabel} <span className="hidden capitalize text-white/45 @[420px]:inline">{value.effort}</span>
            <ChevronDown size={13} className="text-white/40" />
          </button>
          {menu === "model" && (
            <div className="absolute bottom-10 right-0 z-30 w-60 rounded-2xl border border-white/10 bg-popover p-1.5 shadow-2xl">
              <p className="px-3 pb-1 pt-1.5 text-[11px] text-white/40">Model</p>
              {MODELS.map((m) => (
                <button key={m.id} type="button" onClick={() => onChange({ ...value, modelId: m.id })} className="flex w-full items-center rounded-xl px-3 py-1.5 text-left text-[13.5px] hover:bg-white/[0.06]">
                  {m.label}
                  {m.id === value.modelId && <Check size={14} className="ml-auto text-indigo" />}
                </button>
              ))}
              <p className="px-3 pb-1 pt-2 text-[11px] text-white/40">Effort</p>
              <div className="flex gap-1 px-2 pb-1.5">
                {EFFORTS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => onChange({ ...value, effort: e })}
                    className={cn("flex-1 rounded-lg py-1 text-[12.5px] capitalize", e === value.effort ? "bg-indigo/20 text-foreground" : "text-white/55 hover:bg-white/[0.06]")}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {running ? (
          <button type="button" onClick={onStop} aria-label="Stop" className="flex size-9 items-center justify-center rounded-full bg-white/[0.12] text-foreground hover:bg-white/[0.18]">
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={!text.trim()}
            aria-label="Send"
            className="flex size-9 items-center justify-center rounded-full bg-foreground text-[var(--primary-foreground)] transition-opacity disabled:opacity-40"
          >
            <ArrowUp size={17} />
          </button>
        )}
      </div>
    </div>
  );
}
