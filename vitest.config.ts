import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": r("./src/shared"),
      "@server": r("./src/server"),
      "@": r("./src/web"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Never hit live endpoints from tests
    env: { ANTHROPIC_API_KEY: "" },
  },
});
