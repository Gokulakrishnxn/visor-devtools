/** "200k", "1.5m", "250,000" → a whole number of tokens; "" → no limit; undefined when it isn't a number. */
export function parseTokens(text: string): number | null | undefined {
  const t = text.trim().toLowerCase().replace(/[,_\s]/g, "");
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(t);
  if (!m) return undefined;
  const n = Math.round(Number(m[1]) * (m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1));
  return n > 0 ? n : undefined;
}
