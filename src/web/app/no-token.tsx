import { useState } from "react";
import { saveTokenFrom } from "@/stores/session-store";

/** Shown when this browser has no (valid) access token for the local V.I.S.O.R. */
export function NoToken() {
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <p className="font-semibold tracking-[0.16em]">V.I.S.O.R.</p>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          Open the link that <code className="font-mono text-foreground">vhud</code> printed in your terminal (the line starting with{" "}
          <code className="font-mono text-foreground">GUI:</code>). This browser will remember it, so this address works in every tab after that.
        </p>
        <form
          className="mt-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setBad(!saveTokenFrom(value));
          }}
        >
          <input
            value={value}
            onChange={(e) => (setValue(e.target.value), setBad(false))}
            placeholder="…or paste that link here"
            aria-label="V.I.S.O.R. link or token"
            aria-invalid={bad}
            className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[13px] text-foreground outline-none placeholder:text-white/30 focus:border-indigo/60"
          />
          <button type="submit" className="h-9 rounded-lg bg-foreground px-3 text-[13px] font-medium text-[var(--primary-foreground)]">
            Open
          </button>
        </form>
        {bad && <p className="mt-2 text-[12px] text-rose/90">That doesn't look like a V.I.S.O.R. link. It ends in ?token=…</p>}
      </div>
    </div>
  );
}
