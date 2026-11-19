"use client";

import type { ReactNode } from "react";
import {
  ArrowUp,
  ChevronRight,
  FilePen,
  FileText,
  Plus,
  Search,
  ShieldAlert,
  SquareTerminal,
} from "lucide-react";
import { Bar, Collapse, Count, Stage, Stream, Window, type Act } from "@/kit";
import "./hero-demo.css";

// The V.I.S.O.R. app answering one prompt. Beats: the prompt lands; the agent
// thinks; spans stream in one by one while the cost pill ticks; a risky
// `git push --force` trips a breakpoint and the run pauses on an amber card;
// the cursor denies it with steering, and the agent recovers with a safe push.
//
// Real strings: the prompt, the span rows, the breakpoint, the cost. The
// sidebar's older sessions and the earlier turn are placeholder.

const PROMPT = "Fix the flaky auth test and get CI green.";
const ANSWER =
  "The session test raced the token refresh. I awaited the refresh, pinned the clock, and the suite now passes 50 out of 50 runs.";
const ANSWER_WORDS = ANSWER.split(" ").length;

type Span = {
  icon: ReactNode;
  verb: string;
  target: string;
  meta?: ReactNode;
  tone?: "violet";
};

const SPANS: Span[] = [
  { icon: <FileText size={14} />, verb: "Read", target: "src/auth/session.ts", meta: <span className="vh-dim">212 lines</span> },
  { icon: <Search size={14} />, verb: "Grep", target: "refreshToken(", meta: <span className="vh-dim">6 matches</span> },
  {
    icon: <FilePen size={14} />,
    verb: "Edit",
    target: "src/auth/session.ts",
    meta: (
      <span className="vh-delta">
        <i>+4</i> <b>−2</b>
      </span>
    ),
  },
  { icon: <SquareTerminal size={14} />, verb: "Bash", target: "pnpm test auth", meta: <span className="vh-ok">50 passed</span> },
];

type Phase = "idle" | "sent" | "thinking" | "spans" | "paused" | "denied" | "done";

type S = {
  phase: Phase;
  spans: number;
  cost: number; // micro-dollars
  pressed: boolean;
  words: number;
};

const initial: S = { phase: "idle", spans: 0, cost: 0, pressed: false, words: 0 };
const poster: S = { phase: "paused", spans: 4, cost: 41_870, pressed: false, words: 0 };

const COST_STEPS = [8_420, 17_960, 29_310, 41_870];

async function script(a: Act<S>) {
  await a.wait(600);
  a.mark("prompt");
  a.put({ phase: "sent" });
  await a.wait(700);
  a.put({ phase: "thinking" });
  await a.wait(1300);
  a.mark("spans");
  a.put({ phase: "spans" });
  for (let i = 0; i < SPANS.length; i++) {
    a.put({ spans: i + 1, cost: COST_STEPS[i] });
    await a.wait(i === 2 ? 900 : 650);
  }
  await a.wait(400);
  a.mark("breakpoint");
  a.put({ phase: "paused" });
  await a.wait(1600);
  await a.move("deny");
  await a.wait(250);
  a.put({ pressed: true });
  await a.click("deny");
  a.mark("denied");
  a.put({ phase: "denied", pressed: false });
  await a.wait(1100);
  a.put({ phase: "done", cost: 46_210 });
  for (let i = 1; i <= ANSWER_WORDS; i++) {
    a.put({ words: i });
    await a.wait(38);
  }
  await a.wait(3200);
}

