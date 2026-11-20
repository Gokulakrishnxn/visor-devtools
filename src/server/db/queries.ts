import { asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { VisorEvent } from "@shared/events";
import type { VisorDb } from "./client";
import { policyAuditLog, sessionEvents, sessions, spans, turns } from "./schema";

export type SessionSummary = {
  id: string;
  title: string;
  workspacePath: string;
  modelId: string;
  status: string;
  totalCostMicroUsd: number;
  startedAt: number;
  endedAt: number | null;
};

export type SearchHit = {
  sessionId: string;
  sessionTitle: string;
  spanId: string | null;
  kind: string;
  label: string;
  snippet: string;
  at: number;
};

/** Stored JSON payloads read as text: a JSON string becomes its contents, anything else compact JSON. */
function decodeJson(json: string | null): string | null {
  if (json === null) return null;
  try {
    const v: unknown = JSON.parse(json);
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return json;
  }
}

/** Text around the first match, on one line. */
export function snippetAround(text: string, query: string, width = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const i = flat.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return flat.slice(0, width);
  const start = Math.max(0, i - Math.floor((width - query.length) / 2));
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + width)}${start + width < flat.length ? "…" : ""}`;
}

/** Read side of the trace store: the sidebar list and offline replay. */
export class TraceStore {
  constructor(private readonly db: VisorDb) {}

  /**
   * Deletes sessions and everything recorded for them (turns, spans, events,
   * audit rows cascade). Wallet history stays, unlinked. Returns how many.
   */
  deleteSessions(ids: string[]): number {
    if (!ids.length) return 0;
    return this.db.delete(sessions).where(inArray(sessions.id, ids)).run().changes;
  }

  /** IDs of every session recorded in a workspace folder. */
  sessionIdsIn(workspacePath: string): string[] {
    return this.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.workspacePath, workspacePath)).all().map((r) => r.id);
  }

  listSessions(limit = 50): SessionSummary[] {
    return this.db
      .select({
        id: sessions.id,
        title: sessions.title,
        workspacePath: sessions.workspacePath,
        modelId: sessions.modelId,
        status: sessions.status,
        totalCostMicroUsd: sessions.totalCostMicroUsd,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
      })
      .from(sessions)
      .orderBy(desc(sessions.startedAt))
      .limit(limit)
      .all();
  }

  /**
   * Search every stored session: step names, file paths, streamed text
   * (thinking, output), inputs, outputs, errors and prompts.
   */
  search(query: string, limit = 40): SearchHit[] {
    const q = query.trim();
    if (q.length < 2) return [];
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const like = (col: SQL | typeof spans.name) => sql`${col} LIKE ${pattern} ESCAPE '\\'`;
    const spanRows = this.db
      .select({
        sessionId: spans.sessionId,
        sessionTitle: sessions.title,
        spanId: spans.id,
        spanType: spans.spanType,
        name: spans.name,
        filePath: spans.filePath,
        text: spans.textContent,
        input: spans.inputJson,
        output: spans.outputJson,
        error: spans.errorMessage,
        at: spans.startedAt,
      })
      .from(spans)
      .innerJoin(sessions, eq(sessions.id, spans.sessionId))
      .where(or(like(spans.name), like(sql`${spans.filePath}`), like(sql`${spans.textContent}`), like(sql`${spans.inputJson}`), like(sql`${spans.outputJson}`), like(sql`${spans.errorMessage}`)))
      .orderBy(desc(spans.startedAt))
      .limit(limit)
      .all();
    const promptRows = this.db
      .select({ sessionId: turns.sessionId, sessionTitle: sessions.title, prompt: turns.userPrompt, at: turns.startedAt })
      .from(turns)
      .innerJoin(sessions, eq(sessions.id, turns.sessionId))
      .where(like(sql`${turns.userPrompt}`))
      .orderBy(desc(turns.startedAt))
      .limit(10)
      .all();
    const has = (v: string | null) => v !== null && v.toLowerCase().includes(q.toLowerCase());
    return [
      ...promptRows.map((r) => ({ sessionId: r.sessionId, sessionTitle: r.sessionTitle, spanId: null, kind: "prompt", label: "Prompt", snippet: snippetAround(r.prompt, q), at: r.at })),
      ...spanRows.map((r) => {
        const field = [r.error, r.text, r.filePath, r.name, decodeJson(r.output), decodeJson(r.input)].find(has) ?? r.name;
        return { sessionId: r.sessionId, sessionTitle: r.sessionTitle, spanId: r.spanId, kind: r.spanType, label: r.name, snippet: snippetAround(field, q), at: r.at };
      }),
    ].sort((a, b) => b.at - a.at);
  }

  /** Every override decision across sessions, newest first. */
  audit(limit = 100) {
    return this.db
      .select({
        id: policyAuditLog.id,
        sessionId: policyAuditLog.sessionId,
        sessionTitle: sessions.title,
        spanId: policyAuditLog.spanId,
        toolName: policyAuditLog.toolName,
        matchedRule: policyAuditLog.matchedRule,
        decision: policyAuditLog.decision,
        originalInputJson: policyAuditLog.originalInputJson,
        finalInputJson: policyAuditLog.finalInputJson,
        operatorNote: policyAuditLog.operatorNote,
        createdAt: policyAuditLog.createdAt,
      })
      .from(policyAuditLog)
      .leftJoin(sessions, eq(sessions.id, policyAuditLog.sessionId))
      .orderBy(desc(policyAuditLog.createdAt))
      .limit(limit)
      .all();
  }

  /** The exact event stream of a stored session (invalid rows are skipped, never trusted). */
  events(sessionId: string): VisorEvent[] {
    const rows = this.db.select({ json: sessionEvents.eventJson }).from(sessionEvents).where(eq(sessionEvents.sessionId, sessionId)).orderBy(asc(sessionEvents.seq)).all();
    const out: VisorEvent[] = [];
    for (const r of rows) {
      const parsed = VisorEvent.safeParse(JSON.parse(r.json));
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }
}
