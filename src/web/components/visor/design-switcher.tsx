import { cn } from "@/lib/utils";

const DESIGNS = [
  { n: 1, name: "Studio Tri-Pane" },
  { n: 2, name: "Linear Focus" },
  { n: 3, name: "Mission Deck" },
];

/** Floating pill to flip between the three Phase 2 prototypes. */
export function DesignSwitcher({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav
      aria-label="Switch design"
      className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1 rounded-full border border-border-strong bg-[#101318]/90 p-1 text-[12px] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl"
    >
      {DESIGNS.map((d) => (
        <a
          key={d.n}
          href={`/preview/${d.n}${window.location.search}`}
          aria-current={d.n === current ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 transition-colors",
            d.n === current ? "bg-white text-[#0b0d12]" : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
          )}
        >
          <span className="font-mono">{d.n}</span>
          <span className="ml-1.5 hidden sm:inline">{d.name}</span>
        </a>
      ))}
    </nav>
  );
}
