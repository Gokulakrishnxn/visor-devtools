"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/*
 * "Vis", an original pixel creature in the spirit of a terminal mascot:
 * a clay-orange block with stubby arms and four legs, wearing the visor.
 * It bobs while idle, blinks, looks toward the pointer, trots while the
 * page scrolls, and hops with a tip when clicked.
 */

const C = "#d97757"; // clay body
const D = "#b45f43"; // shade
const V = "#0d1220"; // visor glass

const tips = [
  "Cache hit! −$0.036 saved.",
  "Paused: git push --force 👀",
  "412k / 1M context used.",
  "Every span, timed to the ms.",
  "Press A, E or D on a breakpoint.",
];

export function ClaudePet() {
  const reduce = useReducedMotion();
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  const [walking, setWalking] = useState(false);
  const [hop, setHop] = useState(0);
  const [tip, setTip] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.max(1, Math.hypot(dx, dy));
      setLook({ x: Math.round((dx / d) * 1.5), y: Math.round((dy / d) * 1) });
    };
    let stop: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      setWalking(true);
      clearTimeout(stop);
      stop = setTimeout(() => setWalking(false), 220);
    };
    const blinker = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 3800);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      clearInterval(blinker);
      clearTimeout(stop);
    };
  }, [reduce]);

  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(null), 2600);
    return () => clearTimeout(t);
  }, [tip]);

  const poke = () => {
    setHop((h) => h + 1);
    setTip(tips[(hop + 1) % tips.length]);
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      <AnimatePresence>
        {tip && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute bottom-full right-0 mb-2 w-max max-w-[220px] rounded-xl border border-line-strong bg-[#141821]/95 px-3 py-2 text-xs text-fg shadow-xl backdrop-blur"
          >
            {tip}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        ref={ref}
        type="button"
        onClick={poke}
        aria-label="Vis, the V.I.S.O.R. mascot. Click for a tip."
        className="pointer-events-auto block cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent"
        key={hop}
        initial={false}
        animate={reduce ? {} : hop ? { y: [0, -18, 0, -5, 0] } : { y: [0, -3, 0] }}
        transition={hop ? { duration: 0.6, ease: "easeOut" } : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        whileHover={{ scale: 1.08 }}
      >
        <svg
          width="64"
          height="56"
          viewBox="0 0 16 14"
          shapeRendering="crispEdges"
          className="h-12 w-[55px] drop-shadow-[0_6px_14px_rgba(217,119,87,0.35)] sm:h-14 sm:w-16"
        >
          {/* body */}
          <rect x="3" y="2" width="10" height="8" fill={C} />
          <rect x="3" y="9" width="10" height="1" fill={D} />
          {/* arms */}
          <rect x="1" y="5" width="2" height="2" fill={C} />
          <rect x="13" y="5" width="2" height="2" fill={C} />
          {/* visor band */}
          <rect x="3" y="4" width="10" height="3" fill={V} />
          {/* eyes behind the visor, looking around */}
          {!blink && (
            <>
              <rect x={5 + look.x} y={5 + Math.max(0, look.y)} width="1" height="1" fill="#7dd3fc" />
              <rect x={10 + look.x} y={5 + Math.max(0, look.y)} width="1" height="1" fill="#7dd3fc" />
            </>
          )}
          {blink && (
            <>
              <rect x={5 + look.x} y="5.5" width="1" height="0.4" fill="#7dd3fc" />
              <rect x={10 + look.x} y="5.5" width="1" height="0.4" fill="#7dd3fc" />
            </>
          )}
          {/* visor glint */}
          <rect x="11" y="4" width="1" height="1" fill="#ffffff" opacity="0.5" />
          {/* legs, trotting while the page scrolls */}
          {[4, 6, 9, 11].map((x, i) => (
            <rect
              key={x}
              x={x}
              y="10"
              width="1"
              height={walking && !reduce ? (i % 2 ? 1 : 2) : 2}
              fill={C}
              style={walking && !reduce ? { animation: `pet-step 0.24s steps(1) ${i % 2 ? "0.12s" : "0s"} infinite` } : undefined}
            />
          ))}
        </svg>
      </motion.button>
      <style>{`@keyframes pet-step { 0% { height: 2px } 50% { height: 1px } }`}</style>
    </div>
  );
}
