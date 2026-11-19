import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Effort } from "@shared/events";
import { parseUsd } from "@shared/money";
import { PauseToggles, PolicyRule } from "./interceptor/policy";
import { Trigger } from "./interceptor/triggers";

const usd = z.union([z.string(), z.number()]).transform((v) => parseUsd(v));

/** `.visor.json` at the workspace root (see `.visor.example.json`). Unknown keys are ignored. */
export const VisorConfig = z
  .object({
    model: z.string().default("claude-opus-5-5"),
    effort: Effort.default("medium"),
    budget: z
      .object({ sessionCapUsd: usd.optional(), turnCapUsd: usd.optional() })
      .default({}),
    breakpoints: z.array(PolicyRule).default([]),
    // Defaults for the GUI's "pause before…" switches
    pause: PauseToggles.default({ bash: false, edits: false, mcpWrites: false }),
    triggers: z.array(Trigger).default([]),
    // Passed straight to the Agent SDK's `mcpServers` option
    mcpServers: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  })
  .passthrough();
export type VisorConfig = z.infer<typeof VisorConfig>;

export type LoadedConfig = { config: VisorConfig; path: string | null; error: string | null };

export function loadConfig(workspacePath: string): LoadedConfig {
  const path = join(workspacePath, ".visor.json");
  if (!existsSync(path)) return { config: VisorConfig.parse({}), path: null, error: null };
  try {
    return { config: VisorConfig.parse(JSON.parse(readFileSync(path, "utf8"))), path, error: null };
  } catch (err) {
    // A broken config must not silently drop the user's rules: report it, keep defaults
    return { config: VisorConfig.parse({}), path, error: (err as Error).message };
  }
}

export type RuntimeKind = "mock" | "claude";

/** Live runs are opt-in: `vhud --live` or VISOR_RUNTIME=claude. Everything else is the free mock. */
export function resolveRuntime(flag?: string, env = process.env.VISOR_RUNTIME): RuntimeKind {
  const v = (flag ?? env ?? "mock").toLowerCase();
  return v === "claude" || v === "live" ? "claude" : "mock";
}
