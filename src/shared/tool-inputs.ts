import { z } from "zod";

/**
 * Argument shapes for built-in tools, used to validate an operator's
 * "Edit JSON" override before it is sent back to the agent.
 */
export const TOOL_INPUT_SCHEMAS: Record<string, z.ZodType<Record<string, unknown>>> = {
  Bash: z
    .object({ command: z.string().min(1, "command can't be empty"), timeout: z.number().int().positive().optional(), description: z.string().optional() })
    .strict(),
  Read: z.object({ file_path: z.string().min(1), offset: z.number().int().nonnegative().optional(), limit: z.number().int().positive().optional() }).strict(),
  Edit: z
    .object({ file_path: z.string().min(1), old_string: z.string(), new_string: z.string(), replace_all: z.boolean().optional() })
    .strict(),
  Write: z.object({ file_path: z.string().min(1), content: z.string() }).strict(),
  Grep: z.object({ pattern: z.string().min(1), path: z.string().optional(), glob: z.string().optional() }).passthrough(),
};

const AnyObject = z.record(z.string(), z.unknown());

export type InputCheck = { ok: true; value: Record<string, unknown> } | { ok: false; errors: string[] };

/** Parses JSON text and validates it against the tool's schema. */
export function checkToolInput(toolName: string, text: string): InputCheck {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`Invalid JSON: ${(err as Error).message}`] };
  }
  const schema = TOOL_INPUT_SCHEMAS[toolName] ?? AnyObject;
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, errors: result.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`) };
}
