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
