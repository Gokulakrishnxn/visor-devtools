"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsNav } from "@/lib/docs-nav";
import { cn } from "@/lib/cn";

export function DocsSidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Documentation" className="space-y-7">
      {docsNav.map((g) => (
        <div key={g.title}>
          <p className="mb-2 px-3 text-xs font-semibold text-fg">{g.title}</p>
          <ul className="space-y-0.5">
            {g.pages.map((p) => {
              const active = pathname === p.href;
              return (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-3 py-1.5 text-[14px] transition-colors",
                      active ? "bg-accent/10 font-medium text-accent" : "text-fg-muted hover:bg-white/[0.04] hover:text-fg",
                    )}
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
