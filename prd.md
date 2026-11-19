# PRD: V.I.S.O.R.

**Verified Inspection, Spans, Overrides & Runtime**

| Field | Specification |
| ----- | ----- |
| **Product Name** | **V.I.S.O.R.** (*Verified Inspection, Spans, Overrides & Runtime*) |
| **Package / App ID** | `visor-hud` / `com.visor.hud` *(avoids collision with `@probelabs/visor`)* |
| **Interface Type** | **Rich Native-Style GUI** (Local Web App + macOS Desktop App via Electron) — *modeled after `claude-dev.tools`* |
| **Target Platforms** | macOS (Apple Silicon & Intel primary), Linux, Windows |
| **Build Execution Model** | `claude-opus-5-5` (Medium Effort — default) |
| **Core Stack** | TypeScript 5+, React 19, Vite, Tailwind CSS v4, shadcn/ui, Shiki (syntax/diffs), CodeMirror 6 (JSON override editor), `cmdk` (`Cmd+K`), Local Node/Bun Daemon (Hono + WebSockets), `@anthropic-ai/claude-agent-sdk`, MCP SDK, SQLite + Drizzle ORM, Electron (macOS `.dmg` shell) |

---

## 1. Problem Statement & Product Vision

Terminal coding agents collapse critical runtime detail behind opaque summaries (e.g., *"Edited 2 files"*), hiding exact file paths, extended thinking steps, MCP payloads, context compaction, and real dollar spend. Desktop viewers like **`claude-dev.tools`** proved how much clarity developers gain from a dedicated GUI—rendering syntax-highlighted file reads, inline diffs, recursive subagent trees, 7-category context attribution, `Cmd+K` search, and copyable text without terminal ANSI noise. However, existing tools remain strictly **read-only post-mortem log viewers**.

**V.I.S.O.R.** delivers that exact high-craft desktop developer-tools interface—and upgrades it into a **live, interactive Claude harness**:

1. **Verified:** Tracks exact token buckets (fresh input, 5m/1h cache write, cache read, output + thinking) in integer micro-dollars, deducting live prompt spend from a local prepaid credit wallet with visible cache-hit savings.
2. **Inspection:** Real-time GUI visualization of streaming extended thinking blocks, syntax-highlighted `Read` calls, inline `Edit` diffs, raw MCP JSON-RPC traffic, recursive subagent trees, and 7-category context attribution—with real selectable text and one-click copy.
3. **Spans:** OpenTelemetry-aligned parent/child execution trees (`session -> turn -> llm_call / tool_call / subagent`) with millisecond latency, error badges, and cost attribution per node.
4. **Overrides:** Active mid-flight breakpoints directly inside the GUI. When a risky tool call triggers a rule, execution pauses and surfaces an interactive approval card with **Approve**, **Edit JSON** (inline syntax-highlighted editor), or **Deny with steering feedback**—backed by hard USD budget kill-switches.
5. **Runtime:** A clean local daemon driving the Claude Agent SDK and MCP servers, streaming typed events over WebSockets to the GUI while persisting every span locally in SQLite.

### Non-Goals for V1 (Strict Scope Guardrails)
* Do **not** build a terminal-only TUI (a thin `vhud` CLI launcher is only used to start the local server and open the GUI).
* Do **not** build a full multi-file code IDE; render clean read-only file viewers, inline diffs, and an "Open in Cursor / VS Code / Zed / Finder" launcher.
* Do **not** send telemetry, prompts, or source code to any cloud server; V1 is 100% local-first.

---

## 2. Visual Craft & Design Language (Non-Negotiable UI Standard)

To impress senior developers and engineers on first glance, the GUI must feel like a precision macOS developer tool (`claude-dev.tools`, Linear, Raycast, Chrome DevTools)—**never** cluttered or neon-heavy:

* **Quiet Dark-Mode Surfaces:** Layered obsidian/zinc hierarchy (`#090A0C` app frame, `#0F1115` primary panels, `#15181E` cards/elevated surfaces) separated by crisp `1px` hairline borders (`rgba(255, 255, 255, 0.08)`).
* **Typography & Tabular Numerals:** `Inter` / `Geist Sans` for UI chrome; `JetBrains Mono` / `Geist Mono` for code, diffs, JSON, and telemetry. Apply `tabular-nums` on every token counter, timer, and dollar figure so live ticking numbers never jitter horizontally.
* **Semantic Color Discipline:** Reserve saturated color strictly for state and telemetry:
  * **Emerald:** Completed spans, prompt cache hits & dollars saved, online MCP servers.
  * **Amber:** Paused override breakpoints, approaching budget/context cap warnings.
  * **Rose:** Denied actions, tool errors, security triggers (e.g., `.env` access).
  * **Indigo / Violet:** Extended thinking blocks and spawned subagent branches.
