import { useState } from "react";
import { cn } from "@/lib/utils";

/** A per-viewer layout preference kept in localStorage (absent storage is fine). */
export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`visor:${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(`visor:${key}`, JSON.stringify(v));
    } catch {
      // private mode or blocked storage: keep it for this page only
    }
  };
  return [value, set];
}

/**
 * Drag handle on a panel edge. `side` is the edge the handle sits on;
 * dragging changes the width within [min, max]; double-click resets.
 */
export function Resizer({
  side,
  width,
  min,
  max,
  reset,
  onWidth,
  label,
}: {
  side: "left" | "right";
  width: number;
  min: number;
  max: number;
  reset: number;
  onWidth: (w: number) => void;
  label: string;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onDoubleClick={() => onWidth(reset)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 16;
        const grow = side === "right" ? "ArrowRight" : "ArrowLeft";
        const shrink = side === "right" ? "ArrowLeft" : "ArrowRight";
        if (e.key === grow) onWidth(Math.min(max, width + step));
        if (e.key === shrink) onWidth(Math.max(min, width - step));
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        const startX = e.clientX;
        const start = width;
        setDragging(true);
        document.body.style.cursor = "col-resize";
        const move = (ev: PointerEvent) => {
          const delta = side === "right" ? ev.clientX - startX : startX - ev.clientX;
          onWidth(Math.max(min, Math.min(max, Math.round(start + delta))));
        };
        const up = () => {
          setDragging(false);
          document.body.style.cursor = "";
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      className={cn(
        "group absolute inset-y-0 z-20 w-2 cursor-col-resize outline-none",
        side === "right" ? "-right-1" : "-left-1",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors",
          dragging ? "bg-indigo" : "bg-transparent group-hover:bg-white/25 group-focus-visible:bg-indigo",
        )}
      />
    </div>
  );
}
