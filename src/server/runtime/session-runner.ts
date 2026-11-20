import { ulid } from "ulid";
import { VisorEvent, type OverrideDecision } from "@shared/events";
import { BreakpointQueue } from "../interceptor/breakpoints";
import { BudgetWatchdog } from "../interceptor/budget";
import { PolicyEngine } from "../interceptor/policy";
import { editOutsideWorkspace } from "../interceptor/workspace-guard";
import { TriggerEngine, type TriggerAlert } from "../interceptor/triggers";
import { UsageLedger } from "../telemetry/cost";
import { PricingRegistry } from "../telemetry/pricing";
import type { AgentRuntimeAdapter, FollowUp, RunOptions, ToolUseRequest, ToolUseVerdict } from "./adapter";

/**
 * What a follow-up message needs from a session's event log: its settings,
 * the next turn index, the runtime session to resume and what it spent so far.
 * null when the log has no session.started.
 */
export function followUpFrom(events: VisorEvent[]): { followUp: FollowUp; title: string; workspacePath: string; modelId: string; effort: RunOptions["effort"] } | null {
  const started = events.find((e) => e.type === "session.started");
  if (started?.type !== "session.started") return null;
  let turnIndex = 0;
  let resumeId: string | undefined;
  let priorCostMicroUsd = 0;
  for (const e of events) {
    if (e.type === "turn.started") turnIndex = Math.max(turnIndex, e.turnIndex + 1);
    if (e.type === "turn.ended" && e.runtimeSessionId) resumeId = e.runtimeSessionId;
    if (e.type === "session.ended") priorCostMicroUsd = e.totalCostMicroUsd;
  }
  return {
    followUp: { turnIndex, resumeId, priorCostMicroUsd },
    title: started.title,
    workspacePath: started.workspacePath,
    modelId: started.modelId,
    effort: started.effort,
  };
}

export type Listener = (event: VisorEvent) => void;

export type SessionRunnerDeps = {
  adapter: AgentRuntimeAdapter;
  policy?: PolicyEngine;
  breakpoints?: BreakpointQueue;
  pricing?: PricingRegistry;
  /** Validate every event against the zod schema (on in dev and tests). */
  validate?: boolean;
  now?: () => number;
  /** `.visor.json` notification triggers. */
  triggers?: TriggerEngine;
  /** Hard cap per turn (from .visor.json), on top of the session cap. */
  turnCapMicroUsd?: number | null;
};

/**
 * Layer 2 harness: drives one adapter run, applies policy and budget before
 * every tool call, freezes calls on breakpoints, and fans events out to
 * listeners (WebSocket clients, the SQLite recorder).
 */
export class SessionRunner {
  readonly breakpoints: BreakpointQueue;
  readonly policy: PolicyEngine;
  private readonly triggers: TriggerEngine;
  private readonly pricing: PricingRegistry;
  private readonly listeners = new Set<Listener>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly history = new Map<string, VisorEvent[]>();
  private readonly now: () => number;

