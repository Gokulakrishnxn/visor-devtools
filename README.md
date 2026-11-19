# V.I.S.O.R.

**V.I.S.O.R.** (Verified Inspection, Spans, Overrides & Runtime) — A CLI harness and live debugger for Claude with span-level tracing, mid-flight overrides, and real-money cost control.

> X-ray vision for AI coding agents. See every thinking step and tool call live, pause or edit risky actions before they run, and track the exact tokens and dollars spent on every prompt.

| Letter | Pillar | What it means |
| --- | --- | --- |
| **V** | Verified | Exact token counts, prompt-cache savings and real USD cost per prompt — no estimates. |
| **I** | Inspection | Live reasoning blocks, context-window usage and raw tool inputs/outputs as they happen. |
| **S** | Spans | Every prompt becomes a nested tree of timed spans: model calls, MCP tools, subagents. |
| **O** | Overrides | Freeze the agent mid-flight, edit tool JSON before it runs, enforce hard budget caps. |
| **R** | Runtime | The harness itself drives the agent loop, tool execution and guardrails. |

## Status

**Phase 2 is done: the official interface is chosen.** It's a calm, conversation-first harness: a gray source-list sidebar (sessions grouped by workspace folder, Overrides & rules, MCP servers, Credit ledger), a centered chat where each turn folds into "Thought for 6.5s · 7 steps · $0.09", a compact step list (`Read · path`, `Edit · path +3 −2`, nested subagents), file cards that open a **Review · turn N** diff panel, and a rounded composer with permission-mode, model + effort and budget-cap chips. A right-hand Inspector holds Context (7 categories + compaction), Payload, the micro-dollar Cost receipt, and a span Timeline with replay. Approve / Edit JSON / Deny breakpoints appear inline, with A/E/D, J/K and ⌘K shortcuts.

Next is Phase 3: wiring this GUI to the real Claude Agent SDK. See the [roadmap](site/src/app/docs/roadmap/page.mdx).

## Run it locally

You need Node.js 20.19+ and pnpm.

```bash
pnpm install
pnpm dev
```

Then open the URL the daemon prints (`http://127.0.0.1:5173/?token=…`). A mock session starts automatically; type a prompt to start another. Everything runs on the mock runtime: no API key, no spend.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Daemon on `127.0.0.1:4310` + GUI on `:5173` |
| `pnpm test` | Unit and integration tests (Vitest, mock runtime only) |
| `pnpm typecheck` / `pnpm lint` | Strict TypeScript and ESLint |
| `pnpm build` | GUI bundle (`dist/web`) + `vhud` CLI (`dist/cli.js`) |
| `node dist/cli.js` | What `npx visor-devtools` will run |
| `node dist/cli.js doctor` | Checks API key, `~/.visor` permissions, SQLite WAL |
| `pnpm site:dev` | The landing page and docs at `:3000` |

Set `VISOR_DB=/some/path/traces.db` to keep traces somewhere other than `~/.visor/`.

### Live runs (real Claude, real money)

By default everything runs on the free mock runtime. To drive the real **Claude Agent SDK**, opt in explicitly:

```bash
VISOR_RUNTIME=claude pnpm dev      # dev
node dist/cli.js --live --cap 5    # built CLI, hard $5.00 cap
```

You need Claude credentials (`ANTHROPIC_API_KEY`, or a profile from `ant auth login`). In live mode:

- Every tool call goes through V.I.S.O.R.'s `PreToolUse` hook first: secrets are blocked, risky commands pause for Approve / Edit JSON / Deny, and a denial's steering note is sent back to Claude.
- `--cap` is enforced twice: the SDK's `maxBudgetUsd` and V.I.S.O.R.'s own watchdog.
- The session's cost is reconciled against the SDK's `total_cost_usd`.
- `.visor.json` in the workspace adds your own rules, default model / effort / budget, and MCP servers.
- Nothing starts on its own; a run begins when you send a prompt.
- **Prepaid credit:** open the wallet (bottom of the sidebar) to add credit or set a balance. Once credit is set, a live run's cap shrinks to what's left, and a run is refused at $0. Each live session is debited when it ends; any difference from the SDK's `total_cost_usd` is booked as a visible adjustment. Export the ledger as CSV any time. Mock runs never use credit.
- **Pause switches:** in *Overrides & rules* (or the composer's permission chip) pause before every shell command, file edit, or MCP write. Secrets stay blocked and destructive commands still pause either way. `.visor.json` `pause` sets their defaults.
- **Triggers:** `.visor.json` `triggers` raise alerts or block by regex on file paths, commands and URLs, and warn when one call sends more than N prompt tokens. Alerts show under the step that caused them, and as desktop notifications if you turn those on.
- **Real context and thinking:** live runs ask the SDK for its actual context report at the end of each turn (system prompt + CLAUDE.md, tool and MCP schemas, messages) and use its real thinking-token counts; estimates are only a fallback.
- **Per-agent totals:** each subagent shows its own steps, tokens, time and cost in the step list and the Inspector's Cost tab.
- **Search everything:** ⌘K searches every saved session (file paths, thinking, outputs, errors, prompts) and jumps straight to the step.
- **Audit log:** every Approve / Edit JSON / Deny / auto-block is recorded with the original and final payload and your note, across sessions.
- **Caps in `.visor.json`:** `budget.sessionCapUsd` is the default cap, `budget.turnCapUsd` stops any single turn that goes over.

## Project layout

```text
src/
├── shared/            # VisorEvent (zod), micro-dollar money, pricing types
├── server/
│   ├── app.ts         # Hono REST API (per-launch token)
│   ├── server.ts      # daemon: 127.0.0.1:4310 + WebSocket stream
│   ├── runtime/       # AgentRuntimeAdapter, MockRuntimeAdapter, SessionRunner
│   ├── interceptor/   # policy rules, breakpoint queue, budget watchdog
│   ├── telemetry/     # pricing registry, cost + dedup, context, span tree
│   └── db/            # Drizzle schema, WAL client (0700/0600), recorder
├── web/               # Vite + React 19 + Tailwind v4 GUI (shadcn/ui conventions)
└── cli.ts             # vhud / npx visor-devtools
tests/                 # Vitest suites
drizzle/               # generated SQL migrations
site/                  # Next.js landing page + docs
electron/              # macOS shell (Milestone 3.5)
```

## License

V.I.S.O.R. is open source under the [MIT License](LICENSE).

Copyright (c) 2026 Gokulakrishnan. You can use, copy, modify and distribute this code, including commercially, as long as the copyright notice and license text are kept. The software comes with no warranty.

### Third-party code

| Component | Used for | License |
| --- | --- | --- |
| [Stageshow](https://github.com/benjitaylor/skills) kit (`site/src/kit`) | Animated product demos on the landing page | MIT |
| [Rail TOC](https://github.com/swamimalode07/rare-ui) (`site/src/components/ui/rail-toc.tsx`) | Docs "On this page" sidebar | See upstream repository |
| [Simple Icons](https://simpleicons.org) | GitHub, Claude and Gemini marks | CC0 (brand marks remain trademarks of their owners) |

Claude is a trademark of Anthropic. Gemini is a trademark of Google. V.I.S.O.R. is an independent project and is not affiliated with or endorsed by either company.
