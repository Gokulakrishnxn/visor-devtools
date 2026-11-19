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

**Phase 2 (design gate) is ready for review.** Three clickable GUI prototypes stream the same live mock session from the local daemon:

| Route | Design | Idea |
| --- | --- | --- |
| `/preview/1` | Studio Tri-Pane | Sessions + MCP sidebar, live stream, tabbed inspector |
| `/preview/2` | Linear Focus | Calm canvas, split diffs, floating override dock, slide-over inspector |
| `/preview/3` | Mission Deck | Span waterfall, split draggable tabs, breakpoint banner, alert feed, replay |

All three have live cost / cache / wallet counters, thinking accordions, Shiki diffs, nested subagents, the 7-category context breakdown, ⌘K, J/K span navigation, and Approve / Edit JSON (CodeMirror + Zod) / Deny with A/E/D. Phase 1 (daemon, SQLite, cost engine, breakpoints) is merged. See the [roadmap](site/src/app/docs/roadmap/page.mdx).

## Run it locally

You need Node.js 20.19+ and pnpm.

```bash
pnpm install
pnpm dev
```

Then open the URL the daemon prints (`http://127.0.0.1:5173/?token=…`) and pick a design. Each one starts a mock session automatically. Everything runs on the mock runtime: no API key, no spend.

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
