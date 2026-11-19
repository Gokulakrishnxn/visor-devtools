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

🚧 Early preview. This repository currently contains the landing page and documentation site. The harness itself is built next, phase by phase (see [Roadmap](src/app/docs/roadmap/page.mdx)).

## Run the site locally

You need Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Other scripts:

```bash
pnpm lint       # ESLint
pnpm typecheck  # Next.js route types + tsc
pnpm build      # production build
```

## What's inside

```text
src/
├── app/
│   ├── page.tsx            # landing page
│   └── docs/               # MDX docs (one folder per page)
├── components/
│   ├── landing/            # hero, pillars, animated features, mascot, footer
│   ├── docs/               # docs shell, Cmd+K search, MDX components
│   └── ui/rail-toc.tsx     # "On this page" rail
├── kit/                    # stageshow kit for animated product demos
└── lib/                    # site config, docs nav, Shiki helpers
```

Built with Next.js 16, React 19, Tailwind CSS v4, Motion, Shiki and cmdk.

## License

V.I.S.O.R. is open source under the [MIT License](LICENSE).

Copyright (c) 2026 Gokulakrishnan. You can use, copy, modify and distribute this code, including commercially, as long as the copyright notice and license text are kept. The software comes with no warranty.

### Third-party code

| Component | Used for | License |
| --- | --- | --- |
| [Stageshow](https://github.com/benjitaylor/skills) kit (`src/kit`) | Animated product demos on the landing page | MIT |
| [Rail TOC](https://github.com/swamimalode07/rare-ui) (`src/components/ui/rail-toc.tsx`) | Docs "On this page" sidebar | See upstream repository |
| [Simple Icons](https://simpleicons.org) | GitHub, Claude and Gemini marks | CC0 (brand marks remain trademarks of their owners) |

Claude is a trademark of Anthropic. Gemini is a trademark of Google. V.I.S.O.R. is an independent project and is not affiliated with or endorsed by either company.
