import { z } from "zod";

/** The 7 context categories from the PRD (§4.3). */
export const CONTEXT_CATEGORIES = [
  "projectRules",
  "toolSchemas",
  "mentionedFiles",
  "toolResults",
  "thinking",
  "subagents",
  "messages",
] as const;
export type ContextCategory = (typeof CONTEXT_CATEGORIES)[number];
export type ContextBreakdown = Record<ContextCategory, number>;

export const SpanType = z.enum(["llm", "thinking", "read", "edit", "bash", "mcp", "subagent", "compaction", "override"]);
export type SpanType = z.infer<typeof SpanType>;

export const SpanStatus = z.enum(["running", "paused", "ok", "error", "denied", "edited"]);
export type SpanStatus = z.infer<typeof SpanStatus>;

export const Decision = z.enum(["approved", "edited", "denied", "auto_blocked"]);
export type Decision = z.infer<typeof Decision>;

export const Effort = z.enum(["low", "medium", "high"]);
export type Effort = z.infer<typeof Effort>;

const micro = z.number().int();
const id = z.string().min(1);
const at = z.number().int().nonnegative(); // epoch ms
const tokens = z.number().int().nonnegative();

const Usage = z.object({
  inputTokens: tokens,
  cacheWrite5mTokens: tokens,
  cacheWrite1hTokens: tokens,
  cacheReadTokens: tokens,
  outputTokens: tokens,
});

const Breakdown = z.object({
  projectRules: tokens,
  toolSchemas: tokens,
  mentionedFiles: tokens,
  toolResults: tokens,
  thinking: tokens,
  subagents: tokens,
  messages: tokens,
});

export const VisorEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session.started"),
    sessionId: id,
    title: z.string(),
    workspacePath: z.string(),
    modelId: z.string(),
    effort: Effort,
    budgetCapMicroUsd: micro.nullable(),
    at,
  }),
  z.object({
    type: z.literal("turn.started"),
    sessionId: id,
    turnId: id,
    turnIndex: z.number().int().nonnegative(),
    prompt: z.string(),
    at,
  }),
  z.object({
    type: z.literal("span.started"),
    sessionId: id,
    turnId: id,
    spanId: id,
    parentSpanId: id.nullable(),
    spanType: SpanType,
    name: z.string(),
    filePath: z.string().optional(),
    input: z.unknown().optional(),
    at,
  }),
  z.object({ type: z.literal("span.delta"), sessionId: id, spanId: id, text: z.string(), at }),
  z.object({
    type: z.literal("span.ended"),
    sessionId: id,
    spanId: id,
    status: SpanStatus,
    output: z.unknown().optional(),
    diff: z.string().optional(),
    error: z.string().optional(),
    costMicroUsd: micro,
    at,
  }),
  z.object({
    type: z.literal("usage"),
    sessionId: id,
    turnId: id,
    spanId: id,
    messageId: id,
    modelId: z.string(),
    usage: Usage,
    at,
  }),
  z.object({
    type: z.literal("breakpoint.paused"),
    sessionId: id,
    spanId: id,
    toolName: z.string(),
    rule: z.string(),
    input: z.unknown(),
    at,
  }),
  z.object({
    type: z.literal("breakpoint.resolved"),
    sessionId: id,
    spanId: id,
    toolName: z.string(),
    rule: z.string(),
    decision: Decision,
    finalInput: z.unknown().optional(),
    note: z.string().optional(),
    at,
  }),
  z.object({
    type: z.literal("turn.ended"),
    sessionId: id,
    turnId: id,
    costMicroUsd: micro,
    /** What V.I.S.O.R. computed from tokens, when the runtime also reported an authoritative total. */
    computedCostMicroUsd: micro.optional(),
    cacheSavingsMicroUsd: micro,
    contextUsedTokens: tokens,
    contextLimitTokens: tokens,
    contextBreakdown: Breakdown,
    at,
  }),
  z.object({
    type: z.literal("alert"),
    sessionId: id,
    level: z.enum(["info", "warning", "danger"]),
    title: z.string(),
    detail: z.string(),
    /** Which trigger or rule raised it. */
    source: z.string(),
    spanId: id.optional(),
    at,
  }),
  z.object({
    type: z.literal("session.ended"),
    sessionId: id,
    status: z.enum(["completed", "aborted_budget", "error"]),
    totalCostMicroUsd: micro,
    at,
  }),
]);
export type VisorEvent = z.infer<typeof VisorEvent>;
export type VisorEventOf<T extends VisorEvent["type"]> = Extract<VisorEvent, { type: T }>;

/** What the daemon receives when an operator resolves a breakpoint. */
export const OverrideDecision = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approved") }),
  z.object({ decision: z.literal("edited"), input: z.record(z.string(), z.unknown()) }),
  z.object({ decision: z.literal("denied"), note: z.string().max(2000).optional() }),
]);
export type OverrideDecision = z.infer<typeof OverrideDecision>;
