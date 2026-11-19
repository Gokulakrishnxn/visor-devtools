/**
 * The deep-blue blurred field behind the hero: three slow drifting light
 * pools over navy, fading to the page at the bottom. Pure CSS, GPU-only
 * transforms, still under reduced motion.
 */
export function GradientBackdrop() {
  return (
    <div aria-hidden className="grain pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#1b3566_0%,#152b52_30%,#0c1a33_62%,var(--bg)_100%)]" />
      <div
        className="absolute -left-[12%] top-[-8%] h-[70%] w-[60%] rounded-full bg-[#5b7fb8] opacity-50 blur-[120px]"
        style={{ animation: "drift-a 22s ease-in-out infinite" }}
      />
      <div
        className="absolute right-[-10%] top-[4%] h-[60%] w-[55%] rounded-full bg-[#2d5aa8] opacity-60 blur-[130px]"
        style={{ animation: "drift-b 26s ease-in-out infinite" }}
      />
      <div
        className="absolute left-[18%] top-[30%] h-[45%] w-[50%] rounded-full bg-[#7c93c4] opacity-25 blur-[140px]"
        style={{ animation: "drift-c 30s ease-in-out infinite" }}
      />
      <div className="absolute -left-[20%] bottom-[8%] h-[40%] w-[45%] rounded-full bg-[#020409] opacity-70 blur-[100px]" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}
