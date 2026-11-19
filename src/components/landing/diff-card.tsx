import { DiffStage, type DiffLine } from "./feature-stages";
import { tokenLines } from "@/lib/highlight";

type Line = { kind: " " | "+" | "-"; old?: number; new?: number; code: string };

const LINES: Line[] = [
  { kind: " ", old: 41, new: 41, code: "export async function getSession(req: Request) {" },
  { kind: " ", old: 42, new: 42, code: "  const token = readToken(req);" },
  { kind: "-", old: 43, code: "  refreshToken(token);" },
  { kind: "-", old: 44, code: "  return sessions.get(token.id);" },
  { kind: "+", new: 43, code: "  const fresh = await refreshToken(token);" },
  { kind: "+", new: 44, code: "  if (!fresh) throw new AuthError(\"expired\");" },
  { kind: "+", new: 45, code: "  return sessions.get(fresh.id);" },
  { kind: " ", old: 45, new: 46, code: "}" },
];

/** Shiki tokens are computed on the server; the stageshow scene animates them. */
export async function DiffCard() {
  const tokens = await tokenLines(LINES.map((l) => l.code).join("\n"), "ts");
  const lines: DiffLine[] = LINES.map((l, i) => ({ kind: l.kind, old: l.old, new: l.new, tokens: tokens[i] ?? [] }));
  return <DiffStage lines={lines} />;
}
