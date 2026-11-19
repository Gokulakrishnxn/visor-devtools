// Assembles the desktop app in release/app, separate from the repo's own
// node_modules: native modules there are rebuilt for Electron, while the
// repo's copies stay built for Node (so tests and the CLI keep working).
import { execFileSync } from "node:child_process";
import { builtinModules } from "node:module";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "release", "app");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

for (const need of ["dist/web/index.html", "dist-electron/main.cjs", "dist-electron/preload.cjs"]) {
  if (!existsSync(join(root, need))) throw new Error(`Missing ${need}: run \`pnpm build && pnpm build:electron\` first`);
}

// Guard: the packaged app can only load these packages; anything else must be bundled.
// (A staged app inside the repo would quietly find the repo's node_modules instead.)
const allowed = new Set(["electron", "better-sqlite3", "@anthropic-ai/claude-agent-sdk", "bufferutil", "utf-8-validate"]);
const mainSrc = readFileSync(join(root, "dist-electron", "main.cjs"), "utf8");
const needed = [...mainSrc.matchAll(/require\("([^"./][^"]*)"\)/g)].map((m) => m[1]).filter((m) => !builtinModules.includes(m.replace(/^node:/, "")));
const unexpected = [...new Set(needed)].filter((m) => !allowed.has(m));
if (unexpected.length) throw new Error(`dist-electron/main.cjs needs packages the app won't ship: ${unexpected.join(", ")}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "dist-electron"), join(out, "dist-electron"), { recursive: true });
cpSync(join(root, "dist", "web"), join(out, "dist", "web"), { recursive: true });
cpSync(join(root, "drizzle"), join(out, "drizzle"), { recursive: true });

// Only what the bundle leaves external, plus the Agent SDK's Claude binary for
// both Mac architectures (electron-builder keeps the matching one per .dmg)
const runtimeDeps = ["better-sqlite3", "@anthropic-ai/claude-agent-sdk"];
const sdkVersion = JSON.parse(readFileSync(join(root, "node_modules", "@anthropic-ai", "claude-agent-sdk", "package.json"), "utf8")).version;
const electronVersion = JSON.parse(readFileSync(join(root, "node_modules", "electron", "package.json"), "utf8")).version;
const npmVersion = execFileSync("npm", ["--version"], { encoding: "utf8" }).trim();
writeFileSync(
  join(out, "package.json"),
  JSON.stringify(
    {
      name: "visor-desktop",
      // A trailing dot breaks Electron helper lookup on macOS; the Dock shows "V.I.S.O.R." (CFBundleDisplayName)
      productName: "VISOR",
      version: pkg.version,
      description: pkg.description,
      author: pkg.author,
      license: pkg.license,
      main: "dist-electron/main.cjs",
      // Makes electron-builder collect from this folder with npm, not the repo's pnpm
      packageManager: `npm@${npmVersion}`,
      dependencies: {
        ...Object.fromEntries(runtimeDeps.map((d) => [d, pkg.dependencies[d]])),
        "@anthropic-ai/claude-agent-sdk-darwin-arm64": sdkVersion,
        "@anthropic-ai/claude-agent-sdk-darwin-x64": sdkVersion,
      },
    },
    null,
    2,
  ),
);

const builder = JSON.parse(readFileSync(join(root, "electron", "builder.json"), "utf8"));
delete builder.$comment;
writeFileSync(join(out, "electron-builder.json"), JSON.stringify({ ...builder, electronVersion }, null, 2));

// --force: install the other architecture's Claude binary too
execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--ignore-scripts", "--force"], { cwd: out, stdio: "inherit" });
// Compile better-sqlite3 against Electron's Node ABI for `pnpm desktop` (packaging rebuilds per arch)
execFileSync(join(root, "node_modules", ".bin", "electron-rebuild"), ["--version", electronVersion, "--module-dir", out, "--only", "better-sqlite3"], {
  cwd: root,
  stdio: "inherit",
});
console.log(`\nStaged desktop app in ${out} (Electron ${electronVersion})`);
