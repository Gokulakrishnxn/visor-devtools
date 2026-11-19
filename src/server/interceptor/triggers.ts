import { z } from "zod";
import type { TokenUsage } from "@shared/pricing";

/**
 * Notification triggers (PRD §3, layer 2): `.visor.json` "triggers".
 * - path: a regex tested against the file path / command / URL of a tool call;
 *   "block" denies the call, "notify" lets it run and raises an alert.
 * - tokens: alert when one model call sends more than `above` prompt tokens.
 */
export const Trigger = z.discriminatedUnion("type", [
  z.object({ type: z.literal("path"), pattern: z.string().min(1), action: z.enum(["notify", "block"]).default("notify"), label: z.string().optional() }),
  z.object({ type: z.literal("tokens"), above: z.number().int().positive(), action: z.literal("notify").default("notify"), label: z.string().optional() }),
]);
export type Trigger = z.infer<typeof Trigger>;

export type TriggerAlert = { level: "info" | "warning" | "danger"; title: string; detail: string; trigger: string };
export type ToolTriggerResult = { block: string | null; alerts: TriggerAlert[] };

/** The text a path trigger looks at: file paths, commands, URLs and patterns. */
function targetsOf(input: Record<string, unknown>): string[] {
  return ["file_path", "path", "notebook_path", "command", "url", "pattern"].map((k) => input[k]).filter((v): v is string => typeof v === "string");
}

export class TriggerEngine {
  private readonly triggers: { t: Trigger; re?: RegExp }[];

  constructor(triggers: Trigger[] = []) {
    this.triggers = triggers.map((raw) => {
      const t = Trigger.parse(raw);
      // A bad regex is reported once at load and skipped, not thrown on every call
      if (t.type === "path") {
        try {
          return { t, re: new RegExp(t.pattern, "i") };
        } catch {
          console.error(`[visor] trigger pattern is not a valid regex, skipped: ${t.pattern}`);
          return { t };
        }
      }
      return { t };
    });
  }

  onToolCall(toolName: string, input: Record<string, unknown>): ToolTriggerResult {
    const targets = targetsOf(input);
    const alerts: TriggerAlert[] = [];
    let block: string | null = null;
    for (const { t, re } of this.triggers) {
      if (t.type !== "path" || !re) continue;
      const hit = targets.find((x) => re.test(x));
      if (!hit) continue;
      const name = t.label ?? `path /${t.pattern}/`;
      if (t.action === "block") {
        block ??= `trigger:${name}`;
        alerts.push({ level: "danger", title: `Blocked ${toolName}`, detail: `${hit} matched ${name}`, trigger: name });
      } else {
        alerts.push({ level: "warning", title: `${toolName} touched a watched path`, detail: `${hit} matched ${name}`, trigger: name });
      }
    }
    return { block, alerts };
  }

  onUsage(usage: TokenUsage): TriggerAlert[] {
    const prompt = usage.inputTokens + usage.cacheReadTokens + usage.cacheWrite5mTokens + usage.cacheWrite1hTokens;
    return this.triggers.flatMap(({ t }) =>
      t.type === "tokens" && prompt > t.above
        ? [{ level: "warning" as const, title: "Token alert", detail: `${prompt.toLocaleString("en-US")} prompt tokens in one call (limit ${t.above.toLocaleString("en-US")})`, trigger: t.label ?? `tokens > ${t.above}` }]
        : [],
    );
  }
}
