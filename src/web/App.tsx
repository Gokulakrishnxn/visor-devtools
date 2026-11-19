import { lazy, Suspense } from "react";
import { ArrowRight } from "lucide-react";

const Design1 = lazy(() => import("./prototypes/design1-studio").then((m) => ({ default: m.Design1Studio })));
const Design2 = lazy(() => import("./prototypes/design2-linear").then((m) => ({ default: m.Design2Linear })));
const Design3 = lazy(() => import("./prototypes/design3-deck").then((m) => ({ default: m.Design3Deck })));

const DESIGNS = [
  { n: 1, name: "Studio Tri-Pane", blurb: "Classic 3-column studio: sessions and MCP health, live stream, tabbed inspector.", best: "Maximum at-a-glance visibility" },
  { n: 2, name: "Linear Focus", blurb: "Calm 2-pane canvas, side-by-side diffs, floating override dock and slide-over inspector.", best: "A quiet daily driver" },
  { n: 3, name: "Mission Deck", blurb: "Span waterfall on top, split tabbed workspace, breakpoint banner, alert feed and replay.", best: "Debugging latency and spend" },
] as const;

/** `/` is the Phase 2 design switcher; `/preview/:n` renders a prototype. */
export function App() {
  const match = /^\/preview\/([123])\/?$/.exec(window.location.pathname);
  const n = match?.[1];
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-faint">Loading…</div>}>
      {n === "1" ? <Design1 /> : n === "2" ? <Design2 /> : n === "3" ? <Design3 /> : <Switcher />}
    </Suspense>
  );
}

function Switcher() {
  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center px-4 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-faint">Phase 2 · design gate</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">Pick the V.I.S.O.R. interface.</h1>
      <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
        All three stream the same live mock session from the local daemon: thinking, reads, diffs, a subagent with MCP, a compaction, live cost, and a
        breakpoint you can approve, edit or deny. Zero API spend.
      </p>
      <div className="mt-10 grid gap-3 md:grid-cols-3">
        {DESIGNS.map((d) => (
          <a
            key={d.n}
            href={`/preview/${d.n}${window.location.search}`}
            className="group flex flex-col rounded-2xl border border-border bg-panel p-5 transition-colors hover:border-border-strong hover:bg-card"
          >
            <span className="font-mono text-[12px] text-faint">Design {d.n}</span>
            <span className="mt-2 text-[17px] font-medium">{d.name}</span>
            <span className="mt-2 flex-1 text-[13.5px] leading-relaxed text-muted-foreground">{d.blurb}</span>
            <span className="mt-5 flex items-center justify-between text-[12.5px]">
              <span className="text-faint">{d.best}</span>
              <ArrowRight size={15} className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </span>
          </a>
        ))}
      </div>
      <p className="mt-8 text-[12.5px] text-faint">
        Keys everywhere: <span className="font-mono">⌘K</span> palette · <span className="font-mono">J/K</span> spans · <span className="font-mono">A/E/D</span> approve, edit,
        deny.
      </p>
    </div>
  );
}