* **Zero Terminal Friction:** Every message, diff, file path, and JSON payload is real selectable text with one-click copy buttons and keyboard-first navigation (`Cmd+K` Command Palette, `J`/`K` span navigation, `A`/`E`/`D` override hotkeys).

---

## 3. System Architecture (5-Layer Decoupled Blueprint)

The GUI and the Agent Runtime are strictly decoupled across a local WebSocket + REST boundary. During development and Phase 2 design review, the GUI runs instantly in any browser (`localhost:5173`); in Phase 3, the exact same GUI is wrapped in a native macOS Electron shell.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: DESKTOP / WEB PRESENTATION GUI (React 19 + Tailwind + shadcn/ui)    │
│   • Live Execution Stream, Inline Shiki Diffs, Subagent Trees                │
│   • 7-Category Context Visualizer, Cost/Wallet HUD, Cmd+K Palette            │
│   • Interactive Override Cards (Approve / CodeMirror JSON Edit / Deny)       │
│   • Packaged in Electron macOS Shell (native titlebar, OS notifications)     │
└──────────────────────────▲───────────────────────────────┬───────────────────┘
                           │ WebSocket (VisorEvent stream) │ REST / WS Actions
┌──────────────────────────┴───────────────────────────────▼───────────────────┐
│ LAYER 2: LOCAL HARNESS DAEMON (Hono HTTP/WS Server on 127.0.0.1:4310)        │
│   • Session & Workspace Controller                                           │
│   • Policy Evaluator & Interactive Breakpoint Queue (freezes tool promises)  │
│   • Hard Budget Watchdog (aborts loop if session/turn cost >= cap)           │
│   • Notification Trigger Engine (regex path alerts, error & token alerts)    │
└──────────────────────────▲───────────────────────────────┬───────────────────┘
                           │ Hook Callbacks & Budgets      │ Allow/Edit/Deny
┌──────────────────────────┴───────────────────────────────▼───────────────────┐
│ LAYER 3: AGENT RUNTIME HARNESS (ADAPTER PATTERN)                             │
│   Interface: AgentRuntimeAdapter                                             │
│   ├── ClaudeSdkAdapter (@anthropic-ai/claude-agent-sdk + MCP servers)        │
│   └── MockRuntimeAdapter (deterministic zero-cost replay for UI & tests)     │
└──────────────────────────▲───────────────────────────────┬───────────────────┘
                           │ Raw SDK Messages & Usage      │ Span / Cost Events
┌──────────────────────────┴───────────────────────────────▼───────────────────┐
│ LAYER 4: TELEMETRY, SPAN & VERIFIED COST ENGINE                              │
│   • Span Tree Builder (trace_id, span_id, parent_span_id, duration_ms)       │
│   • Parallel Message Deduplicator (dedupes usage by message_id)              │
│   • Micro-Dollar Cost Calculator (1 USD = 1,000,000 µUSD; zero floats)       │
│   • 7-Category Context Attribution & Compaction Boundary Tracker             │
└──────────────────────────────────────────┬───────────────────────────────────┘
                                           │ Atomic Writes (WAL Mode)
