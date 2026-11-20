import { execFile, spawn } from "node:child_process";

/**
 * Optional Straitjacket integration (https://github.com/vamsiramakrishnan/straitjacket,
 * Apache-2.0, run as the separate `ctx` command; none of its code is copied).
 * A shell result bigger than `minChars` is stored by `ctx intake` and Claude
 * sees its short digest, with `run:` addresses to fetch the parts it needs.
 */
export type CondenseOptions = { command: string; minChars: number };

export type Condensed = { digest: string; handle: string | null; originalChars: number };

/** `ctx` (or the configured command) exists and answers. Cached per command. */
const available = new Map<string, Promise<boolean>>();
export function ctxAvailable(command = "ctx"): Promise<boolean> {
  let p = available.get(command);
  if (!p) {
    p = new Promise((done) => execFile(command, ["--version"], { timeout: 5000 }, (err) => done(!err)));
    available.set(command, p);
  }
  return p;
}

/** The `run:<id>` handle in a digest's first line, e.g. "[ctx run:690d46e45560 profile=…]". */
export function handleOf(digest: string): string | null {
  return /\brun:[0-9a-f]{6,64}\b/.exec(digest.split("\n", 1)[0] ?? "")?.[0] ?? null;
}

/** Text of a tool result, whatever its shape (string, {stdout, stderr}, content blocks). */
export function resultText(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.map((b) => (typeof b === "string" ? b : typeof (b as { text?: unknown })?.text === "string" ? (b as { text: string }).text : "")).join("\n");
  if (output && typeof output === "object") {
    const o = output as { stdout?: unknown; stderr?: unknown; output?: unknown };
    if (typeof o.stdout === "string" || typeof o.stderr === "string") return [o.stdout, o.stderr].filter((s): s is string => typeof s === "string" && s.length > 0).join("\n");
    if (typeof o.output === "string") return o.output;
  }
  return "";
}

/** Runs `ctx intake -` with the text on stdin; resolves to its digest, or null on any problem. */
function intake(command: string, text: string, cwd: string, name: string): Promise<string | null> {
  return new Promise((done) => {
    let out = "";
    let finished = false;
    const finish = (v: string | null) => {
      if (!finished) {
        finished = true;
        done(v);
      }
    };
    const child = spawn(command, ["intake", "-", "--label", "bash", "--name", name], { cwd, stdio: ["pipe", "pipe", "ignore"] });
    const timer = setTimeout(() => (child.kill(), finish(null)), 20_000);
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString("utf8");
      if (out.length > 200_000) child.kill(); // a digest is small; anything else is wrong
    });
    child.on("error", () => (clearTimeout(timer), finish(null)));
    child.on("close", (code) => (clearTimeout(timer), finish(code === 0 && out.trim() ? out.trim() : null)));
    child.stdin.on("error", () => undefined);
    child.stdin.end(text);
  });
}

/** A short, safe name for the digest: the command's first word. */
export function nameFor(command: unknown): string {
  const first = typeof command === "string" ? (command.trim().split(/\s+/)[0] ?? "") : "";
  return (first.split("/").pop() ?? "").replace(/[^A-Za-z0-9._+-]/g, "").slice(0, 48) || "bash";
}

/**
 * Condenses a big shell result through Straitjacket. Returns null to leave the
 * output as it is: small output, `ctx` missing or failing, or a digest that
 * isn't actually smaller.
 */
export async function condense(output: unknown, toolInput: Record<string, unknown>, cwd: string, opts: CondenseOptions): Promise<Condensed | null> {
  const text = resultText(output);
  if (text.length < opts.minChars) return null;
  if (!(await ctxAvailable(opts.command))) return null;
  const digest = await intake(opts.command, text, cwd, nameFor(toolInput.command));
  if (!digest || digest.length >= text.length) return null;
  return { digest, handle: handleOf(digest), originalChars: text.length };
}

/** The tool result Claude gets instead: same shape as the original, with the digest as its text. */
export function replacedOutput(original: unknown, digest: string): unknown {
  if (original && typeof original === "object" && !Array.isArray(original) && ("stdout" in original || "stderr" in original)) {
    return { ...(original as object), stdout: digest, stderr: "" };
  }
  return digest;
}

/** `ctx get <handle>#stdout --lines a:b` for the full-output viewer. */
export function ctxGet(command: string, handle: string, from: number, to: number, cwd: string): Promise<string | null> {
  if (!/^run:[0-9a-f]{6,64}$/.test(handle) || from < 1 || to < from) return Promise.resolve(null);
  return new Promise((done) =>
    execFile(command, ["get", `${handle}#stdout`, "--lines", `${from}:${to}`], { cwd, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) =>
      done(err ? null : String(stdout)),
    ),
  );
}
