import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Every file the GUI can load must run in a browser: no Node built-ins.
const root = join(__dirname, "..");
const alias: Record<string, string> = { "@/": "src/web/", "@shared/": "src/shared/", "@server/": "src/server/" };

function resolveImport(from: string, spec: string): string | null {
  let base: string | null = null;
  for (const [a, dir] of Object.entries(alias)) if (spec.startsWith(a)) base = join(root, dir, spec.slice(a.length));
  if (!base && spec.startsWith(".")) base = resolve(dirname(from), spec);
  if (!base) return null; // a package from node_modules
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    try {
      if (statSync(base + ext).isFile()) return base + ext;
    } catch {
      // try the next extension
    }
  }
  return null;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : /\.tsx?$/.test(f) ? [join(dir, f)] : []));
}

describe("the GUI only loads browser-safe code", () => {
  it("never imports node: modules, directly or through server files it uses", () => {
    const seen = new Set<string>();
    const bad: string[] = [];
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/^\s*import\s+(type\s+)?[^"']*?from\s+["']([^"']+)["']/gm)) {
        if (m[1]) continue; // type-only imports vanish in the bundle
        const spec = m[2]!;
        if (spec.startsWith("node:")) bad.push(`${file.slice(root.length + 1)} → ${spec}`);
        const next = resolveImport(file, spec);
        if (next) visit(next);
      }
    };
    walk(join(root, "src/web")).forEach(visit);
    expect(bad).toEqual([]);
  });
});