┌──────────────────────────────────────────▼───────────────────────────────────┐
│ LAYER 5: LOCAL PERSISTENCE (~/.visor/traces.db, chmod 0600)                  │
│   SQLite + Drizzle ORM                                                       │
│   Tables: sessions | turns | spans | credit_ledger | policy_audit_log        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Core Architectural Invariants (Non-Negotiable Rules)
1. **Zero Floating-Point Money Math:** Store all currency amounts as integers in **micro-dollars** (`1 USD = 1_000_000 µUSD`, `1 cent = 10_000 µUSD`). Format to `$0.0000` strictly at the UI layer.
2. **Hook-First Security Pipeline:** Leverage the Claude Agent SDK's permission pipeline so `PreToolUse` hooks run *before* allow/deny rules—ensuring built-in protections (blocking `.env` reads, private keys, or destructive shell commands) cannot be bypassed accidentally.
3. **Deduplicated Accounting & Authoritative Reconciliation:** Stream live token deltas for instant UI ticks, deduplicate parallel tool calls by `message_id`, and reconcile final turn costs against `SDKResultMessage` (`total_cost_usd`, `model_usage`).
4. **Zero-Cost Development via `MockRuntimeAdapter`:** All Phase 2 UI prototypes, breakpoint interactions, diff renderers, and automated tests must run deterministically against rich mock streams without spending live API credits.
5. **Localhost & File Security:** Bind the local daemon strictly to `127.0.0.1` with a per-launch session token. Create `~/.visor/` with `0700` and `~/.visor/traces.db` with `0600` permissions in SQLite WAL mode.

---

## 4. Data & Pricing Contracts

### 4.1 Verified Model Pricing Registry (Per 1M Tokens, Integer µUSD)

| Model ID | Base Input | 5m Cache Write | 1h Cache Write | Cache Read | Output (incl. Thinking) | Context Window |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| `claude-opus-5-5` | `$4.00` | `$5.00` | `$8.00` | `$0.20` | `$20.00` | `1,000,000` |
| `claude-sonnet-5-5` *(fallback: `claude-sonnet-5`)* | `$2.00` | `$2.50` | `$4.00` | `$0.10` | `$10.00` | `1,000,000` |
| `claude-haiku-4-5` | `$1.00` | `$1.25` | `$2.00` | `$0.10` | `$5.00` | `200,000` |

*(Externalize pricing to `src/server/telemetry/pricing.ts` with runtime overrides via `~/.visor/pricing.json`.)*

### 4.2 SQLite Schema (Drizzle ORM)

```text
sessions
  id (PK, ULID), workspace_path, title, model_id, effort_level,
  budget_cap_micro_usd, total_cost_micro_usd,
  status ('running'|'paused'|'completed'|'aborted_budget'|'error'),
  started_at, ended_at

turns
  id (PK, ULID), session_id (FK), turn_index, user_prompt,
  input_tokens, cache_write_tokens, cache_read_tokens, output_tokens,
  thinking_tokens, cost_micro_usd, cache_savings_micro_usd,
  context_used_tokens, context_limit_tokens, context_breakdown_json,
  compacted (boolean), started_at, ended_at

spans
  id (PK, ULID), session_id (FK), turn_id (FK), parent_span_id (nullable FK),
  span_type ('llm'|'thinking'|'read'|'edit'|'bash'|'mcp'|'subagent'|'compaction'|'override'),
  name, file_path, status ('running'|'paused'|'ok'|'error'|'denied'|'edited'),
  input_json, output_json, diff_text, error_message,
  cost_micro_usd, latency_ms, started_at, ended_at

credit_ledger
  id (PK, ULID), session_id (nullable FK), entry_type ('deposit'|'debit'|'adjustment'),
  amount_micro_usd, balance_after_micro_usd, note, created_at

policy_audit_log
  id (PK, ULID), session_id (FK), span_id (FK), tool_name, matched_rule,
  decision ('approved'|'edited'|'denied'|'auto_blocked'),
  original_input_json, final_input_json, operator_note, created_at
```

### 4.3 7-Category Context Reconstruction Spec (`claude-dev.tools` Parity)
Every turn calculates and stores a 7-bucket context breakdown rendered as a color-coded stacked bar + expandable inspector table:
1. **Project Rules (`CLAUDE.md`)** — global, project, and directory instructions
2. **MCP & Tool Schemas** — connected MCP tool definitions and skills
3. **Mentioned Files (`@`-refs)** — explicitly attached workspace files
4. **Tool Results (I/O)** — file reads, grep outputs, bash stdout, MCP JSON responses
5. **Extended Thinking** — retained reasoning blocks
6. **Subagent / Team Overhead** — handoff prompts and subagent return payloads
7. **User & Assistant Messages** — conversation turns

---

## 5. Phased Execution Roadmap (Strict Gate Workflow)

> **Execution Rule for Claude Opus 5.5:** Execute phases strictly in order. Do **not** begin Phase 3 until the user clicks through all 3 live GUI prototypes in Phase 2 and picks their winning interface.

