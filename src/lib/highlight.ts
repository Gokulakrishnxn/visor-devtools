import { codeToHtml, codeToTokens, type BundledLanguage } from "shiki";

export const SHIKI_THEME = "github-dark-default";

/** Highlights a whole block to HTML (used by docs code blocks). */
export async function highlight(code: string, lang: string) {
  "use cache";
  try {
    return await codeToHtml(code, { lang: lang as BundledLanguage, theme: SHIKI_THEME });
  } catch {
    return await codeToHtml(code, { lang: "text", theme: SHIKI_THEME });
  }
}

/** Token lines, for renderers that wrap each line (diffs). */
export async function tokenLines(code: string, lang: BundledLanguage) {
  "use cache";
  const { tokens } = await codeToTokens(code, { lang, theme: SHIKI_THEME });
  return tokens.map((line) => line.map((t) => ({ content: t.content, color: t.color })));
}
