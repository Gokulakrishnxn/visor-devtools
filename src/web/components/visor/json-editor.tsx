import { useEffect, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";

const theme = EditorView.theme(
  {
    "&": { backgroundColor: "rgba(0,0,0,0.35)", color: "#e6edf3", fontSize: "12.5px", borderRadius: "8px" },
    ".cm-content": { fontFamily: "var(--font-mono)", padding: "8px 0", caretColor: "#7aa2ff" },
    ".cm-gutters": { backgroundColor: "transparent", color: "#6b717d", border: "none" },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.04)" },
    "&.cm-focused": { outline: "1px solid rgba(122,162,255,0.45)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(122,162,255,0.25) !important" },
    ".cm-cursor": { borderLeftColor: "#7aa2ff" },
  },
  { dark: true },
);

// Same palette as the Shiki github-dark-default theme used everywhere else
const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: "#7ee787" },
  { tag: tags.string, color: "#a5d6ff" },
  { tag: [tags.number, tags.bool, tags.null], color: "#79c0ff" },
  { tag: tags.punctuation, color: "#8b949e" },
]);

/** Inline CodeMirror 6 JSON editor for "Edit JSON" overrides. */
export function JsonEditor({
  value,
  onChange,
  onSubmit,
  autoFocus = true,
  minHeight = 96,
}: {
  value: string;
  onChange: (text: string) => void;
  /** ⌘/Ctrl+Enter */
  onSubmit?: () => void;
  autoFocus?: boolean;
  minHeight?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef({ onChange, onSubmit });
  useEffect(() => {
    cb.current = { onChange, onSubmit };
  });

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          json(),
          theme,
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          EditorView.theme({ ".cm-scroller": { minHeight: `${minHeight}px` } }),
          keymap.of([{ key: "Mod-Enter", run: () => (cb.current.onSubmit?.(), true) }]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    if (autoFocus) view.focus();
    return () => view.destroy();
    // The editor owns its document after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="overflow-hidden rounded-lg" />;
}
