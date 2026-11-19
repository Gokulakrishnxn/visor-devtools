import { CONTEXT_CATEGORIES, type ContextBreakdown, type ContextCategory } from "@shared/events";

export const CONTEXT_LABELS: Record<ContextCategory, string> = {
  projectRules: "Project rules (CLAUDE.md)",
  toolSchemas: "MCP & tool schemas",
  mentionedFiles: "Mentioned files (@-refs)",
  toolResults: "Tool results (I/O)",
  thinking: "Extended thinking",
  subagents: "Subagent / team overhead",
  messages: "User & assistant messages",
};

export function emptyBreakdown(): ContextBreakdown {
  return Object.fromEntries(CONTEXT_CATEGORIES.map((c) => [c, 0])) as ContextBreakdown;
}

export type ContextSummary = {
  used: number;
  limit: number;
  free: number;
  /** Whole-number per-mille (‰) of the window for each category; integers only. */
  perMille: Record<ContextCategory, number>;
  /** 0.8 of the window or more. */
  nearLimit: boolean;
};

export function summarizeContext(breakdown: ContextBreakdown, limit: number): ContextSummary {
  const used = CONTEXT_CATEGORIES.reduce((n, c) => n + breakdown[c], 0);
  const perMille = Object.fromEntries(
    CONTEXT_CATEGORIES.map((c) => [c, limit > 0 ? Math.floor((breakdown[c] * 1000) / limit) : 0]),
  ) as Record<ContextCategory, number>;
  return { used, limit, free: Math.max(0, limit - used), perMille, nearLimit: used * 5 >= limit * 4 };
}

/** Adds tokens to one category, returning a new breakdown. */
export function attribute(breakdown: ContextBreakdown, category: ContextCategory, tokens: number): ContextBreakdown {
  return { ...breakdown, [category]: breakdown[category] + tokens };
}
