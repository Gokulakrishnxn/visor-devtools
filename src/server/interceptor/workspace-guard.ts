import { isAbsolute, relative, resolve } from "node:path";
import { EDIT_TOOLS } from "./policy";

// Server only (uses node:path); the GUI imports policy.ts, so this lives apart.

/**
 * The file an edit tool would write, when it lies outside the workspace
 * (resolved against it; `..` escapes count). null when inside or not an edit.
 */
export function editOutsideWorkspace(toolName: string, input: Record<string, unknown>, workspace: string): string | null {
  if (!EDIT_TOOLS.has(toolName)) return null;
  const raw = input.file_path ?? input.notebook_path ?? input.path;
  if (typeof raw !== "string" || !raw) return null;
  const target = resolve(workspace, raw);
  const rel = relative(resolve(workspace), target);
  return rel.startsWith("..") || isAbsolute(rel) ? target : null;
}
