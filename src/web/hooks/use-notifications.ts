import { useEffect, useRef, useState } from "react";
import type { TraceModel } from "@/lib/trace-model";

const KEY = "visor:desktop-notifications";

function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

/** Desktop notifications preference (browser Notification API; native in the desktop app later). */
export function useNotificationPref() {
  const supported = typeof Notification !== "undefined";
  const [on, setOn] = useState(() => supported && readPref() && Notification.permission === "granted");
  const toggle = async () => {
    if (!supported) return;
    let next = !on;
    if (next && Notification.permission !== "granted") next = (await Notification.requestPermission()) === "granted";
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      // the switch still works for this page
    }
  };
  return { supported, on, toggle, denied: supported && Notification.permission === "denied" };
}

/**
 * Notifies when a run pauses for a decision or a warning/danger alert fires,
 * but only while the window is in the background (you're working elsewhere).
 */
export function useDesktopNotifications(model: TraceModel) {
  const seen = useRef(new Set<string>());
  const first = useRef(true);

  useEffect(() => {
    const items = [
      ...(model.paused ? [{ id: `bp-${model.paused.spanId}`, title: `Paused before ${model.paused.toolName}`, body: `Rule ${model.paused.rule}. Approve, edit or deny in V.I.S.O.R.` }] : []),
      ...model.alerts.filter((a) => a.level !== "info").map((a) => ({ id: a.id, title: a.title, body: a.detail })),
    ];
    // Don't replay history when a page opens on an existing session
    if (first.current) {
      items.forEach((i) => seen.current.add(i.id));
      first.current = model.turns.length === 0;
      return;
    }
    const enabled = typeof Notification !== "undefined" && Notification.permission === "granted" && readPref();
    for (const i of items) {
      if (seen.current.has(i.id)) continue;
      seen.current.add(i.id);
      if (enabled && document.hidden) {
        const n = new Notification(i.title, { body: i.body, tag: i.id });
        n.onclick = () => window.focus();
      }
    }
  }, [model.paused, model.alerts, model.turns.length]);
}
