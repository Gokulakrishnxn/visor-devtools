import type { Effort, OverrideDecision, VisorEvent } from "@shared/events";
import type { MicroUsd } from "@shared/money";

export type RunOptions = {
  sessionId: string;
  prompt: string;
  title?: string;
  workspacePath: string;
  modelId: string;
  effort: Effort;
  budgetCapMicroUsd: MicroUsd | null;
  /** Set when this prompt continues an existing session instead of starting one. */
  followUp?: FollowUp;
};

/** A follow-up message in an existing session. */
export type FollowUp = {
  /** Index of the turn this message starts. */
  turnIndex: number;
  /** The runtime's session to resume, so Claude remembers the conversation. */
  resumeId?: string;
  /** What the session spent before this message. */
  priorCostMicroUsd: MicroUsd;
};

/** A tool call the runtime wants to make; the harness decides if it may run. */
export type ToolUseRequest = {
  sessionId: string;
  turnId: string;
  spanId: string;
  toolName: string;
  input: Record<string, unknown>;
};

export type ToolUseVerdict =
  | { decision: "approved"; input: Record<string, unknown> }
  | { decision: "edited"; input: Record<string, unknown> }
  | { decision: "denied"; note?: string }
  | { decision: "auto_blocked"; rule: string };

export type RuntimeHooks = {
  /**
   * Called before every tool call (the PreToolUse / canUseTool hook).
   * The adapter must not run the tool until this resolves.
   */
  onToolUse(request: ToolUseRequest): Promise<ToolUseVerdict>;
  /** Aborted by the harness (budget cap, user stop). The adapter must end the session. */
  signal: AbortSignal;
};

/**
 * Layer 3 of the architecture. Real runs use ClaudeSdkAdapter (Phase 3);
 * previews and tests use MockRuntimeAdapter, which never spends money.
 */
export interface AgentRuntimeAdapter {
  readonly name: string;
  run(options: RunOptions, hooks: RuntimeHooks): AsyncIterable<VisorEvent>;
}

export type { OverrideDecision };
