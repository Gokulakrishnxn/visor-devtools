import { useEffect, useState } from "react";
import type { HighlighterCore, ThemedToken } from "shiki/core";

// One lazily created highlighter with the JavaScript regex engine (no WASM,
// no network): only the grammars a coding agent's output needs.
let loading: Promise<HighlighterCore> | null = null;

function highlighter() {
  loading ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
    ]);
    return createHighlighterCore({
      themes: [import("@shikijs/themes/dark-plus")],
      langs: [
        import("@shikijs/langs/typescript"),
        import("@shikijs/langs/tsx"),
        import("@shikijs/langs/json"),
        import("@shikijs/langs/shellscript"),
        import("@shikijs/langs/markdown"),
      ],
      engine: createJavaScriptRegexEngine(),
    });
  })();
  return loading;
}

/** VS Code Dark+ token colors, the palette Cursor users read all day. */
export const THEME = "dark-plus";

export function langFor(path?: string): string {
  const ext = path?.split(".").pop()?.toLowerCase();
  if (ext === "ts" || ext === "mts" || ext === "cts") return "typescript";
  if (ext === "tsx" || ext === "jsx" || ext === "js") return "tsx";
  if (ext === "json") return "json";
  if (ext === "md" || ext === "mdx") return "markdown";
  if (ext === "sh" || ext === "bash") return "shellscript";
  return "typescript";
}

export type TokenLine = Pick<ThemedToken, "content" | "color">[];

/** Highlighted token lines, or null until the highlighter has loaded. */
export function useTokens(code: string, lang: string): TokenLine[] | null {
  const [tokens, setTokens] = useState<{ key: string; lines: TokenLine[] } | null>(null);
  const key = `${lang}\u0000${code}`;
  useEffect(() => {
    let live = true;
    void highlighter().then((h) => {
      if (!live) return;
      const lines = h.codeToTokensBase(code, { lang, theme: THEME }).map((l) => l.map((t) => ({ content: t.content, color: t.color })));
      setTokens({ key, lines });
    });
    return () => {
      live = false;
    };
  }, [code, lang, key]);
  return tokens?.key === key ? tokens.lines : null;
}
