"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { GitHubIcon } from "@/components/icons/brand";
import { site } from "@/lib/site";
import { cn } from "@/lib/cn";
import { Logo } from "./logo";

const links = [
  { href: "/#pillars", label: "Pillars" },
  { href: "/#features", label: "Features" },
  { href: "/#architecture", label: "Architecture" },
  { href: "/docs", label: "Docs" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-3 sm:pt-4">
      <motion.nav
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl border px-4 transition-[background,border-color,box-shadow] duration-300 sm:px-5",
          scrolled || open
            ? "border-line-strong bg-[#0d1017]/70 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        <Logo />

        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={site.repo}
            target="_blank"
            rel="noreferrer"
            aria-label="V.I.S.O.R. on GitHub"
            className="flex h-9 items-center gap-2 rounded-xl border border-line-strong px-3 text-sm text-fg-muted transition-colors hover:border-white/25 hover:text-fg"
          >
            <GitHubIcon size={16} />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <Link
            href="/docs/quickstart"
            className="hidden h-9 items-center gap-1 rounded-xl bg-white px-3.5 text-sm font-medium text-[#0b0d12] transition-transform hover:scale-[1.02] sm:flex"
          >
            Get started <ArrowUpRight size={15} />
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex size-9 items-center justify-center rounded-xl border border-line-strong text-fg-muted md:hidden"
          >
            {open ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mx-auto mt-2 max-w-6xl rounded-2xl border border-line-strong bg-[#0d1017]/90 p-2 backdrop-blur-xl md:hidden"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-3 text-[15px] text-fg-muted hover:bg-white/5 hover:text-fg"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/docs/quickstart"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-3 text-[15px] font-medium text-[#0b0d12]"
            >
              Get started <ArrowUpRight size={15} />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
