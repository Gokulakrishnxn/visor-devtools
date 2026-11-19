import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commandExists, doctor } from "@server/doctor";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));

describe("vhud doctor: workspace and MCP checks", () => {
  it("finds commands on PATH or by absolute path", () => {
    expect(commandExists("node")).toBe(true);
    expect(commandExists(process.execPath)).toBe(true);
    expect(commandExists("definitely-not-a-real-command-xyz")).toBe(false);
    expect(commandExists("node", "")).toBe(false);
  });

  it("reports .visor.json and each MCP server", () => {
    const ws = tmp("visor-ws-");
    writeFileSync(
      join(ws, ".visor.json"),
      JSON.stringify({
        mcpServers: {
          local: { command: "node", args: ["server.js"] },
          missing: { command: "definitely-not-a-real-command-xyz" },
          remote: { url: "https://mcp.example.com/mcp" },
        },
      }),
    );
    const lines: string[] = [];
    doctor(join(tmp("visor-db-"), "v", "traces.db"), (l) => lines.push(l), ws);
    expect(lines).toContain("✓ .visor.json loaded (0 rules, 0 triggers)");
    expect(lines).toContain("✓ MCP local: command found (node)");
    expect(lines).toContain("✗ MCP missing: command not found (definitely-not-a-real-command-xyz)");
    expect(lines).toContain("✓ MCP remote: remote server https://mcp.example.com/mcp");
  });

  it("flags an invalid .visor.json", () => {
    const ws = tmp("visor-bad-");
    writeFileSync(join(ws, ".visor.json"), "{ nope");
    const lines: string[] = [];
    expect(doctor(join(tmp("visor-db-"), "v", "traces.db"), (l) => lines.push(l), ws)).toBe(false);
    expect(lines.some((l) => l.startsWith("✗ .visor.json is invalid"))).toBe(true);
  });
});

describe("desktop packaging config", () => {
  const builder = JSON.parse(readFileSync(join(__dirname, "..", "electron", "builder.json"), "utf8")) as {
    directories: { app: string };
    npmRebuild: boolean;
    files: string[];
    asarUnpack: string[];
    mac: { target: { arch: string[] }[] };
  };
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as { scripts: Record<string, string> };

  it("packages the staged app for both Mac architectures without rebuilding the repo", () => {
    expect(builder.directories.app).toBe("."); // runs inside release/app
    expect(builder.npmRebuild).toBe(true); // per-arch native rebuild inside release/app
    expect(builder.mac.target[0]!.arch).toEqual(["arm64", "x64"]);
    expect(builder.asarUnpack).toContain("node_modules/@anthropic-ai/claude-agent-sdk*/**"); // it starts a process
    expect(builder.files.some((f) => f.includes("claude-agent-sdk-darwin-!(${arch})"))).toBe(true); // one Claude binary per arch
    expect(pkg.scripts["dist:mac"]).toContain("--projectDir release/app");
  });
});