---

### PHASE 1: GitHub Setup & Engineering Foundation
**Goal:** Stand up a clean, production-grade open-source repository with strict TypeScript, Tailwind/shadcn UI foundation, and green CI.

#### Deliverables
1. **Repository Initialization:** Create GitHub repo `visor-hud` (MIT License, crisp `README.md` explaining V.I.S.O.R., `.gitignore` excluding `.env`, `*.db`, `*.db-wal`, `node_modules/`, `dist/`, `release/`).
2. **Project Scaffold:**
   ```text
   visor-hud/
   ├── .github/workflows/ci.yml       # typecheck + lint + test on push/PR
   ├── electron/                      # macOS Electron desktop wrapper (Phase 3.5)
   ├── src/
   │   ├── shared/                    # Shared VisorEvent, pricing, & Zod types
   │   ├── server/
   │   │   ├── index.ts               # Hono HTTP + WebSocket daemon (127.0.0.1:4310)
   │   │   ├── runtime/               # AgentRuntimeAdapter, ClaudeSdkAdapter, MockAdapter
   │   │   ├── interceptor/           # Policy rules, breakpoint queue, budget watchdog
   │   │   ├── telemetry/             # Span builder, 7-cat context engine, micro-USD math
   │   │   └── db/                    # Drizzle schema, SQLite WAL client, migrations
   │   └── web/
   │       ├── components/            # Shared shadcn/ui, Shiki Diff, Cost HUD, Cmd+K
   │       ├── prototypes/            # Phase 2: Design1Studio, Design2Linear, Design3Deck
   │       ├── stores/                # Zustand live trace & override state
   │       └── App.tsx                # Router supporting /preview/1, /preview/2, /preview/3
   ├── tests/                         # Unit & integration tests (Vitest)
   ├── .env.example                   # ANTHROPIC_API_KEY=
   ├── .visor.example.json            # Sample override, trigger, & MCP config
   ├── prd.md
   └── package.json
   ```
3. **CI & Quality Gates:** GitHub Actions running `typecheck`, `lint`, `test`, and frontend `build` on every push/PR.
4. **Acceptance Criteria:** Fresh clone + install + `typecheck` + `test` + `build` passes with 0 errors and a green CI check on GitHub.

---

### PHASE 2: Interactive GUI Design Gate (Choose 1 of 3)
**Goal:** Build **3 distinct, clickable, high-craft GUI prototypes** directly in React + Tailwind + shadcn/ui powered by `MockRuntimeAdapter` (zero API cost). Launching `bun run dev` opens a clean top-level switcher (`Design 1` | `Design 2` | `Design 3`) where every design streams the exact same realistic multi-turn Claude scenario—complete with Thinking blocks, syntax-highlighted `Read` calls, inline `Edit` diffs, a nested Subagent tree, live ticking USD cost + cache savings, 7-category context bar, `Cmd+K` search, and a working **Approve / Edit JSON / Deny** breakpoint card.

---

#### Design 1: **Studio Tri-Pane** *(Direct `claude-dev.tools` Evolution)*
* **Layout Philosophy:** Classic 3-column macOS desktop developer studio inspired directly by `claude-dev.tools`.
* **Top macOS HUD Bar:** Active workspace & model badge (`Opus 5.5 · Medium`), live emerald Prompt Cost pill (`$0.0420`), Cache Savings pill (`95% hit · -$0.036`), Prepaid Credit Wallet (`$14.82 left`), horizontal Budget Cap progress bar, and Pause/Stop buttons.
* **Left Sidebar (`240px`, collapsible):** Workspace & Session list (showing status dots + per-session USD total), Project Memory quick-drawer, and live **MCP Server Status** indicators (green/red dots for `filesystem`, `github`, `postgres`).
* **Center Execution Stage (Fluid):** Clean vertical conversation & span stream—collapsible **Thinking** accordions (violet accent), expandable **Read** cards (Shiki syntax highlighting + "Open in Editor" button), inline **Edit** unified diffs with one-click copy, recursive indented **Subagent** cards with duration/cost badges, and an inline amber **Override Breakpoint Card** (`Approve` | `Edit JSON` | `Deny`) right where execution paused. Bottom sticky Prompt Composer with model/effort/cap pills.
* **Right Inspector Rail (`320px`, tabbed):** Three tabs—**Context** (interactive 7-category stacked bar + per-turn compaction timeline), **Payload** (formatted raw MCP JSON-RPC request/response + copy), and **Cost** (exact micro-dollar receipt broken down by Fresh Input, Cache Write, Cache Read, Output & Thinking).
* **Best For:** Maximum at-a-glance visibility; immediately familiar to anyone who loves `claude-dev.tools`.

