import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// PRD §4.2. IDs are ULIDs, money is integer micro-dollars, times are epoch ms.

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  workspacePath: text("workspace_path").notNull(),
  title: text("title").notNull(),
  modelId: text("model_id").notNull(),
  effortLevel: text("effort_level", { enum: ["low", "medium", "high"] }).notNull(),
  budgetCapMicroUsd: integer("budget_cap_micro_usd"),
  totalCostMicroUsd: integer("total_cost_micro_usd").notNull().default(0),
  status: text("status", { enum: ["running", "paused", "completed", "aborted_budget", "error"] })
    .notNull()
    .default("running"),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
});

export const turns = sqliteTable(
  "turns",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    turnIndex: integer("turn_index").notNull(),
    userPrompt: text("user_prompt").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    thinkingTokens: integer("thinking_tokens").notNull().default(0),
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    cacheSavingsMicroUsd: integer("cache_savings_micro_usd").notNull().default(0),
    contextUsedTokens: integer("context_used_tokens").notNull().default(0),
    contextLimitTokens: integer("context_limit_tokens").notNull().default(0),
    contextBreakdownJson: text("context_breakdown_json"),
    compacted: integer("compacted", { mode: "boolean" }).notNull().default(false),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
  },
  (t) => [index("turns_session_idx").on(t.sessionId)],
);

export const spans = sqliteTable(
  "spans",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    turnId: text("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "cascade" }),
    parentSpanId: text("parent_span_id"),
    spanType: text("span_type", {
      enum: ["llm", "thinking", "read", "edit", "bash", "mcp", "subagent", "compaction", "override"],
    }).notNull(),
    name: text("name").notNull(),
    filePath: text("file_path"),
    status: text("status", { enum: ["running", "paused", "ok", "error", "denied", "edited"] })
      .notNull()
      .default("running"),
    inputJson: text("input_json"),
    outputJson: text("output_json"),
    diffText: text("diff_text"),
    /** Full streamed text (thinking, model text, stdout), for search. */
    textContent: text("text_content"),
    errorMessage: text("error_message"),
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    latencyMs: integer("latency_ms"),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
  },
  (t) => [index("spans_session_idx").on(t.sessionId), index("spans_parent_idx").on(t.parentSpanId)],
);

export const creditLedger = sqliteTable("credit_ledger", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
  entryType: text("entry_type", { enum: ["deposit", "debit", "adjustment"] }).notNull(),
  amountMicroUsd: integer("amount_micro_usd").notNull(),
  balanceAfterMicroUsd: integer("balance_after_micro_usd").notNull(),
  note: text("note"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const policyAuditLog = sqliteTable("policy_audit_log", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  spanId: text("span_id")
    .notNull()
    .references(() => spans.id, { onDelete: "cascade" }),
  toolName: text("tool_name").notNull(),
  matchedRule: text("matched_rule").notNull(),
  decision: text("decision", { enum: ["approved", "edited", "denied", "auto_blocked"] }).notNull(),
  originalInputJson: text("original_input_json"),
  finalInputJson: text("final_input_json"),
  operatorNote: text("operator_note"),
  createdAt: integer("created_at").notNull(),
});

/**
 * The raw VisorEvent stream, append-only, so any past session replays
 * exactly as it streamed (the tables above are its queryable projection).
 */
export const sessionEvents = sqliteTable(
  "session_events",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    eventJson: text("event_json").notNull(),
    at: integer("at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.seq] })],
);
