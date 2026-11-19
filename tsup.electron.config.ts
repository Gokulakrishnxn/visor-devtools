import { defineConfig } from "tsup";

// The desktop shell: main process (with the daemon bundled in) and preload.
// Native and process-spawning packages stay external and ship in node_modules.
export default defineConfig({
  entry: { main: "electron/main.ts", preload: "electron/preload.ts" },
  outDir: "dist-electron",
  format: ["cjs"],
  platform: "node",
  target: "node24",
  shims: true,
  clean: true,
  outExtension: () => ({ js: ".cjs" }),
  // Bundle every other dependency: the packaged app has no repo node_modules to fall back on
  noExternal: [/^(?!electron$|better-sqlite3$|@anthropic-ai\/claude-agent-sdk$).*/],
  external: ["electron", "better-sqlite3", "@anthropic-ai/claude-agent-sdk"],
});
