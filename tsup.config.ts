import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node20",
  clean: false,
  banner: { js: "#!/usr/bin/env node" },
  external: ["better-sqlite3"],
});
