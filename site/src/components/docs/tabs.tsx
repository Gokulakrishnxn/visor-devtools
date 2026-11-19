"use client";

import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type TabProps = { title: string; children: ReactNode };

export function Tab({ children }: TabProps) {
  return <>{children}</>;
}

export function Tabs({ children }: { children: ReactNode }) {
  const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<TabProps>[];
  const [i, setI] = useState(0);
  return (
    <div className="my-6 rounded-xl border border-line">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line px-2">
        {tabs.map((t, j) => (
          <button
            key={t.props.title}
            role="tab"
            type="button"
            aria-selected={i === j}
            onClick={() => setI(j)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors",
              i === j ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t.props.title}
          </button>
        ))}
      </div>
      <div className="px-4 py-1 [&>pre:first-child]:mt-3">{tabs[i]}</div>
    </div>
  );
}
