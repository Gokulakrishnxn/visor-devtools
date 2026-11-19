"use client";

import { useEffect, useState } from "react";
import { RailToc, type RailTocItem } from "@/components/ui/rail-toc";

const SELECTOR = "[data-docs-article] h2[id], [data-docs-article] h3[id]";

function readHeadings(): RailTocItem[] {
  // Next keeps recently visited pages mounted but hidden; only read the visible one
  return Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))
    .filter((h) => h.getClientRects().length > 0)
    .map((h) => ({
    id: h.id,
    label: (h.textContent ?? "").replace(/#$/, "").trim(),
    depth: h.tagName === "H3" ? 1 : 0,
  }));
}

/**
 * Collects the article's h2/h3 headings for the Rail TOC. It watches the
 * article itself, because on client navigation the new page's content can
 * arrive after the URL has already changed.
 */
export function Toc() {
  const [items, setItems] = useState<RailTocItem[]>([]);

  useEffect(() => {
    const article = document.querySelector("[data-docs-article]");
    if (!article) return;
    const update = () =>
      setItems((prev) => {
        const next = readHeadings();
        const same = prev.length === next.length && prev.every((p, i) => p.id === next[i].id);
        return same ? prev : next;
      });
    update();
    const mo = new MutationObserver(update);
    mo.observe(article, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "hidden"] });
    return () => mo.disconnect();
  }, []);

  if (!items.length) return null;
  // A new heading list gets a fresh rail, so its measurements never lag the list
  return <RailToc key={items.map((i) => i.id).join("|")} items={items} offset={96} className="max-w-full" />;
}
