import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseUsd } from "@shared/money";
import { doctor } from "./server/doctor";
import { DEFAULT_PORT, startDaemon } from "./server/server";

const VERSION = "0.1.0";

const HELP = `
V.I.S.O.R. — Verified Inspection, Spans, Overrides & Runtime

Usage
  vhud [options]        Start the local daemon and open the GUI for this folder
  vhud doctor           Check API key, ~/.visor permissions and SQLite

Options
  --port <n>            Daemon port (default ${DEFAULT_PORT}, always 127.0.0.1)
  --cap <usd>           Hard session budget, e.g. --cap 5
  --live                Run the real Claude Agent SDK (spends money; needs credentials)
  --no-open             Don't open a browser window
  -v, --version         Print the version
  -h, --help            Show this help
`;

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: "string" },
      cap: { type: "string" },
      live: { type: "boolean", default: false },
      open: { type: "boolean", default: true },
      "no-open": { type: "boolean" },
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) return console.log(HELP);
  if (values.version) return console.log(VERSION);
  if (positionals[0] === "doctor") process.exit(doctor() ? 0 : 1);
  if (positionals.length) {
    console.error(`Unknown command: ${positionals[0]}\n${HELP}`);
    process.exit(1);
  }

  const cap = values.cap ? parseUsd(values.cap) : null;
  const here = dirname(fileURLToPath(import.meta.url));
  const staticDir = [join(here, "web"), join(here, "../dist/web")].find((d) => existsSync(join(d, "index.html")));
  const daemon = startDaemon({ port: values.port ? Number(values.port) : undefined, staticDir, runtime: values.live ? "claude" : undefined, capMicroUsd: cap });
  const url = `${daemon.url}/?token=${daemon.token}`;

  console.log(`\n  V.I.S.O.R. ${VERSION} running at ${daemon.url}`);
  console.log(`  Workspace: ${process.cwd()}`);
  console.log(`  Runtime:   ${daemon.runtime === "claude" ? "LIVE Claude Agent SDK (spends real money)" : "mock (zero API spend; add --live for real runs)"}`);
  console.log(staticDir ? `  GUI: ${url}\n` : "  GUI not built yet: run `pnpm build` first.\n");
  if (staticDir && values.open && !values["no-open"]) openBrowser(url);

  const shutdown = () => void daemon.close().then(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