---

#### Design 2: **Linear Focus** *(Minimalist 2-Pane + Slide-Over Inspector)*
* **Layout Philosophy:** Ultra-clean, distraction-free craft modeled after Linear and Raycast—built to look effortless and iconic on 13"–16" MacBook screens.
* **Top Compact Telemetry Strip:** Minimal single-row bar with Workspace selector, live cost ticker + credit wallet popover, `Cmd+K` search pill, and a subtle animated ring showing Context Window % and Budget Cap %.
* **Slim Left Icon Rail (`52px`) + Toggleable Session Drawer:** Keeps 85% of the screen dedicated to the live trace canvas; switch sessions instantly via `Cmd+K` or hovering the left rail.
* **Center Spacious Execution Canvas (Max-width centered, crisp cards):** Generous breathing room around Thinking blocks, full-width side-by-side code diffs, and clean collapsible Subagent lanes. When a breakpoint triggers, a sleek **Floating Override Action Dock** rises above the prompt bar showing the highlighted tool payload, quick rule badge, and one-click `Approve (A)` / `Edit JSON (E)` / `Deny (D)` actions.
* **On-Demand Slide-Over Inspector Drawer:** Clicking *any* span, token badge, or context pill slides a frosted right-hand inspector sheet over the canvas showing the 7-category context breakdown, raw JSON-RPC payload, and step-level cost receipt.
* **Best For:** Engineers who want a calm, ultra-modern, Apple-grade daily driver without visual density fatigue.

---

#### Design 3: **Mission Deck** *(Waterfall Flamegraph + Multi-Pane Split)*
* **Layout Philosophy:** High-density engineering observability modeled after Chrome DevTools Performance + Datadog Trace Explorer, with `claude-dev.tools`-style multi-pane tabs.
* **Top Interactive Span Waterfall (`220px` resizable):** Horizontal millisecond timeline plotting the main agent lane, tool call bars, and parallel Subagent swimlanes visually—clicking any bar jumps straight to its diff, thinking block, and cost below.
* **Bottom Multi-Pane Split Workspace (Drag-and-Drop Tabs):** Split the workspace side-by-side to compare two sessions, view **Live Trace + 7-Category Context Chart** simultaneously, or dock the **Real-Money Credit Ledger & Cost Analytics** view alongside an active run.
* **Dedicated Breakpoint & Security Banner:** High-visibility top-of-pane override bar with diffed JSON payload editing (CodeMirror 6), trigger alert feed (`.env` warnings, loop detection), and instant session replay scrubbing.
* **Best For:** Power users debugging complex multi-agent parallelism, latency bottlenecks, and side-by-side prompt/model cost comparisons.

#### Phase 2 Acceptance Criteria
* Running `bun run dev` opens the local GUI in the browser with a clean switcher across **Design 1**, **Design 2**, and **Design 3**.
* All 3 designs feature realistic simulated streaming, expandable Thinking blocks, Shiki syntax-highlighted diffs, recursive Subagent trees, live ticking USD/cache/wallet counters, 7-category context visualization, `Cmd+K` Command Palette, and an interactive **Approve / Edit JSON / Deny** breakpoint flow.
* **STOP GATE:** Stop and wait for the user to inspect all 3 live GUIs and select the official V.I.S.O.R. interface before writing Phase 3 backend integration code.

---

### PHASE 3: Core Build (Vertical Engineering Slices)
**Goal:** Promote the chosen Phase 2 design into the production **V.I.S.O.R.** application wired to the real Claude Agent SDK, MCP servers, SQLite persistence, and native macOS desktop packaging.

#### Milestone 3.1 — Local Daemon, Claude Runtime & SQLite Persistence
* Implement `ClaudeSdkAdapter` wrapping `@anthropic-ai/claude-agent-sdk` (`query()`, isolated `settingSources`, configurable model & effort level, MCP server connections).
* Implement Drizzle schema + auto-migrations for `~/.visor/traces.db` (`0600`, WAL mode).
* Stream live `VisorEvent` messages over WebSockets to the chosen GUI; support instant offline replay of any past session from the sidebar.

