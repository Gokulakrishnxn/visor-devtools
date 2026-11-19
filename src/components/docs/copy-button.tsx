"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy code"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      className="flex size-7 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-white/10 hover:text-fg"
    >
      {done ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
    </button>
  );
}
