import { useCallback, useEffect, useRef } from "react";
import { useSession, useTraceModel } from "@/stores/session-store";
import { useUi } from "@/stores/ui-store";
import { walkOrder } from "@/lib/trace-model";
import { useHotkeys, type HotkeyMap } from "./use-hotkeys";

/**
 * Everything a design needs from the harness: the live model, the selected
 * span, keyboard navigation (J/K, A/E/D, ⌘K) and an auto-started mock run
 * so every prototype streams the same scenario on open.
 */
export function useHarness({ scrollIntoView = true, extraKeys = {} }: { scrollIntoView?: boolean; extraKeys?: HotkeyMap } = {}) {
  const model = useTraceModel();
  const { token, connection, sessionId, selectedSpanId, connect, start, resolve, select } = useSession();
  const ui = useUi();
  const started = useRef(false);

  useEffect(() => connect(), [connect]);
  useEffect(() => {
    if (connection === "open" && !sessionId && !started.current) {
      started.current = true;
      void start();
    }
  }, [connection, sessionId, start]);

  const focus = useCallback(
    (spanId: string) => {
      select(spanId);
      if (scrollIntoView) document.getElementById(`span-${spanId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
    [select, scrollIntoView],
  );

  const step = (dir: 1 | -1) => {
    const order = walkOrder(model);
    if (!order.length) return;
    const i = selectedSpanId ? order.indexOf(selectedSpanId) : -1;
    const next = order[Math.max(0, Math.min(order.length - 1, i + dir))];
    if (next) focus(next);
  };

  useHotkeys({
    ...extraKeys,
    "mod+k": () => ui.setPalette(!ui.paletteOpen),
    escape: () => {
      ui.setPalette(false);
      ui.setInspector(false);
    },
    j: () => step(1),
    k: () => step(-1),
    a: () => model.paused && !ui.editing && void resolve({ decision: "approved" }),
    e: () => model.paused && ui.setEditing(true),
    d: () => model.paused && ui.setDenying(true),
  });

  return { model, token, connection, selectedSpanId, select: focus, start, ui };
}
