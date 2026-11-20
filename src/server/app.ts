import { timingSafeEqual } from "node:crypto";
import { Hono, type MiddlewareHandler } from "hono";
import { ulid } from "ulid";
import { z } from "zod";
import { Effort, OverrideDecision, type VisorEvent } from "@shared/events";
import { parseUsd } from "@shared/money";
import type { TraceStore } from "./db/queries";
import type { Wallet } from "./wallet";
import { BUILT_IN_RULES, PauseToggles } from "./interceptor/policy";
import { followUpFrom, type SessionRunner } from "./runtime/session-runner";

export type AppDeps = {
  runner: SessionRunner;
  /** Per-launch secret; every API call must present it (PRD invariant 5). */
  token: string;
  workspacePath: string;
  defaultModel?: string;
  defaultEffort?: "low" | "medium" | "high";
  /** Read side of SQLite: past sessions and offline replay. */
  store?: TraceStore;
  /** What the GUI shows about this daemon (runtime, config status). */
  info?: Record<string, unknown>;
  /** Prepaid credit ledger; limits live runs once credit is set. */
  wallet?: Wallet;
  /** Cap used when a request doesn't name one (from .visor.json). */
  defaultCapMicroUsd?: number | null;
};

const Amount = z.object({ amountUsd: z.string().max(20), note: z.string().max(200).optional() });

