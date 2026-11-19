"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { ArrowRight, Sparkle } from "lucide-react";
import { GitHubIcon } from "@/components/icons/brand";
import { site } from "@/lib/site";
import { GradientBackdrop } from "./gradient-backdrop";
import { HeroDemo } from "./hero-demo";

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const frame = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: frame, offset: ["start end", "start 0.25"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [18, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.4], [0.5, 1]);

  return (
    <section className="relative overflow-hidden pb-16 pt-36 sm:pb-24 sm:pt-44">
      <GradientBackdrop />

      <div className="relative mx-auto max-w-4xl px-4 text-center">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
          className="flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.4em] text-white/60"
        >
          <Sparkle size={12} className="fill-white/60" /> Preview
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.08, ease }}
          className="mt-6 font-display text-[40px] font-medium leading-[1.08] tracking-tight text-white sm:text-6xl md:text-7xl"
        >
          X-ray vision for
          <br />
          AI coding agents.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.16, ease }}
          className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-white/65 sm:text-lg"
        >
          {site.name} is a live harness and debugger for Claude. Watch every thinking step and tool
          call as it happens, pause risky actions before they run, and see the exact tokens and
          dollars behind every prompt.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.24, ease }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link
            href="/docs/quickstart"
            className="group flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-[#0b0d12] shadow-[0_8px_30px_-8px_rgba(255,255,255,0.5)] transition-transform hover:scale-[1.03]"
          >
            Get started
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href={site.repo}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 text-[15px] text-white/90 backdrop-blur transition-colors hover:bg-white/10"
          >
            <GitHubIcon size={16} /> Star on GitHub
          </a>
        </motion.div>
      </div>

      <div ref={frame} className="relative mx-auto mt-16 max-w-[1100px] px-4 [perspective:1600px] sm:mt-20">
        <motion.div style={{ rotateX, scale, opacity, transformOrigin: "50% 0%" }}>
          <HeroDemo />
        </motion.div>
      </div>
    </section>
  );
}
