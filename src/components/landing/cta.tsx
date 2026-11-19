import Link from "next/link";
import { ArrowRight, Terminal } from "lucide-react";
import { Reveal } from "./reveal";

export function Cta() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:pb-32">
      <Reveal className="relative overflow-hidden rounded-[28px] border border-line-strong px-6 py-16 text-center sm:px-12 sm:py-20">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(80%_120%_at_50%_0%,#24427a_0%,#101a30_45%,#0a0c11_100%)]" />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-balance font-display text-3xl font-medium tracking-tight text-white sm:text-5xl">
            Stop guessing what your agent just did.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-white/65">
            One command starts the local harness and opens the GUI in your current directory.
          </p>
          <div className="mx-auto mt-8 flex max-w-sm items-center gap-3 rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-left font-mono text-sm text-white/90">
            <Terminal size={15} className="shrink-0 text-white/50" />
            <span className="truncate">npx visor-devtools</span>
            <span className="ml-auto shrink-0 text-xs text-white/40">soon</span>
          </div>
          <Link
            href="/docs"
            className="group mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-[#0b0d12] transition-transform hover:scale-[1.03]"
          >
            Read the docs <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
