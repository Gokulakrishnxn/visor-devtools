import { describe, expect, it } from "vitest";
import { createApp } from "@server/app";
import { MockRuntimeAdapter } from "@server/runtime/mock-adapter";
import { SessionRunner } from "@server/runtime/session-runner";

const token = "test-token-123";
const make = () => {
  const runner = new SessionRunner({ adapter: new MockRuntimeAdapter({ speed: 0 }), validate: true });
  return { runner, app: createApp({ runner, token, workspacePath: "/tmp/acme" }) };
};
const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };

describe("daemon HTTP API", () => {
  it("serves health without a token", async () => {
    const res = await make().app.request("/api/health");
    expect(res.status).toBe(200);
  });

  it("rejects requests without the per-launch token", async () => {
    const { app } = make();
    expect((await app.request("/api/breakpoints")).status).toBe(401);
    expect((await app.request("/api/breakpoints", { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await app.request(`/api/breakpoints?token=${token}`)).status).toBe(200);
  });

  it("starts a mock session and resolves its breakpoint over REST", async () => {
    const { app, runner } = make();
    const paused = new Promise<string>((resolve) => runner.subscribe((e) => e.type === "breakpoint.paused" && resolve(e.spanId)));
    const res = await app.request("/api/sessions", { method: "POST", headers: auth, body: JSON.stringify({ capUsd: "5" }) });
    expect(res.status).toBe(202);
    const { sessionId } = (await res.json()) as { sessionId: string };
    const spanId = await paused;

    const bad = await app.request(`/api/breakpoints/${spanId}`, { method: "POST", headers: auth, body: JSON.stringify({ decision: "maybe" }) });
    expect(bad.status).toBe(400);
    const ok = await app.request(`/api/breakpoints/${spanId}`, { method: "POST", headers: auth, body: JSON.stringify({ decision: "approved" }) });
    expect(ok.status).toBe(200);

    await new Promise<void>((resolve) => runner.subscribe((e) => e.type === "session.ended" && resolve()));
    const events = (await (await app.request(`/api/sessions/${sessionId}/events`, { headers: auth })).json()) as { events: { type: string }[] };
    expect(events.events.at(-1)?.type).toBe("session.ended");
  });

  it("validates the budget cap", async () => {
    const res = await make().app.request("/api/sessions", { method: "POST", headers: auth, body: JSON.stringify({ capUsd: "lots" }) });
    expect(res.status).toBe(400);
  });
});
