import { startDaemon } from "./server";

// Dev entry (`pnpm dev:server`). The GUI runs on Vite at :5173 and proxies here.
const daemon = startDaemon({ token: process.env.VISOR_TOKEN });

console.log(`\n  V.I.S.O.R. daemon  ${daemon.url}  (${daemon.runtime === "claude" ? "LIVE Claude Agent SDK, spends real money" : "mock runtime, zero API spend"})`);
console.log(`  Open the GUI:      http://127.0.0.1:5173/?token=${daemon.token}\n`);

const shutdown = () => void daemon.close().then(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
