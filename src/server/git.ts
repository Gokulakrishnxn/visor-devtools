import { execFile } from "node:child_process";

/** Runs git in a folder (no shell, so nothing in the arguments is interpreted). */
function git(cwd: string, args: string[], timeout = 15_000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((done) => {
    execFile("git", args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" } }, (error, stdout, stderr) =>
      done({ ok: !error, out: String(stdout), err: String(stderr || error?.message || "") }),
    );
  });
}

export type GitFile = { path: string; status: "added" | "modified" | "deleted" | "renamed" | "untracked" | "conflict"; staged: boolean };
export type GitState = { repo: false } | { repo: true; branch: string | null; branches: string[]; files: GitFile[]; ahead: number; behind: number; upstream: string | null };

const STATUS: Record<string, GitFile["status"]> = { A: "added", M: "modified", D: "deleted", R: "renamed", C: "added", T: "modified", U: "conflict" };

/** Branch, local branches and changed files (porcelain v1, so paths are exact). */
export async function gitState(cwd: string): Promise<GitState> {
  const inside = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.out.trim() !== "true") return { repo: false };
  const [status, branches] = await Promise.all([git(cwd, ["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"]), git(cwd, ["branch", "--format=%(refname:short)"])]);
  const entries = status.out.split("\0").filter(Boolean);
  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const files: GitFile[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.startsWith("## ")) {
      // "## main...origin/main [ahead 1, behind 2]" or "## No commits yet on main" or "## HEAD (no branch)"
      const head = e.slice(3);
      const info = /\[(.*)\]$/.exec(head)?.[1] ?? "";
      const names = head.replace(/ \[.*\]$/, "");
      if (names.startsWith("No commits yet on ")) branch = names.slice("No commits yet on ".length);
      else if (!names.startsWith("HEAD (no branch)")) {
        const [local, remote] = names.split("...");
        branch = local ?? null;
        upstream = remote ?? null;
      }
      ahead = Number(/ahead (\d+)/.exec(info)?.[1] ?? 0);
      behind = Number(/behind (\d+)/.exec(info)?.[1] ?? 0);
      continue;
    }
    const x = e[0]!;
    const y = e[1]!;
    const path = e.slice(3);
    if (x === "R" || x === "C") i++; // the original name follows a rename
    if (x === "?" && y === "?") files.push({ path, status: "untracked", staged: false });
    else if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) files.push({ path, status: "conflict", staged: false });
    else files.push({ path, status: STATUS[x !== " " ? x : y] ?? "modified", staged: x !== " " });
  }
  return { repo: true, branch, branches: branches.out.split("\n").filter(Boolean), files, ahead, behind, upstream };
}

const BRANCH_RE = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)[A-Za-z0-9._/-]{1,100}(?<![./])$/;
/** A safe branch name (no leading dash, no "..", no spaces or special git characters). */
export const validBranch = (name: string) => BRANCH_RE.test(name) && !name.endsWith(".lock");

export async function switchBranch(cwd: string, name: string, create: boolean): Promise<string | null> {
  if (!validBranch(name)) return "That isn't a valid branch name.";
  const r = await git(cwd, create ? ["switch", "-c", name] : ["switch", name]);
  return r.ok ? null : r.err.trim().split("\n").at(-1) || "git switch failed";
}

/** Commits the chosen files (all changes when none are given). Returns the new commit's short id, or an error. */
export async function commit(cwd: string, message: string, paths?: string[]): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!message.trim()) return { ok: false, error: "Write a commit message first." };
  const add = await git(cwd, paths?.length ? ["add", "-A", "--", ...paths] : ["add", "-A"]);
  if (!add.ok) return { ok: false, error: add.err.trim() || "git add failed" };
  const args = ["commit", "-m", message.trim()];
  if (paths?.length) args.push("--", ...paths);
  const r = await git(cwd, args, 60_000);
  if (!r.ok) return { ok: false, error: (r.out + r.err).trim().split("\n").slice(-3).join("\n") || "git commit failed" };
  const id = await git(cwd, ["rev-parse", "--short", "HEAD"]);
  return { ok: true, id: id.out.trim() };
}

/** The change to describe: staged + unstaged diff, plus the names of new files (capped in size). */
export async function diffForMessage(cwd: string, paths?: string[], limit = 24_000): Promise<string> {
  const scope = paths?.length ? ["--", ...paths] : [];
  const [head, untracked] = await Promise.all([git(cwd, ["diff", "HEAD", "--stat", "--patch", "--no-color", "--no-ext-diff", ...scope]), git(cwd, ["ls-files", "--others", "--exclude-standard", ...scope])]);
  // A repo without commits yet has no HEAD: fall back to the staged diff
  const diff = head.ok ? head.out : (await git(cwd, ["diff", "--cached", "--stat", "--patch", "--no-color", ...scope])).out;
  const added = untracked.out.split("\n").filter(Boolean);
  const text = `${diff}${added.length ? `\nNew files:\n${added.map((f) => `+ ${f}`).join("\n")}\n` : ""}`;
  return text.length > limit ? `${text.slice(0, limit)}\n[… diff cut at ${limit} characters]` : text;
}

/** A plain message when no AI is available (mock runtime): "Update 3 files: a, b, c". */
export function simpleMessage(files: GitFile[]): string {
  if (!files.length) return "";
  const verb = files.every((f) => f.status === "added" || f.status === "untracked") ? "Add" : files.every((f) => f.status === "deleted") ? "Remove" : "Update";
  const names = files.slice(0, 3).map((f) => f.path.split("/").pop());
  return `${verb} ${names.join(", ")}${files.length > 3 ? ` and ${files.length - 3} more` : ""}`;
}
