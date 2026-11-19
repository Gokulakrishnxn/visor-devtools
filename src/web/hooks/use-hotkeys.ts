import { useEffect, useRef } from "react";

export type HotkeyMap = Partial<Record<"a" | "e" | "d" | "j" | "k" | "mod+k" | "escape" | "[" | "]", () => void>>;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");

/**
 * Keyboard-first navigation (PRD §2): J/K walk spans, A/E/D answer a
 * breakpoint, ⌘K opens the palette. Single keys are ignored while typing.
 */
export function useHotkeys(map: HotkeyMap) {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = ref.current;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        m["mod+k"]?.();
        return;
      }
      if (e.key === "Escape") return m.escape?.();
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase() as keyof HotkeyMap;
      const fn = m[key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
