"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { GitHubIcon } from "@/components/icons/brand";
import { Logo } from "@/components/landing/logo";
import { site } from "@/lib/site";
import { DocsSidebarNav } from "./sidebar";
import { DocsSearch } from "./search";
import { DocHeader, Pager } from "./pager";
import { Toc } from "./toc";

export function DocsShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(45,90,168,0.28),transparent_70%)]" />

      <header className="sticky top-0 z-50 border-b border-line bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 lg:px-8">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
            className="flex size-9 items-center justify-center rounded-lg border border-line-strong text-fg-muted lg:hidden"
          >
            <Menu size={17} />
          </button>
          <Logo />
          <span className="hidden text-sm text-fg-faint sm:inline">Docs</span>
          <div className="hidden flex-1 justify-center md:flex">
            <DocsSearch />
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <span className="md:hidden">
              <DocsSearch compact />
            </span>
            <a
              href={site.repo}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub repository"
              className="flex h-9 items-center gap-2 rounded-lg border border-line-strong px-2.5 text-sm text-fg-muted hover:text-fg"
            >
              <GitHubIcon size={16} />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <Link href="/" className="hidden h-9 items-center rounded-lg bg-white px-3 text-sm font-medium text-[#0b0d12] sm:flex">
              Home
            </Link>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 z-[56] w-[290px] overflow-y-auto border-r border-line bg-panel p-4 lg:hidden"
            >
              <div className="mb-6 flex items-center justify-between">
                <Logo />
                <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="text-fg-muted">
                  <X size={18} />
                </button>
              </div>
              <DocsSidebarNav onNavigate={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="relative mx-auto flex max-w-[1440px] px-4 lg:px-8">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto py-8 pr-6 lg:block">
          <DocsSidebarNav />
        </aside>
        <main className="min-w-0 flex-1 py-10 lg:px-10 xl:px-14">
          <article data-docs-article className="mx-auto max-w-3xl">
            <DocHeader />
            <div className="docs-prose">{children}</div>
            <Pager />
          </article>
        </main>
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 overflow-y-auto py-10 xl:block">
          <Toc />
        </aside>
      </div>
    </div>
  );
}
