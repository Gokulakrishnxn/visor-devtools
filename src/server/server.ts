import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { serve, type ServerType } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { VisorEvent } from "@shared/events";
import { createApp, requireToken } from "./app";
import { openDatabase } from "./db/client";
import { TraceRecorder } from "./db/recorder";
import { MockRuntimeAdapter } from "./runtime/mock-adapter";
import { ClaudeSdkAdapter } from "./runtime/claude-sdk-adapter";
import { TraceStore } from "./db/queries";
import { Wallet } from "./wallet";
import { loadConfig, resolveRuntime, type RuntimeKind } from "./config";
import { SessionRunner } from "./runtime/session-runner";
import { PolicyEngine } from "./interceptor/policy";
import { TriggerEngine } from "./interceptor/triggers";
import { PricingRegistry } from "./telemetry/pricing";

export const DEFAULT_PORT = 4310;
/** The daemon only ever listens on loopback (PRD invariant 5). */
export const HOST = "127.0.0.1";

export type StartOptions = {
  port?: number;
  token?: string;
  workspacePath?: string;
  dbPath?: string;
  /** Built GUI to serve (dist/web). In dev, Vite serves it instead. */
  staticDir?: string;
  /** Mock speed multiplier: 1 is real time. */
  mockSpeed?: number;
  /** "claude" runs the real Agent SDK (spends money); default "mock". */
  runtime?: RuntimeKind;
};

export type RunningDaemon = { server: ServerType; url: string; token: string; runner: SessionRunner; runtime: RuntimeKind; close: () => Promise<void> };

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

export function startDaemon(opts: StartOptions = {}): RunningDaemon {
  const token = opts.token ?? randomBytes(24).toString("base64url");
  const port = opts.port ?? DEFAULT_PORT;
  const pricing = PricingRegistry.load();
  const workspacePath = opts.workspacePath ?? process.cwd();
  const { config, path: configPath, error: configError } = loadConfig(workspacePath);
  if (configError) console.error(`[visor] .visor.json is invalid, using defaults: ${configError}`);
  const runtime = opts.runtime ?? resolveRuntime();
  const adapter =
    runtime === "claude"
      ? new ClaudeSdkAdapter({ pricing, mcpServers: config.mcpServers as never })
      : new MockRuntimeAdapter({ speed: opts.mockSpeed ?? 1, pricing });
  const runner = new SessionRunner({
    adapter,
    policy: new PolicyEngine(config.breakpoints, config.pause),
    triggers: new TriggerEngine(config.triggers),
    turnCapMicroUsd: config.budget.turnCapUsd ?? null,
    pricing,
    validate: true,
  });

  const db = openDatabase(opts.dbPath);
  const recorder = new TraceRecorder(db);
  runner.subscribe((e) => recorder.record(e));
  // Only live runs spend real money, so only they debit the prepaid wallet
  const wallet = new Wallet(db, runtime === "claude");
  const titles = new Map<string, string>();
  runner.subscribe((e) => {
    if (e.type === "session.started") titles.set(e.sessionId, e.title);
    wallet.onEvent(e, titles.get(e.sessionId));
  });

  const app = createApp({
    runner,
    token,
    workspacePath,
    defaultModel: config.model,
    defaultEffort: config.effort,
    store: new TraceStore(db),
    wallet,
    defaultCapMicroUsd: config.budget.sessionCapUsd ?? null,
    info: { runtime, configPath, configError, mcpServers: Object.keys(config.mcpServers), rules: config.breakpoints.length, triggers: config.triggers.length },
  });
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  // Live VisorEvent stream. Clients authenticate with ?token= (browsers can't set WS headers).
  app.get(
    "/ws",
    requireToken(token),
    upgradeWebSocket(() => {
      let off: (() => void) | undefined;
      return {
        onOpen(_evt, ws) {
          off = runner.subscribe((e: VisorEvent) => ws.send(JSON.stringify(e)));
        },
        onClose() {
          off?.();
        },
      };
    }),
  );

  if (opts.staticDir && existsSync(opts.staticDir)) {
    const root = opts.staticDir;
    app.get("*", (c) => {
      const rel = normalize(c.req.path).replace(/^(\.\.[/\\])+/, "");
      let file = join(root, rel);
      if (!file.startsWith(root) || !existsSync(file) || !extname(file)) file = join(root, "index.html");
      return c.body(readFileSync(file), 200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    });
  }

  const server = serve({ fetch: app.fetch, port, hostname: HOST });
  injectWebSocket(server);

  return {
    server,
    url: `http://${HOST}:${port}`,
    token,
    runner,
    runtime,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          db.$client.close();
          resolve();
        });
      }),
  };
}
