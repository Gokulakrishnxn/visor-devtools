"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { RailToc, type RailTocItem } from "@/components/ui/rail-toc";

/** Collects the article's h2/h3 headings and hands them to the Rail TOC. */
export function Toc() {
  const pathname = usePathname();
  const [items, setItems] = useState<RailTocItem[]>([]);

  useEffect(() => {
    const heads = Array.from(
      document.querySelectorAll<HTMLElement>("[data-docs-article] h2[id], [data-docs-article] h3[id]"),
    );
    // Reading headings from the rendered article is syncing with the DOM.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(
      heads.map((h) => ({
        id: h.id,
        label: (h.textContent ?? "").replace(/#$/, "").trim(),
        depth: h.tagName === "H3" ? 1 : 0,
      })),
    );
  }, [pathname]);

  if (!items.length) return null;
  return <RailToc key={pathname} items={items} offset={96} className="max-w-full" />;
}