const StartSession = z.object({
  prompt: z.string().max(20_000).default(""),
  modelId: z.string().optional(),
  effort: Effort.optional(),
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
export function createApp({ runner, token, workspacePath, defaultModel = "claude-opus-5-5", defaultEffort = "medium", store, info = {}, wallet, defaultCapMicroUsd = null }: AppDeps) {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true, name: "visor-devtools", runtime: "local" }));

  const api = new Hono();
  api.use("*", requireToken(token));

  api.post("/sessions", async (c) => {
    const body = StartSession.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400);
    const { prompt, modelId, effort, capUsd } = body.data;
    let requested: number | null;
    try {
      requested = capUsd ? parseUsd(capUsd) : defaultCapMicroUsd;
    } catch {
      return c.json({ error: "capUsd must be a dollar amount like 5 or 0.25" }, 400);
    }
    // Once you've set credit, a live run can never spend more than what's left
    const { cap, limitedByCredit } = wallet ? wallet.effectiveCap(requested) : { cap: requested, limitedByCredit: false };
    if (cap === 0 && limitedByCredit) return c.json({ error: "No credit left. Add credit in the wallet to start a live run." }, 402);
    const sessionId = ulid();
    // Fire and forget: progress streams over the WebSocket
    runner
      .run({ sessionId, prompt, workspacePath, modelId: modelId ?? defaultModel, effort: effort ?? defaultEffort, budgetCapMicroUsd: cap })
      .catch((err: unknown) => console.error(`[visor] session ${sessionId} failed:`, err));
    return c.json({ sessionId, capMicroUsd: cap, limitedByCredit }, 202);
  });

  // A follow-up message in an existing session: Claude resumes the same conversation
  api.post("/sessions/:id/messages", async (c) => {
    const id = c.req.param("id");
    const body = StartSession.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid request", issues: body.error.issues }, 400);
    if (!body.data.prompt.trim()) return c.json({ error: "Type a message first" }, 400);
    if (runner.isRunning(id)) return c.json({ error: "This session is still running. Wait for it to finish or stop it." }, 409);
    const live = runner.events(id);
    const prior: VisorEvent[] = live.length ? live : (store?.events(id) ?? []);
    const from = followUpFrom(prior);
    if (!from) return c.json({ error: "Session not found" }, 404);
    let requested: number | null;
    try {
      requested = body.data.capUsd ? parseUsd(body.data.capUsd) : defaultCapMicroUsd;
    } catch {
      return c.json({ error: "capUsd must be a dollar amount like 5 or 0.25" }, 400);
    }
    const { cap, limitedByCredit } = wallet ? wallet.effectiveCap(requested) : { cap: requested, limitedByCredit: false };
    if (cap === 0 && limitedByCredit) return c.json({ error: "No credit left. Add credit in the wallet to start a live run." }, 402);
    runner
      .run({
        sessionId: id,
        prompt: body.data.prompt,
        title: from.title,
        workspacePath: from.workspacePath,
        modelId: body.data.modelId ?? from.modelId,
        effort: body.data.effort ?? from.effort,
        budgetCapMicroUsd: cap,
        followUp: from.followUp,
        priorEvents: prior,
      })
      .catch((err: unknown) => console.error(`[visor] session ${id} failed:`, err));
    return c.json({ sessionId: id, capMicroUsd: cap, limitedByCredit }, 202);
  });

  api.patch("/sessions/:id", async (c) => {
    const body = z.object({ title: z.string().trim().min(1).max(200) }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "Give the session a name" }, 400);
    return store?.renameSession(c.req.param("id"), body.data.title) ? c.json({ title: body.data.title }) : c.json({ error: "Session not found" }, 404);
  });

  // Delete a session's history (never touches files on disk)
  api.delete("/sessions/:id", (c) => {
    const id = c.req.param("id");
    if (runner.isRunning(id)) return c.json({ error: "Stop this session before deleting it." }, 409);
    const deleted = store?.deleteSessions([id]) ?? 0;
    runner.forget(id);
    return deleted ? c.json({ deleted }) : c.json({ error: "Session not found" }, 404);
  });

  // Delete every session of a workspace folder from V.I.S.O.R. (the folder itself is left alone)
  api.delete("/workspaces", (c) => {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path is required" }, 400);
    const ids = store?.sessionIdsIn(path) ?? [];
    if (ids.some((id) => runner.isRunning(id))) return c.json({ error: "A session in this workspace is still running. Stop it first." }, 409);
    const deleted = store?.deleteSessions(ids) ?? 0;
    ids.forEach((id) => runner.forget(id));
    return c.json({ deleted });
  });

  api.get("/info", (c) => c.json({ workspacePath, defaultModel, defaultEffort, ...info }));

  api.get("/sessions", (c) => c.json({ sessions: store?.listSessions() ?? [] }));

  api.get("/sessions/:id/events", (c) => {
    const id = c.req.param("id");
    const live = runner.events(id);
    const events: VisorEvent[] = live.length ? live : (store?.events(id) ?? []);
    // Show the name it has now, if it was renamed
    const title = store?.titleOf(id);
    return c.json({ events: title ? events.map((e) => (e.type === "session.started" ? { ...e, title } : e)) : events });
  });

  api.post("/sessions/:id/stop", (c) => {
    runner.stop(c.req.param("id"));
    return c.json({ ok: true });
  });

  api.get("/wallet", (c) =>
    c.json(
      wallet
        ? { enabled: true, active: wallet.isActive(), balanceMicroUsd: wallet.balance(), entries: wallet.entries() }
        : { enabled: false, active: false, balanceMicroUsd: 0, entries: [] },
    ),
  );

  const money = async (c: { req: { json: () => Promise<unknown> } }) => {
    const body = Amount.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return { error: "Send { amountUsd: \"20\" }" } as const;
    try {
      return { amount: parseUsd(body.data.amountUsd), note: body.data.note } as const;
    } catch {
      return { error: "amountUsd must be a dollar amount like 20 or 0.50" } as const;
    }
  };

  api.post("/wallet/deposit", async (c) => {
    if (!wallet) return c.json({ error: "wallet unavailable" }, 404);
    const m = await money(c);
    if ("error" in m) return c.json({ error: m.error }, 400);
    try {
      return c.json({ entry: wallet.deposit(m.amount, m.note || undefined), balanceMicroUsd: wallet.balance() });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  api.post("/wallet/balance", async (c) => {
    if (!wallet) return c.json({ error: "wallet unavailable" }, 404);
    const m = await money(c);
    if ("error" in m) return c.json({ error: m.error }, 400);
    try {
      return c.json({ entry: wallet.setBalance(m.amount), balanceMicroUsd: wallet.balance() });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  api.get("/wallet/export.csv", (c) => {
    if (!wallet) return c.text("", 404);
    return c.body(wallet.toCsv(), 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="visor-ledger.csv"',
    });
  });

  api.get("/policy", (c) => c.json({ toggles: runner.policy.getToggles(), builtIn: BUILT_IN_RULES, ...("rules" in info ? { configuredRules: info.rules } : {}) }));

  api.put("/policy", async (c) => {
    const body = PauseToggles.partial().strict().safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Send { bash?, edits?, mcpWrites? } as booleans" }, 400);
    return c.json({ toggles: runner.policy.setToggles(body.data) });
  });

  api.get("/search", (c) => c.json({ hits: store?.search(String(c.req.query("q") ?? "").slice(0, 200)) ?? [] }));

  api.get("/audit", (c) => c.json({ entries: store?.audit() ?? [] }));

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
