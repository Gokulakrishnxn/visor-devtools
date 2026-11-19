import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { VisorEvent } from "@shared/events";
import { UsageLedger } from "../telemetry/cost";
import type { VisorDb } from "./client";
import { policyAuditLog, sessionEvents, sessions, spans, turns } from "./schema";

const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

/**
 * Persists the live VisorEvent stream to SQLite so every session can be
 * replayed offline. Each event is one small synchronous write (WAL mode).
 */
export class TraceRecorder {
  /** Inputs of paused spans, kept until the breakpoint resolves for the audit log. */
  private readonly paused = new Map<string, { input: unknown }>();
  /** Per-turn token totals, de-duplicated by message ID. */
  private readonly usage = new Map<string, UsageLedger>();

  /** Next sequence number per session for the raw event log. */
  private readonly seq = new Map<string, number>();

  constructor(private readonly db: VisorDb) {}

  private inputOf(spanId: string): unknown {
    const row = this.db.select({ inputJson: spans.inputJson }).from(spans).where(eq(spans.id, spanId)).get();
    return row?.inputJson ? JSON.parse(row.inputJson) : undefined;
  }

  record(e: VisorEvent): void {
    this.project(e);
    // session.started inserts the session row the event log references
    const n = this.seq.get(e.sessionId) ?? 0;
    this.seq.set(e.sessionId, n + 1);
    this.db.insert(sessionEvents).values({ sessionId: e.sessionId, seq: n, type: e.type, eventJson: JSON.stringify(e), at: e.at }).run();
    if (e.type === "session.ended") this.seq.delete(e.sessionId);
  }

  private project(e: VisorEvent): void {
    switch (e.type) {
      case "session.started":
        this.db
          .insert(sessions)
          .values({
            id: e.sessionId,
            workspacePath: e.workspacePath,
            title: e.title,
            modelId: e.modelId,
            effortLevel: e.effort,
            budgetCapMicroUsd: e.budgetCapMicroUsd,
            startedAt: e.at,
          })
          .run();
        break;
      case "turn.started":
        this.db
          .insert(turns)
          .values({ id: e.turnId, sessionId: e.sessionId, turnIndex: e.turnIndex, userPrompt: e.prompt, startedAt: e.at })
          .run();
        break;
      case "span.started":
        this.db
          .insert(spans)
          .values({
            id: e.spanId,
            sessionId: e.sessionId,
            turnId: e.turnId,
            parentSpanId: e.parentSpanId,
            spanType: e.spanType,
            name: e.name,
            filePath: e.filePath ?? null,
            inputJson: json(e.input),
            startedAt: e.at,
          })
          .run();
        break;
      case "span.ended": {
        const row = this.db.select({ startedAt: spans.startedAt }).from(spans).where(eq(spans.id, e.spanId)).get();
        this.db
          .update(spans)
          .set({
            status: e.status,
            outputJson: json(e.output),
            diffText: e.diff ?? null,
            errorMessage: e.error ?? null,
            costMicroUsd: e.costMicroUsd,
            latencyMs: row ? e.at - row.startedAt : null,
            endedAt: e.at,
          })
          .where(eq(spans.id, e.spanId))
          .run();
        break;
      }
      case "breakpoint.paused":
        this.paused.set(e.spanId, { input: e.input });
        this.db.update(spans).set({ status: "paused" }).where(eq(spans.id, e.spanId)).run();
        this.db.update(sessions).set({ status: "paused" }).where(eq(sessions.id, e.sessionId)).run();
        break;
      case "breakpoint.resolved": {
        const p = this.paused.get(e.spanId);
        this.paused.delete(e.spanId);
        this.db
          .insert(policyAuditLog)
          .values({
            id: ulid(),
            sessionId: e.sessionId,
            spanId: e.spanId,
            toolName: e.toolName,
            matchedRule: e.rule,
            decision: e.decision,
            originalInputJson: json(p?.input ?? this.inputOf(e.spanId)),
            finalInputJson: json(e.finalInput),
            operatorNote: e.note ?? null,
            createdAt: e.at,
          })
          .run();
        this.db.update(sessions).set({ status: "running" }).where(eq(sessions.id, e.sessionId)).run();
        break;
      }
      case "turn.ended": {
        const u = this.usage.get(e.turnId)?.totalUsage();
        this.usage.delete(e.turnId);
        this.db
          .update(turns)
          .set({
            inputTokens: u?.inputTokens ?? 0,
            cacheWriteTokens: (u?.cacheWrite5mTokens ?? 0) + (u?.cacheWrite1hTokens ?? 0),
            cacheReadTokens: u?.cacheReadTokens ?? 0,
            outputTokens: u?.outputTokens ?? 0,
            costMicroUsd: e.costMicroUsd,
            cacheSavingsMicroUsd: e.cacheSavingsMicroUsd,
            contextUsedTokens: e.contextUsedTokens,
            contextLimitTokens: e.contextLimitTokens,
            contextBreakdownJson: JSON.stringify(e.contextBreakdown),
            endedAt: e.at,
          })
          .where(eq(turns.id, e.turnId))
          .run();
        break;
      }
      case "session.ended":
        this.db
          .update(sessions)
          .set({ status: e.status, totalCostMicroUsd: e.totalCostMicroUsd, endedAt: e.at })
          .where(eq(sessions.id, e.sessionId))
          .run();
        break;
      case "usage": {
        const ledger = this.usage.get(e.turnId) ?? new UsageLedger();
        ledger.add(e.messageId, e.modelId, e.usage);
        this.usage.set(e.turnId, ledger);
        break;
      }
      case "span.delta":
        // Streamed text lives in the live stream; the final output is stored on span.ended.
        break;
    }
  }
}
