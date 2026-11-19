import { ulid } from "ulid";
import { VisorEvent, type OverrideDecision } from "@shared/events";
import { BreakpointQueue } from "../interceptor/breakpoints";
import { BudgetWatchdog } from "../interceptor/budget";
import { PolicyEngine } from "../interceptor/policy";
import { UsageLedger } from "../telemetry/cost";
import { PricingRegistry } from "../telemetry/pricing";
import type { AgentRuntimeAdapter, RunOptions, ToolUseRequest, ToolUseVerdict } from "./adapter";

export type Listener = (event: VisorEvent) => void;

export type SessionRunnerDeps = {
  adapter: AgentRuntimeAdapter;
  policy?: PolicyEngine;
  breakpoints?: BreakpointQueue;
  pricing?: PricingRegistry;
  /** Validate every event against the zod schema (on in dev and tests). */
  validate?: boolean;
  now?: () => number;
};

/**
 * Layer 2 harness: drives one adapter run, applies policy and budget before
 * every tool call, freezes calls on breakpoints, and fans events out to
 * listeners (WebSocket clients, the SQLite recorder).
 */
export class SessionRunner {
  readonly breakpoints: BreakpointQueue;
  private readonly policy: PolicyEngine;
  private readonly pricing: PricingRegistry;
  private readonly listeners = new Set<Listener>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly history = new Map<string, VisorEvent[]>();
  private readonly now: () => number;

  constructor(private readonly deps: SessionRunnerDeps) {
    this.breakpoints = deps.breakpoints ?? new BreakpointQueue();
    this.policy = deps.policy ?? new PolicyEngine();
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
  async run(input: Omit<RunOptions, "sessionId"> & { sessionId?: string }): Promise<VisorEvent[]> {
    const options: RunOptions = { ...input, sessionId: input.sessionId ?? ulid() };
    const { sessionId } = options;
    const controller = new AbortController();
    this.controllers.set(sessionId, controller);
    const watchdog = new BudgetWatchdog(options.budgetCapMicroUsd);
    const spend = new UsageLedger();
    const spent = () => spend.cost((id) => this.pricing.get(id)).total;

    const abortForBudget = () => {
      if (controller.signal.aborted) return;
      controller.abort("budget");
      this.breakpoints.abortSession(sessionId, "Budget cap reached");
    };

    const onToolUse = async (req: ToolUseRequest): Promise<ToolUseVerdict> => {
      // 1. Hard budget kill-switch, before anything else runs
      if (watchdog.check(spent()).status === "exceeded") {
        abortForBudget();
        return { decision: "denied", note: "Budget cap reached" };
      }
      // 2. Policy rules (built-in protections first)
      const verdict = this.policy.evaluate({ toolName: req.toolName, input: req.input });
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
      // 3. Breakpoint: freeze the call until the operator decides
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
        if (event.type === "usage") {
          spend.add(event.messageId, event.modelId, event.usage);
          if (watchdog.check(spent()).status === "exceeded") abortForBudget();
        }
        this.emit(event);
      }
    } catch (err) {
      this.emit({ type: "session.ended", sessionId, status: "error", totalCostMicroUsd: spent(), at: this.now() });
      throw err;
    } finally {
      this.controllers.delete(sessionId);
    }
    return this.events(sessionId);
  }
}
