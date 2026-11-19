import type { OverrideDecision } from "@shared/events";

export type BreakpointRequest = {
  sessionId: string;
  spanId: string;
  toolName: string;
  rule: string;
  input: Record<string, unknown>;
};

export type PendingBreakpoint = BreakpointRequest & { pausedAt: number };

/**
 * Freezes tool calls mid-flight. `wait()` returns a promise that only settles
 * when the operator approves, edits, or denies from the GUI, or the session
 * is aborted (which denies everything still pending).
 */
export class BreakpointQueue {
  private readonly pending = new Map<string, { req: PendingBreakpoint; resolve: (d: OverrideDecision) => void }>();

  wait(req: BreakpointRequest, now = Date.now()): Promise<OverrideDecision> {
    if (this.pending.has(req.spanId)) throw new Error(`Span ${req.spanId} is already paused`);
    return new Promise((resolve) => {
      this.pending.set(req.spanId, { req: { ...req, pausedAt: now }, resolve });
    });
  }

  /** Returns false when nothing is paused on that span (already resolved or unknown). */
  resolve(spanId: string, decision: OverrideDecision): boolean {
    const entry = this.pending.get(spanId);
    if (!entry) return false;
    this.pending.delete(spanId);
    entry.resolve(decision);
    return true;
  }

  list(sessionId?: string): PendingBreakpoint[] {
    return [...this.pending.values()].map((e) => e.req).filter((r) => !sessionId || r.sessionId === sessionId);
  }

  /** Denies everything paused for a session, e.g. when it hits its budget. */
  abortSession(sessionId: string, note: string): number {
    let n = 0;
    for (const [spanId, e] of this.pending) {
      if (e.req.sessionId !== sessionId) continue;
      this.pending.delete(spanId);
      e.resolve({ decision: "denied", note });
      n++;
    }
    return n;
  }
}
