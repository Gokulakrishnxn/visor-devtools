import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { safeHref } from "@/lib/sources";
import { cn } from "@/lib/utils";

/** Host without "www.", or null for a link that isn't http(s). */
export function hostOf(href: string): string | null {
  const ok = safeHref(href);
  return ok ? new URL(ok).hostname.replace(/^www\./, "") : null;
}

// A steady color per site for the letter fallback
const PALETTE = ["#5b8def", "#e07a45", "#3fae8c", "#b07ce8", "#d6a243", "#e0607e", "#4fb3c7", "#8a9a5b"];
function colorFor(host: string): string {
  let h = 0;
  for (const ch of host) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/**
 * The site's own icon (fetched from that site only, no third-party favicon
 * service), falling back to a colored letter when it has none.
 */
export function SiteIcon({ href, size = 16, className }: { href: string; size?: number; className?: string }) {
  const host = hostOf(href);
  const [failed, setFailed] = useState(false);
  if (!host) return null;
  const box = { width: size, height: size };
  if (failed) {
    return (
      <span
        aria-hidden
        style={{ ...box, background: colorFor(host), fontSize: Math.round(size * 0.6) }}
        className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase leading-none text-white", className)}
      >
        {host[0]}
      </span>
    );
  }
  return (
    <img
      src={`https://${host}/favicon.ico`}
      alt=""
      aria-hidden
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={box}
      className={cn("inline-block shrink-0 rounded-full bg-white object-contain p-[1px]", className)}
    />
  );
}

export type SourceLink = { href: string; title: string; host: string };

/** Links in a Markdown answer, with their link text as the title; deduplicated, in order. */
export function linksIn(markdown: string): SourceLink[] {
  const out = new Map<string, SourceLink>();
  const md = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  for (const m of markdown.matchAll(md)) {
    const href = safeHref(m[2]!);
    const host = href && hostOf(href);
    if (href && host && !out.has(href)) out.set(href, { href, title: m[1]!.trim(), host });
  }
  for (const m of markdown.matchAll(/(?<!\]\()https?:\/\/[^\s<>"'`)\]}]+/g)) {
    const href = safeHref(m[0].replace(/[.,;:!?*_]+$/, ""));
    const host = href && hostOf(href);
    if (href && host && !out.has(href)) out.set(href, { href, title: host, host });
  }
  return [...out.values()];
}

/**
 * The answer's sources as a row of site icons ("4 sources"), like the Claude
 * app; click it to see each source with its icon, title and site.
 */
export function SourceChips({ text }: { text: string }) {
  const links = linksIn(text);
  const [open, setOpen] = useState(false);
  if (!links.length) return null;
  const hosts = [...new Map(links.map((l) => [l.host, l])).values()];
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] py-1 pl-1.5 pr-3 text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.07] hover:text-foreground"
      >
        <span className="flex -space-x-1.5">
          {hosts.slice(0, 5).map((l) => (
            <SiteIcon key={l.host} href={l.href} size={18} className="ring-2 ring-[var(--background)]" />
          ))}
        </span>
        {links.length} source{links.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                target="_blank"
                rel="noreferrer noopener"
                title={l.href}
                className="group flex items-start gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 transition-colors hover:border-white/[0.14] hover:bg-white/[0.05]"
              >
                <SiteIcon href={l.href} size={16} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[12.5px] leading-snug text-foreground/90">{l.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-white/40">{l.host}</span>
                </span>
                <ArrowUpRight size={13} className="mt-0.5 shrink-0 text-white/30 group-hover:text-white/70" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
