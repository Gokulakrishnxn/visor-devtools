"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { FileText, Search } from "lucide-react";
import { allDocs } from "@/lib/docs-nav";

export function DocsSearch({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {compact ? (
        <button
          type="button"
          aria-label="Search docs"
          onClick={() => setOpen(true)}
          className="flex size-9 items-center justify-center rounded-lg border border-line-strong text-fg-muted"
        >
          <Search size={16} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-full max-w-sm items-center gap-2 rounded-xl border border-line-strong bg-white/[0.03] px-3 text-sm text-fg-faint transition-colors hover:border-white/20"
        >
          <Search size={15} />
          Search docs…
          <kbd className="ml-auto rounded-md border border-line-strong px-1.5 font-mono text-[11px]">⌘K</kbd>
        </button>
      )}

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search documentation"
        overlayClassName="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        contentClassName="fixed left-1/2 top-[12vh] z-[61] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line-strong bg-[#11141a] shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-fg-faint" />
          <Command.Input
            autoFocus
            placeholder="Search pages, pillars, commands…"
            className="h-12 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-faint"
          />
          <kbd className="rounded-md border border-line-strong px-1.5 font-mono text-[11px] text-fg-faint">esc</kbd>
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-sm text-fg-muted">No results.</Command.Empty>
          {Array.from(new Set(allDocs.map((d) => d.group))).map((group) => (
            <Command.Group
              key={group}
              heading={group}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-faint"
            >
              {allDocs
                .filter((d) => d.group === group)
                .map((d) => (
                  <Command.Item
                    key={d.href}
                    value={`${d.title} ${d.description} ${d.keywords ?? ""}`}
                    onSelect={() => {
                      setOpen(false);
                      router.push(d.href);
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-white/[0.06]"
                  >
                    <FileText size={15} className="shrink-0 text-fg-faint" />
                    <span className="min-w-0">
                      <span className="block text-sm text-fg">{d.title}</span>
                      <span className="block truncate text-xs text-fg-muted">{d.description}</span>
                    </span>
                  </Command.Item>
                ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
