import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("./src/web"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": r("./src/web"),
      "@shared": r("./src/shared"),
      "@server": r("./src/server"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    // The website and build output live in the same repo; don't watch them
    watch: { ignored: ["**/site/**", "**/dist/**", "**/.agents/**"] },
    proxy: {
      "/api": "http://127.0.0.1:4310",
      "/ws": { target: "ws://127.0.0.1:4310", ws: true },
    },
  },
  build: {
    outDir: r("./dist/web"),
    emptyOutDir: true,
  },
});