const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`;

export function HeroDemo() {
  return (
    <Stage<S>
      width={1040}
      height={600}
      compact={{ below: 760, width: 358, height: 620 }}
      theme="dark"
      initial={initial}
      poster={poster}
      script={script}
      play="once"
      cursor={{ at: { wide: { x: 980, y: 560 }, compact: { x: 330, y: 600 } }, style: "real" }}
      className="vh"
    >
      {(s, _rect, layout) => (
        <Window
          className="vh-win"
          sidebarWidth={220}
          sidebar={layout === "compact" ? undefined : <Sidebar />}
          title="Fix flaky auth test"
          toolbar={
            layout === "wide" ? (
              <span className="vh-pills">
                <span className="vh-pill vh-pill--cache">94% cache hit</span>
                <span className="vh-pill vh-pill--cost">
                  <Count value={s.cost} format={usd} />
                </span>
              </span>
            ) : undefined
          }
        >
          <div className="vh-main">

            <div className="vh-thread">
              <div className="vh-past">
                <Bar w={220} h={30} r={15} tone={1} className="vh-past-q" />
                <Bar w="78%" h={7} r={4} tone={2} />
                <Bar w="56%" h={7} r={4} tone={2} />
              </div>

              <Collapse open={s.phase !== "idle"} reveal="drop" from="below">
                <div className="vh-q">
                  <span>{PROMPT}</span>
                </div>
              </Collapse>

              <Collapse open={s.phase === "thinking"}>
                <div className="vh-thinking">Thinking…</div>
              </Collapse>

              <Collapse open={s.spans > 0}>
                <div className="vh-thought">
                  Thought for 4.2s <ChevronRight size={13} />
                </div>
              </Collapse>

              <div className="vh-spans">
                {SPANS.map((sp, i) => (
                  <Collapse key={sp.verb + i} open={s.spans > i}>
                    <Row span={sp} />
                  </Collapse>
                ))}
              </div>

              <Collapse open={s.phase === "paused" || s.phase === "denied"} reveal="drop">
                <Breakpoint denied={s.phase === "denied"} pressed={s.pressed} />
              </Collapse>

              <Collapse open={s.phase === "done"}>
                <div className="vh-recover">
                  <Row
                    span={{
                      icon: <SquareTerminal size={14} />,
                      verb: "Bash",
                      target: "git push origin fix/auth-flake",
                      meta: <span className="vh-ok">ok</span>,
                    }}
                  />
                  <Stream className="vh-answer" text={ANSWER} count={s.words} />
                </div>
              </Collapse>
            </div>

            <Composer compact={layout === "compact"} cost={s.cost} />
          </div>
        </Window>
      )}
    </Stage>
  );
}

function Row({ span }: { span: Span }) {
  return (
    <div className="vh-row">
      <span className="vh-ico">{span.icon}</span>
      <span className="vh-verb">{span.verb}</span>
      <span className="vh-sep">·</span>
      <span className="vh-target">{span.target}</span>
      {span.meta && <span className="vh-meta">{span.meta}</span>}
    </div>
  );
}

function Breakpoint({ denied, pressed }: { denied: boolean; pressed: boolean }) {
  return (
    <div className="vh-bp" data-denied={denied || undefined}>
      <div className="vh-bp-head">
        <ShieldAlert size={14} />
        <span className="vh-bp-state">{denied ? "Denied with steering" : "Paused before Bash"}</span>
        <span className="vh-bp-rule">rule: destructive-git</span>
      </div>
      <code className="vh-bp-cmd">git push --force origin main</code>
      <div className="vh-bp-foot">
        {denied ? (
          <span className="vh-bp-note">“Never force-push main. Push to a branch instead.”</span>
        ) : (
          <>
            <span className="vh-btn vh-btn--ok">
              Approve <kbd>A</kbd>
            </span>
            <span className="vh-btn">
              Edit JSON <kbd>E</kbd>
            </span>
            <span className="vh-btn vh-btn--deny" data-target="deny" data-cursor="pointer" data-pressed={pressed || undefined}>
              Deny <kbd>D</kbd>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function Composer({ compact, cost }: { compact: boolean; cost: number }) {
  return (
    <div className="vh-composer">
      <span className="vh-placeholder">Describe a task, / commands, @ files</span>
      <div className="vh-composer-row">
        <span className="vh-round">
          <Plus size={14} />
        </span>
        {!compact && <span className="vh-chip">Cap $5.00</span>}
        {compact && (
          <span className="vh-chip vh-chip--cost">
            <Count value={cost} format={usd} />
          </span>
        )}
        <span className="vh-model">
          Opus 5.5 <span className="vh-dim">Medium</span>
        </span>
        <span className="vh-send">
          <ArrowUp size={15} />
        </span>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <nav className="vh-side">
      <span className="vh-new">
        <Plus size={14} /> New session
      </span>
      <div className="vh-group">visor-devtools</div>
      <span className="vh-session" data-active>
        <i className="vh-dot vh-dot--live" />
        Fix flaky auth test
      </span>
      <span className="vh-session">
        <i className="vh-dot" />
        Pricing registry
      </span>
      {[92, 74, 108].map((w, i) => (
        <span key={i} className="vh-session vh-session--filler">
          <Bar w={w} h={6} tone={2} />
        </span>
      ))}
      <div className="vh-group">MCP servers</div>
      {["filesystem", "github", "postgres"].map((n, i) => (
        <span key={n} className="vh-mcp">
          <i className={i === 2 ? "vh-dot vh-dot--off" : "vh-dot vh-dot--on"} />
          {n}
        </span>
      ))}
      <div className="vh-wallet">
        <span className="vh-dim">Credit left</span>
        <span className="vh-wallet-amt">$14.82</span>
      </div>
    </nav>
  );
}