#### Milestone 3.2 — Verified Token, Cache & Real-Money Credit Engine
* Implement integer micro-dollar calculator covering `input_tokens`, `cache_creation_input_tokens` (5m & 1h), `cache_read_input_tokens`, and `output_tokens` (including thinking).
* Deduplicate parallel tool-use messages by `message_id` and reconcile final turn totals against `SDKResultMessage.total_cost_usd` and `model_usage`.
* Build GUI Credit Wallet modal (deposit/set prepaid balance, view ledger history, export CSV receipt) and enforce hard USD budget caps automatically via both SDK `maxBudgetUsd` and V.I.S.O.R.'s `PreToolUse` watchdog.

#### Milestone 3.3 — Mid-Flight GUI Overrides & Breakpoint Engine
* Hook into `PreToolUse` and `canUseTool` callbacks in the Claude Agent SDK to freeze execution on configured rules (`.visor.json` or GUI toggles: e.g., pause on `Bash`, `Edit`, `MCP write`).
* Wire the GUI override controls end-to-end:
  * **Approve:** Releases the blocked promise immediately and logs to `policy_audit_log`.
  * **Edit JSON:** Opens inline **CodeMirror 6** JSON editor with live Zod validation, sends the mutated tool arguments back to Claude, and records both original and edited payloads.
  * **Deny:** Blocks the tool call and attaches optional operator steering text back to Claude so it recovers cleanly.
* Ship built-in security rules & desktop Notification Triggers (blocking `.env` / private key reads, flagging destructive shell commands, regex path alerts, and high-token spike warnings).

#### Milestone 3.4 — Deep Inspection (`claude-dev.tools` Feature Parity)
* Live streaming Thinking accordions with token count & duration.
* Shiki syntax-highlighted `Read` viewer + unified/split `Edit` diffs with one-click copy and **"Open in Cursor / VS Code / Zed / Finder"** actions.
* Recursive Subagent execution trees (`parent_tool_use_id`, `SubagentStart` / `SubagentStop`) showing isolated per-agent spans, tokens, latency, and cost.
* 7-Category Context Reconstruction bar & turn-by-turn compaction boundary visualization (`PreCompact` / `PostCompact`).
* Full `Cmd+K` Command Palette searching across sessions, file paths, thinking text, tool outputs, and error alerts.

#### Milestone 3.5 — Native macOS Desktop App & Polish
* Wrap the local daemon + built React frontend in **Electron** (`electron-builder`) with native macOS dark titlebar (`titleBarStyle: 'hiddenInset'`), native OS notifications for paused breakpoints/triggers, and a clean `.dmg` build script for Apple Silicon & Intel.
* Add a thin `vhud` CLI launcher (`vhud` opens the desktop/local GUI in the current directory; `vhud doctor` checks `ANTHROPIC_API_KEY`, SQLite permissions, and MCP server health).
* Finalize `README.md` with architecture diagram, screenshots/video demo of the chosen UI, and one-command setup guide.

---

## 6. Operating Instructions for Claude Opus 5.5 (Medium Effort Mode)

Follow these engineering rules throughout the build:
1. **Strict Phase Gate:** Finish Phase 1 with green CI first. Then build all 3 interactive GUI prototypes for Phase 2 and **stop so the user can open the browser, interact with all 3 designs, and choose one** before starting Phase 3.
2. **Obsess Over UI Polish:** Make Phase 2 prototypes look like a shipped $20/mo macOS developer tool—crisp spacing, hairline borders, smooth micro-transitions, real Shiki syntax highlighting, and tabular numbers. Avoid generic gradients or cluttered dashboards.
3. **Zero API Spend in Tests & Previews:** All automated tests and Phase 2 GUI previews must run purely on `MockRuntimeAdapter`. Never invoke live Anthropic endpoints during automated test runs.
4. **Keep Code Modular:** Keep pure business logic (micro-dollar math, policy matching, 7-category context calculation) in `src/server/telemetry/` and `src/server/interceptor/`, completely isolated from React UI components.
5. **Verify Every Milestone:** Run `typecheck`, `test`, and production `build` before marking any milestone complete.