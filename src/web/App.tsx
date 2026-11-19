import { FoundationConsole } from "./pages/foundation-console";

const DESIGNS: Record<string, { name: string; blurb: string }> = {
  "1": { name: "Studio Tri-Pane", blurb: "Classic 3-column developer studio." },
  "2": { name: "Linear Focus", blurb: "Calm 2-pane canvas with a slide-over inspector." },
  "3": { name: "Mission Deck", blurb: "Waterfall flamegraph with multi-pane tabs." },
};

/** Tiny path router; Phase 2 fills in the three /preview/:n designs. */
export function App() {
  const match = /^\/preview\/([123])\/?$/.exec(window.location.pathname);
  if (!match) return <FoundationConsole />;
  const d = DESIGNS[match[1]!]!;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Design {match[1]} · Phase 2</p>
      <h1 className="text-3xl font-medium">{d.name}</h1>
      <p className="max-w-md text-muted-foreground">{d.blurb} This prototype is built in Phase 2, after the Phase 1 gate.</p>
      <a href={`/${window.location.search}`} className="mt-2 text-sm text-indigo hover:underline">
        Back to the foundation console
      </a>
    </div>
  );
}