  constructor(private readonly deps: SessionRunnerDeps) {
    this.breakpoints = deps.breakpoints ?? new BreakpointQueue();
    this.policy = deps.policy ?? new PolicyEngine();
    this.triggers = deps.triggers ?? new TriggerEngine();
    this.pricing = deps.pricing ?? new PricingRegistry();
    this.now = deps.now ?? Date.now;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Events of a live or finished session, for clients that connect late. */
  events(sessionId: string): VisorEvent[] {
    return this.history.get(sessionId) ?? [];
  }

  /** Drops a finished session's in-memory events (after it is deleted). */
  forget(sessionId: string): void {
    if (!this.controllers.has(sessionId)) this.history.delete(sessionId);
  }

  isRunning(sessionId: string): boolean {
    return this.controllers.has(sessionId);
  }

  private emit(event: VisorEvent) {
    const e = this.deps.validate ? VisorEvent.parse(event) : event;
    const list = this.history.get(e.sessionId) ?? [];
    list.push(e);
    this.history.set(e.sessionId, list);
    for (const l of this.listeners) l(e);
  }

  /** Resolves a paused tool call from the GUI. */
  resolveBreakpoint(spanId: string, decision: OverrideDecision): boolean {
    return this.breakpoints.resolve(spanId, decision);
  }

  stop(sessionId: string): void {
    this.controllers.get(sessionId)?.abort("user");
    this.breakpoints.abortSession(sessionId, "Session stopped by operator");
  }

  /** Runs a session to completion. Resolves with the session's final status. */
  async run(input: Omit<RunOptions, "sessionId"> & { sessionId?: string; priorEvents?: VisorEvent[] }): Promise<VisorEvent[]> {
    const { priorEvents, ...rest } = input;
    const options: RunOptions = { ...rest, sessionId: rest.sessionId ?? ulid() };
    const { sessionId } = options;
    if (this.controllers.has(sessionId)) throw new Error(`Session ${sessionId} is already running`);
    // A follow-up continues the session's log (it may only be on disk after a restart)
    if (priorEvents?.length && !this.history.get(sessionId)?.length) this.history.set(sessionId, [...priorEvents]);
    // Session totals include what earlier messages spent
    const prior = options.followUp?.priorCostMicroUsd ?? 0;
    const controller = new AbortController();
    this.controllers.set(sessionId, controller);
    const watchdog = new BudgetWatchdog(options.budgetCapMicroUsd, this.deps.turnCapMicroUsd ?? null);
    const spend = new UsageLedger();
    let turnSpend = new UsageLedger();
    const priceOf = (id: string) => this.pricing.get(this.pricing.has(id) ? id : options.modelId);
    const spent = () => spend.cost(priceOf).total;
    const turnSpent = () => turnSpend.cost(priceOf).total;

    const alert = (a: TriggerAlert, spanId?: string) =>
      this.emit({ type: "alert", sessionId, level: a.level, title: a.title, detail: a.detail, source: a.trigger, spanId, at: this.now() });

    const abortForBudget = () => {
      if (controller.signal.aborted) return;
      controller.abort("budget");
      this.breakpoints.abortSession(sessionId, "Budget cap reached");
    };

    const onToolUse = async (req: ToolUseRequest): Promise<ToolUseVerdict> => {
      // 1. Hard budget kill-switch, before anything else runs
      if (watchdog.check(spent(), turnSpent()).status === "exceeded") {
        abortForBudget();
        return { decision: "denied", note: "Budget cap reached" };
      }
      // 2. Notification triggers: alerts, and path blocks
      const fired = this.triggers.onToolCall(req.toolName, req.input);
      fired.alerts.forEach((a) => alert(a, req.spanId));
      // 3. Policy rules (built-in protections first), unless a trigger already blocked it
      let verdict: { action: "allow" } | { action: "pause" | "block"; rule: string } = fired.block
        ? { action: "block", rule: fired.block }
        : this.policy.evaluate({ toolName: req.toolName, input: req.input });
      // Built-in: an edit that would land outside the workspace always waits for you
      if (verdict.action === "allow" && editOutsideWorkspace(req.toolName, req.input, options.workspacePath)) {
        verdict = { action: "pause", rule: "outside-workspace" };
      }
      if (verdict.action === "allow") return { decision: "approved", input: req.input };
      if (verdict.action === "block") {
        this.emit({
          type: "breakpoint.resolved",
          sessionId,
          spanId: req.spanId,
          toolName: req.toolName,
          rule: verdict.rule,
          decision: "auto_blocked",
          finalInput: undefined,
          note: `Blocked by built-in or configured rule "${verdict.rule}"`,
          at: this.now(),
        });
        return { decision: "auto_blocked", rule: verdict.rule };
      }
      // 4. Breakpoint: freeze the call until the operator decides
      this.emit({
        type: "breakpoint.paused",
        sessionId,
        spanId: req.spanId,
        toolName: req.toolName,
        rule: verdict.rule,
        input: req.input,
        at: this.now(),
      });
      const decision = await this.breakpoints.wait({ sessionId, spanId: req.spanId, toolName: req.toolName, rule: verdict.rule, input: req.input });
      this.emit({
        type: "breakpoint.resolved",
        sessionId,
        spanId: req.spanId,
        toolName: req.toolName,
        rule: verdict.rule,
        decision: decision.decision,
        finalInput: decision.decision === "edited" ? decision.input : undefined,
        note: decision.decision === "denied" ? decision.note : undefined,
        at: this.now(),
      });
      if (decision.decision === "approved") return { decision: "approved", input: req.input };
      if (decision.decision === "edited") return { decision: "edited", input: decision.input };
      return { decision: "denied", note: decision.note };
    };

    try {
      for await (const event of this.deps.adapter.run(options, { onToolUse, signal: controller.signal })) {
        if (event.type === "turn.started") turnSpend = new UsageLedger();
        let fresh = false;
        if (event.type === "usage") {
          fresh = spend.add(event.messageId, event.modelId, event.usage);
          turnSpend.add(event.messageId, event.modelId, event.usage);
          if (watchdog.check(spent(), turnSpent()).status === "exceeded") abortForBudget();
        }
        this.emit(event.type === "session.ended" && prior ? { ...event, totalCostMicroUsd: event.totalCostMicroUsd + prior } : event);
        if (event.type === "usage" && fresh) this.triggers.onUsage(event.usage).forEach((a) => alert(a, event.spanId));
      }
    } catch (err) {
      this.emit({ type: "session.ended", sessionId, status: "error", totalCostMicroUsd: prior + spent(), at: this.now() });
      throw err;
    } finally {
      this.controllers.delete(sessionId);
    }
    return this.events(sessionId);
  }
}
