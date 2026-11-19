import { useEffect, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";

const theme = EditorView.theme(
  {
    "&": { backgroundColor: "var(--code)", color: "#d4d4d4", fontSize: "12.5px", borderRadius: "8px" },
    ".cm-content": { fontFamily: "var(--font-mono)", padding: "8px 0", caretColor: "#aeafad" },
    ".cm-gutters": { backgroundColor: "transparent", color: "#6e7681", border: "none" },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.04)" },
    "&.cm-focused": { outline: "1px solid var(--ring)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "#264f78 !important" },
    ".cm-cursor": { borderLeftColor: "#aeafad" },
  },
  { dark: true },
);

// Same palette as the Shiki dark-plus (VS Code Dark+) theme used everywhere else
const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: "#9cdcfe" },
  { tag: tags.string, color: "#ce9178" },
  { tag: tags.number, color: "#b5cea8" },
  { tag: [tags.bool, tags.null], color: "#569cd6" },
  { tag: tags.punctuation, color: "#d4d4d4" },
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
