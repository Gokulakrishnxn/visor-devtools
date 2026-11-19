"use client";

import type { ReactNode } from "react";
import {
  BookOpen,
  Brain,
  ChevronDown,
  Columns2,
  FilePen,
  FilePlus,
  FileText,
  Network,
  Wrench,
  X,
} from "lucide-react";
import { Collapse, Count, Spinner, Stage, type Act } from "@/kit";
import "./feature-stages.css";

// Five small stageshow scenes for the features bento. Each plays once when
// it scrolls into view and holds its payoff; reduced motion shows the poster.

const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`;
const tokens = (n: number) => `${Math.round(n / 1000)}k`;

/* ------------------------------------------------------------------ */
/* 1. Span stream: spans arrive one at a time, each running, then done */

type Step = { icon: ReactNode; verb: string; target: string; mono?: boolean; delta?: string; tone?: "violet" | "accent" };

const STEPS: Step[] = [
  { icon: <BookOpen size={14} />, verb: "Load skill", target: "release-notes" },
  { icon: <FileText size={14} />, verb: "Read", target: "CHANGELOG.md", mono: true },
  { icon: <Brain size={14} />, verb: "Thinking", target: "Last tag was v0.3.1, so this is a minor bump…", tone: "violet" },
  { icon: <Network size={14} />, verb: "Subagent", target: "explore · 3 spans · $0.0031", tone: "violet" },
  { icon: <Wrench size={14} />, verb: "MCP", target: "github · list_pull_requests", tone: "accent" },
  { icon: <FilePlus size={14} />, verb: "Write", target: "docs/releases/v0.4.0.md", mono: true, delta: "+48 −0" },
  { icon: <FilePen size={14} />, verb: "Edit", target: "package.json", mono: true, delta: "+1 −1" },
];

type SpanS = { sent: boolean; shown: number; done: boolean };

async function spanScript(a: Act<SpanS>) {
  await a.wait(500);
  a.put({ sent: true });
  await a.wait(700);
  for (let i = 1; i <= STEPS.length; i++) {
    a.put({ shown: i });
    await a.wait(i === 3 || i === 4 ? 900 : 560);
  }
  a.put({ done: true });
  await a.wait(2000);
}

export function SpanStage() {
  return (
    <Stage<SpanS>
      width={520}
      height={360}
      theme="dark"
      initial={{ sent: false, shown: 0, done: false }}
      poster={{ sent: true, shown: STEPS.length, done: true }}
      script={spanScript}
      play="once"
      className="fs"
    >
      {(s) => (
        <div className="fs-spans">
          <Collapse open={s.sent} reveal="drop" from="below">
            <div className="fs-q">
              <span>Draft the v0.4 release notes.</span>
            </div>
          </Collapse>
          <div className="fs-head" data-on={s.shown > 0 || undefined}>
            <span className="fs-head-mark">{s.done ? <i className="fs-done-dot" /> : <Spinner size={12} />}</span>
            <span>{s.done ? "Done" : "Working"}</span>
            <span className="fs-dim">·</span>
            <Count value={s.shown} />
            <span>spans</span>
            <ChevronDown size={13} className="fs-dim" />
          </div>
          <div className="fs-list">
            {STEPS.map((st, i) => {
              const running = s.shown === i + 1 && !s.done;
              return (
                <Collapse key={st.verb} open={s.shown > i}>
                  <div className="fs-row">
                    <span className={`fs-ico ${st.tone ? `fs-${st.tone}` : ""}`}>
                      <span className="fs-ico-cell" data-running={running || undefined}>
                        <Spinner size={13} className="fs-ico-spin" />
                        <span className="fs-ico-glyph">{st.icon}</span>
                      </span>
                    </span>
                    <span className={st.tone === "accent" ? "fs-accent" : "fs-verb"}>{st.verb}</span>
                    <span className="fs-dim">·</span>
                    <span className={st.mono ? "fs-target fs-mono" : "fs-target"}>{st.target}</span>
                    {st.delta && <span className="fs-delta">{st.delta}</span>}
                  </div>
                </Collapse>
              );
            })}
          </div>
        </div>
      )}
    </Stage>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Diff: an Edit span applies; removed lines fold away, new ones land */

export type DiffLine = { kind: " " | "+" | "-"; old?: number; new?: number; tokens: { content: string; color?: string }[] };

type DiffS = { applied: number; removedGone: boolean };

export function DiffStage({ lines }: { lines: DiffLine[] }) {
  const adds = lines.filter((l) => l.kind === "+").length;
  const dels = lines.filter((l) => l.kind === "-").length;

  async function script(a: Act<DiffS>) {
    await a.wait(900);
    a.put({ removedGone: true });
    await a.wait(500);
    for (let i = 1; i <= adds; i++) {
      a.put({ applied: i });
      await a.wait(420);
    }
    await a.wait(2000);
  }

  // Each added line's order, so they land one after another
  const addOrder = lines.map((l, i) => lines.slice(0, i + 1).filter((x) => x.kind === "+").length);
  return (
    <Stage<DiffS>
      width={520}
      height={330}
      theme="dark"
      initial={{ applied: 0, removedGone: false }}
      poster={{ applied: adds, removedGone: true }}
      script={script}
      play="once"
      className="fs"
    >
      {(s) => (
        <div className="fs-diff">
          <div className="fs-diff-head">
            <span className="fs-tab">
              Review · turn 3 <X size={12} />
            </span>
            <span className="fs-mono fs-path">src/auth/session.ts</span>
            <span className="fs-counts">
              <span className="fs-add">
                +<Count value={s.applied} />
              </span>
              <span className="fs-del">
                −<Count value={s.removedGone ? dels : 0} />
              </span>
            </span>
            <Columns2 size={14} className="fs-dim" />
          </div>
          <div className="fs-code">
            <div className="fs-hunk">@@ -41,5 +41,6 @@</div>
            {lines.map((l, i) => {
              const row = (
                <div className="fs-line" data-kind={l.kind === "+" ? "add" : l.kind === "-" ? "del" : undefined}>
                  <span className="fs-ln">{l.old ?? ""}</span>
                  <span className="fs-ln">{l.new ?? ""}</span>
                  <span className="fs-sign">{l.kind === " " ? "" : l.kind}</span>
                  <span className="fs-src">
                    {l.tokens.map((t, j) => (
                      <span key={j} style={{ color: t.color }}>
                        {t.content}
                      </span>
                    ))}
                  </span>
                </div>
              );
              if (l.kind === " ") return <div key={i}>{row}</div>;
              if (l.kind === "-")
                return (
                  <div key={i} className="fs-del-wrap" data-gone={s.removedGone || undefined}>
                    {row}
                  </div>
                );
              return (
                <Collapse key={i} open={s.applied >= addOrder[i]}>
                  {row}
                </Collapse>
              );
            })}
          </div>
        </div>
      )}
    </Stage>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Cost receipt: buckets land, the integer µUSD total rolls with them */

const RECEIPT = [
  { label: "Fresh input", tokens: 3_412, micro: 13_648 },
  { label: "Cache write · 5m", tokens: 1_920, micro: 9_600 },
  { label: "Cache read", tokens: 48_210, micro: 9_642 },
  { label: "Output + thinking", tokens: 1_388, micro: 27_760 },
];
const SAVED = 183_198;

type CostS = { rows: number; saved: boolean };

async function costScript(a: Act<CostS>) {
  await a.wait(500);
  for (let i = 1; i <= RECEIPT.length; i++) {
    a.put({ rows: i });
    await a.wait(750);
  }
  a.put({ saved: true });
  await a.wait(2000);
}

export function CostStage() {
  return (
    <Stage<CostS>
      width={330}
      height={270}
      theme="dark"
      initial={{ rows: 0, saved: false }}
      poster={{ rows: RECEIPT.length, saved: true }}
      script={costScript}
      play="once"
      className="fs"
    >
      {(s) => {
        const total = RECEIPT.slice(0, s.rows).reduce((n, r) => n + r.micro, 0);
        return (
          <div className="fs-cost">
            <div className="fs-total">
              <Count value={total} format={usd} />
            </div>
            <div className="fs-saved" data-on={s.saved || undefined}>
              −{usd(SAVED)} saved by prompt cache
            </div>
            <div className="fs-receipt">
              {RECEIPT.map((r, i) => (
                <Collapse key={r.label} open={s.rows > i}>
                  <div className="fs-rrow">
                    <span className="fs-rlabel">{r.label}</span>
                    <span className="fs-dim">{r.tokens.toLocaleString("en-US")}</span>
                    <span className="fs-ramt">{usd(r.micro)}</span>
                  </div>
                </Collapse>
              ))}
            </div>
          </div>
        );
      }}
    </Stage>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Context: seven buckets fill the window, the total rolls up */

const CTX = [
  { name: "Project rules", pct: 6, color: "#7aa2ff" },
  { name: "MCP & tools", pct: 14, color: "#5eead4" },
  { name: "Mentioned files", pct: 9, color: "#fbbf24" },
  { name: "Tool results", pct: 31, color: "#34d399" },
  { name: "Thinking", pct: 12, color: "#a78bfa" },
  { name: "Subagents", pct: 8, color: "#f472b6" },
  { name: "Messages", pct: 20, color: "#94a3b8" },
];
const USED = 412_000;

type CtxS = { filled: number };

async function ctxScript(a: Act<CtxS>) {
  await a.wait(500);
  for (let i = 1; i <= CTX.length; i++) {
    a.put({ filled: i });
    await a.wait(380);
  }
  await a.wait(2000);
}

export function ContextStage() {
  return (
    <Stage<CtxS>
      width={330}
      height={270}
      theme="dark"
      initial={{ filled: 0 }}
      poster={{ filled: CTX.length }}
      script={ctxScript}
      play="once"
      className="fs"
    >
      {(s) => {
        const pct = CTX.slice(0, s.filled).reduce((n, c) => n + c.pct, 0);
        return (
          <div className="fs-ctx">
            <div className="fs-ctx-head">
              <span>
                <Count value={(USED * pct) / 100} format={tokens} /> / 1M tokens
              </span>
              <span className="fs-dim">turn 9</span>
            </div>
            <div className="fs-bar">
              {CTX.map((c, i) => (
                <span
                  key={c.name}
                  className="fs-seg"
                  style={{ width: s.filled > i ? `${c.pct * 0.412}%` : 0, background: c.color }}
                />
              ))}
            </div>
            <ul className="fs-legend">
              {CTX.map((c, i) => (
                <li key={c.name} data-on={s.filled > i || undefined}>
                  <i style={{ background: c.color }} />
                  <span className="fs-lname">{c.name}</span>
                  <span className="fs-dim">{c.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    </Stage>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Waterfall: a playhead sweeps the turn, spans start under it, Bash fails */

const LANES = [
  { name: "turn 3", start: 0, len: 100, tone: "root", depth: 0 },
  { name: "llm", start: 0, len: 22, tone: "accent", depth: 1 },
  { name: "thinking", start: 4, len: 14, tone: "violet", depth: 2 },
  { name: "read", start: 23, len: 6, tone: "emerald", depth: 1 },
  { name: "subagent", start: 30, len: 38, tone: "violet-soft", depth: 1 },
  { name: "mcp", start: 36, len: 18, tone: "accent-soft", depth: 2 },
  { name: "bash", start: 70, len: 24, tone: "rose", depth: 1 },
];

type FallS = { t: number; failed: boolean };

async function fallScript(a: Act<FallS>) {
  await a.wait(500);
  for (let t = 0; t <= 100; t += 4) {
    a.put({ t });
    await a.wait(70);
  }
  a.put({ failed: true });
  await a.wait(2000);
}

export function WaterfallStage() {
  return (
    <Stage<FallS>
      width={330}
      height={270}
      theme="dark"
      initial={{ t: 0, failed: false }}
      poster={{ t: 100, failed: true }}
      script={fallScript}
      play="once"
      className="fs"
    >
      {(s) => (
        <div className="fs-fall">
          {LANES.map((l) => {
            const w = Math.max(0, Math.min(l.len, s.t - l.start));
            return (
              <div key={l.name} className="fs-lane">
                <span className="fs-lname fs-mono" style={{ paddingLeft: l.depth * 9 }}>
                  {l.name}
                </span>
                <span className="fs-track">
                  <span
                    className="fs-span"
                    data-tone={l.tone}
                    data-failed={(l.tone === "rose" && s.failed) || undefined}
                    style={{ left: `${l.start}%`, width: `${w}%` }}
                  />
                </span>
              </div>
            );
          })}
          <div className="fs-axis fs-mono">
            <span>0ms</span>
            <span>2.1s</span>
            <span>4.2s</span>
          </div>
          <span className="fs-playhead" style={{ left: `calc(92px + (100% - 92px) * ${s.t / 100})` }} data-on={(s.t > 0 && s.t < 100) || undefined} />
          <span className="fs-err" data-on={s.failed || undefined}>
            bash · exit 1 · 1.0s
          </span>
        </div>
      )}
    </Stage>
  );
}
