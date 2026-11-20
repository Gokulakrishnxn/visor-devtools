import { describe, expect, it } from "vitest";
import type { VisorEvent } from "@shared/events";
import { collectSources, safeHref, urlsIn } from "@/lib/sources";
import { deriveTrace } from "@/lib/trace-model";

const S = "s1";
const T = "t1";
let at = 1;
const started = (spanId: string, spanType: string, name: string, parentSpanId: string | null = null, input?: unknown) =>
  ({ type: "span.started", sessionId: S, turnId: T, spanId, parentSpanId, spanType, name, input, at: at++ }) as VisorEvent;
const ended = (spanId: string, output?: unknown) => ({ type: "span.ended", sessionId: S, spanId, status: "ok", output, costMicroUsd: 0, at: at++ }) as VisorEvent;
const delta = (spanId: string, text: string) => ({ type: "span.delta", sessionId: S, spanId, text, at: at++ }) as VisorEvent;

describe("Sources tab", () => {
  it("finds http(s) links in text and refuses other schemes", () => {
    expect(urlsIn("See https://en.wikipedia.org/wiki/Elon_Musk. And (https://spacex.com/about), ok")).toEqual([
      "https://en.wikipedia.org/wiki/Elon_Musk",
      "https://spacex.com/about",
    ]);
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("file:///etc/passwd")).toBeUndefined();
    expect(urlsIn("no links here")).toEqual([]);
  });

  it("lists pages, searches, links, files and MCP tools per agent, deduplicated", () => {
    const events: VisorEvent[] = [
      { type: "session.started", sessionId: S, title: "wiki", workspacePath: "/w", modelId: "claude-opus-5-5", effort: "medium", budgetCapMicroUsd: null, at: at++ },
      { type: "turn.started", sessionId: S, turnId: T, turnIndex: 0, prompt: "build", at: at++ },
      started("search", "read", "elon musk", null, { query: "elon musk biography" }),
      ended("search", "Results: https://en.wikipedia.org/wiki/Elon_Musk https://www.tesla.com/"),
      started("fetch", "read", "wiki", null, { url: "https://en.wikipedia.org/wiki/Elon_Musk" }),
      ended("fetch", "page text"),
      started("agent", "subagent", "researcher", null, { subagent_type: "researcher" }),
      started("fetch2", "read", "spacex", "agent", { url: "https://www.spacex.com/" }),
      ended("fetch2"),
      started("read", "read", "index.html", "agent", { file_path: "index.html" }),
      ended("read"),
      started("gh", "mcp", "github · search_code", null, { q: "x" }),
      ended("gh"),
      started("answer", "llm", "claude-opus-5-5"),
      delta("answer", "Done. Source: https://en.wikipedia.org/wiki/Elon_Musk"),
      ended("answer"),
    ];
    const sources = collectSources(deriveTrace(events));
    const find = (kind: string, label: string) => sources.find((s) => s.kind === kind && s.label === label);

    expect(find("search", "elon musk biography")).toMatchObject({ agents: ["Main agent"] });
    expect(find("web", "https://en.wikipedia.org/wiki/Elon_Musk")).toMatchObject({ uses: 1, spanId: "fetch" });
    expect(find("web", "https://www.spacex.com/")).toMatchObject({ agents: ["researcher"] });
    expect(find("file", "index.html")).toMatchObject({ agents: ["researcher"] });
    expect(find("mcp", "github · search_code")).toBeDefined();
    // The search result and the answer both mention the wiki page: one link, used twice
    expect(find("link", "https://en.wikipedia.org/wiki/Elon_Musk")).toMatchObject({ uses: 2, spanId: "search" });
    expect(find("link", "https://www.tesla.com/")).toBeDefined();
    expect(sources.every((s) => !s.href || s.href.startsWith("http"))).toBe(true);
  });
});

describe("source icons under answers", async () => {
  const { linksIn, hostOf } = await import("@/components/visor/site-icon");
  it("reads Markdown links with their titles, then bare links, without duplicates", () => {
    const md = "Sources:\n- [Fortune – Musk 'not MAGA'](https://fortune.com/2026/11/19/x)\n- [Wiki](https://en.wikipedia.org/wiki/Elon_Musk)\nAlso https://www.npr.org/a. And again https://fortune.com/2026/11/19/x";
    expect(linksIn(md)).toEqual([
      { href: "https://fortune.com/2026/11/19/x", title: "Fortune – Musk 'not MAGA'", host: "fortune.com" },
      { href: "https://en.wikipedia.org/wiki/Elon_Musk", title: "Wiki", host: "en.wikipedia.org" },
      { href: "https://www.npr.org/a", title: "npr.org", host: "npr.org" },
    ]);
    expect(linksIn("[bad](javascript:alert(1))")).toEqual([]);
    expect(hostOf("ftp://x.org")).toBeNull();
  });
});
