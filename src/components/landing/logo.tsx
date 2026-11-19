import Link from "next/link";
import { cn } from "@/lib/cn";

/** Plain text wordmark: the visor is the slash of light across the dots. */
export function Logo({ className, badge = true }: { className?: string; badge?: boolean }) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2.5", className)} aria-label="V.I.S.O.R. home">
      <span className="font-display text-[17px] font-semibold tracking-[0.18em] text-fg">
        V<span className="text-accent">.</span>I<span className="text-accent">.</span>S
        <span className="text-accent">.</span>O<span className="text-accent">.</span>R
        <span className="text-accent">.</span>
      </span>
      {badge && (
        <span className="rounded-md border border-line-strong px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
          Preview
        </span>
      )}
    </Link>
  );
}
