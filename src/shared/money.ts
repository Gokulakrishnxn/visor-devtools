/**
 * Money is always an integer number of micro-dollars (µUSD).
 * 1 USD = 1_000_000 µUSD, 1 cent = 10_000 µUSD. Format only at the UI edge.
 */
export type MicroUsd = number;

export const MICRO_PER_USD = 1_000_000;
export const MICRO_PER_CENT = 10_000;

export function assertMicro(value: number, label = "amount"): MicroUsd {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be an integer number of micro-dollars, got ${value}`);
  }
  return value;
}

/**
 * Parses a decimal USD string ("5", "0.25", "$1.0042") into µUSD without
 * going through floating point. More than 6 decimals is rejected.
 */
export function parseUsd(input: string | number): MicroUsd {
  const text = String(input).trim().replace(/^\$/, "");
  const m = /^(-)?(\d+)(?:\.(\d{0,6}))?$/.exec(text);
  if (!m) throw new TypeError(`Invalid USD amount: ${input}`);
  const [, sign, whole = "0", frac = ""] = m;
  const micro = Number(whole) * MICRO_PER_USD + Number(frac.padEnd(6, "0"));
  return assertMicro(sign ? -micro : micro);
}

/** Formats µUSD as `$0.0000` (4 decimals by default), rounding half away from zero. */
export function formatUsd(micro: MicroUsd, decimals: 2 | 4 | 6 = 4): string {
  assertMicro(micro);
  const sign = micro < 0 ? "-" : "";
  const abs = Math.abs(micro);
  const step = 10 ** (6 - decimals);
  const rounded = Math.round(abs / step) * step; // exact for integers far below 2^53
  const whole = Math.floor(rounded / MICRO_PER_USD);
  const frac = String((rounded % MICRO_PER_USD) / step).padStart(decimals, "0");
  return `${sign}$${whole.toLocaleString("en-US")}.${frac}`;
}
