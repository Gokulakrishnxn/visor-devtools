import { asc, desc, eq } from "drizzle-orm";
import { VisorEvent } from "@shared/events";
import type { VisorDb } from "./client";
import { sessionEvents, sessions } from "./schema";

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

/** Read side of the trace store: the sidebar list and offline replay. */
export class TraceStore {
  constructor(private readonly db: VisorDb) {}

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
