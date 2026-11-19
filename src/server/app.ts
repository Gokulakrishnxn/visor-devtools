import { timingSafeEqual } from "node:crypto";
import { Hono, type MiddlewareHandler } from "hono";
import { ulid } from "ulid";
import { z } from "zod";
import { Effort, OverrideDecision, type VisorEvent } from "@shared/events";
import { parseUsd } from "@shared/money";
import type { SessionRunner } from "./runtime/session-runner";

export type AppDeps = {
  runner: SessionRunner;
  /** Per-launch secret; every API call must present it (PRD invariant 5). */
  token: string;
  workspacePath: string;
  defaultModel?: string;
};

const StartSession = z.object({
  prompt: z.string().max(20_000).default(""),
  modelId: z.string().optional(),
  effort: Effort.default("medium"),
  /** Dollars as text, e.g. "5" or "0.25"; converted to integer µUSD. */
  capUsd: z.string().optional(),
});

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function tokenFrom(header: string | undefined, query: string | undefined): string {
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return query ?? "";
}

export function requireToken(token: string): MiddlewareHandler {
  return async (c, next) => {
    const presented = tokenFrom(c.req.header("authorization"), c.req.query("token"));
    if (!sameToken(presented, token)) return c.json({ error: "unauthorized" }, 401);
    await next();
  };
}

/** The REST half of the daemon. WebSockets are attached in server.ts. */
export function createApp({ runner, token, workspacePath, defaultModel = "claude-opus-5-5" }: AppDeps) {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true, name: "visor-devtools", runtime: "local" }));

  const api = new Hono();
  api.use("*", requireToken(token));

  api.post("/sessions", async (c) => {
    const body = StartSession.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400);
    const { prompt, modelId, effort, capUsd } = body.data;
    let cap: number | null;
    try {
      cap = capUsd ? parseUsd(capUsd) : null;
    } catch {
      return c.json({ error: "capUsd must be a dollar amount like 5 or 0.25" }, 400);
    }
    const sessionId = ulid();
    // Fire and forget: progress streams over the WebSocket
    runner
      .run({ sessionId, prompt, workspacePath, modelId: modelId ?? defaultModel, effort, budgetCapMicroUsd: cap })
      .catch((err: unknown) => console.error(`[visor] session ${sessionId} failed:`, err));
    return c.json({ sessionId }, 202);
  });

  api.get("/sessions/:id/events", (c) => c.json({ events: runner.events(c.req.param("id")) satisfies VisorEvent[] }));

  api.post("/sessions/:id/stop", (c) => {
    runner.stop(c.req.param("id"));
    return c.json({ ok: true });
  });

  api.get("/breakpoints", (c) => c.json({ pending: runner.breakpoints.list(c.req.query("sessionId")) }));

  api.post("/breakpoints/:spanId", async (c) => {
    const body = OverrideDecision.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid decision", issues: body.error.issues }, 400);
    const ok = runner.resolveBreakpoint(c.req.param("spanId"), body.data);
    return ok ? c.json({ ok: true }) : c.json({ error: "no paused call on that span" }, 404);
  });

  app.route("/api", api);
  return app;
}
