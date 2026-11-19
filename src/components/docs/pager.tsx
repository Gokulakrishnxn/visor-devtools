"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { findDoc } from "@/lib/docs-nav";
import { site } from "@/lib/site";

export function DocHeader() {
  const { doc } = findDoc(usePathname());
  if (!doc) return null;
  return (
    <header className="mb-10">
      <p className="text-sm font-medium text-accent">{doc.group}</p>
      <h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-fg sm:text-4xl">{doc.title}</h1>
      <p className="mt-3 text-lg text-fg-muted">{doc.description}</p>
    </header>
  );
}

export function Pager() {
  const pathname = usePathname();
  const { prev, next } = findDoc(pathname);
  const file = pathname === "/docs" ? "page.mdx" : `${pathname.replace("/docs/", "")}/page.mdx`;
  return (
    <footer className="mt-16 border-t border-line pt-8">
      <div className="grid gap-3 sm:grid-cols-2">
        {prev ? (
          <Link href={prev.href} className="group rounded-xl border border-line p-4 transition-colors hover:border-line-strong">
            <span className="flex items-center gap-1 text-xs text-fg-faint">
              <ArrowLeft size={12} /> Previous
            </span>
            <span className="mt-1 block text-fg group-hover:text-accent">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={next.href} className="group rounded-xl border border-line p-4 text-right transition-colors hover:border-line-strong">
            <span className="flex items-center justify-end gap-1 text-xs text-fg-faint">
              Next <ArrowRight size={12} />
            </span>
            <span className="mt-1 block text-fg group-hover:text-accent">{next.title}</span>
          </Link>
        )}
      </div>
      <a
        href={`${site.repo}/blob/main/src/app/docs/${file}`}
        target="_blank"
        rel="noreferrer"
        className="mt-8 inline-block text-sm text-fg-faint hover:text-fg"
      >
        Edit this page on GitHub
      </a>
    </footer>
  );
}
