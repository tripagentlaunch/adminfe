"use client";
/* Side-by-side columns the advisor can resize by dragging the handles between
   them (Console: Traveller Profile | Itinerary Builder | Search). Widths are
   fractions of the row, clamped so no column becomes unusable, and remembered
   per browser. Double-click a handle to go back to the default split; arrow
   keys move a focused handle. Below 1100px the grid stacks as before and the
   handles hide (CSS). */
import { Children, useCallback, useEffect, useRef, useState } from "react";

const MIN_FRACTION = 0.16;

function readSaved(key: string, count: number): number[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : null;
    if (Array.isArray(v) && v.length === count && v.every((x) => typeof x === "number" && x >= MIN_FRACTION)) return v;
  } catch {
    /* storage blocked: defaults */
  }
  return null;
}

export function ResizableColumns({ storageKey, defaults, className, children }: {
  storageKey: string;
  /** Default widths as relative weights, e.g. [3, 4, 3]. */
  defaults: number[];
  className?: string;
  children: React.ReactNode;
}) {
  const cols = Children.toArray(children);
  const norm = (w: number[]) => { const t = w.reduce((a, b) => a + b, 0); return w.map((x) => x / t); };
  const [fr, setFr] = useState<number[]>(() => (typeof window !== "undefined" && readSaved(storageKey, cols.length)) || norm(defaults));
  const box = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ i: number; startX: number; start: number[]; width: number } | null>(null);

  const save = useCallback((next: number[]) => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* not critical */ }
  }, [storageKey]);

  // Moves the boundary after column i by `delta` (a fraction of the row).
  const shift = useCallback((base: number[], i: number, delta: number) => {
    const a = base[i] + delta, b = base[i + 1] - delta;
    if (a < MIN_FRACTION || b < MIN_FRACTION) {
      const room = delta > 0 ? base[i + 1] - MIN_FRACTION : -(base[i] - MIN_FRACTION);
      delta = Math.abs(room) < Math.abs(delta) ? room : delta;
    }
    const next = base.slice();
    next[i] = base[i] + delta;
    next[i + 1] = base[i + 1] - delta;
    return next;
  }, []);

  useEffect(() => {
    function move(e: PointerEvent) {
      const d = drag.current;
      if (!d) return;
      setFr(shift(d.start, d.i, (e.clientX - d.startX) / d.width));
    }
    function up() {
      if (!drag.current) return;
      drag.current = null;
      document.body.classList.remove("taw-resizing");
      setFr((cur) => { save(cur); return cur; });
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [save, shift]);

  const template = fr.map((f, i) => `minmax(0, ${f.toFixed(4)}fr)` + (i < fr.length - 1 ? " 10px" : "")).join(" ");

  return (
    <div ref={box} className={(className || "") + " taw-resizable"} style={{ ["--cols" as any]: template }}>
      {cols.map((child, i) => (
        <ColumnSlot key={i} last={i === cols.length - 1}
          onDown={(e) => {
            if (!box.current) return;
            e.preventDefault();
            drag.current = { i, startX: e.clientX, start: fr, width: box.current.getBoundingClientRect().width };
            document.body.classList.add("taw-resizing");
          }}
          onReset={() => { const d = norm(defaults); setFr(d); save(d); }}
          onKey={(dir) => setFr((cur) => { const next = shift(cur, i, dir * 0.02); save(next); return next; })}
        >
          {child}
        </ColumnSlot>
      ))}
    </div>
  );
}

function ColumnSlot({ children, last, onDown, onReset, onKey }: {
  children: React.ReactNode; last: boolean;
  onDown: (e: React.PointerEvent) => void; onReset: () => void; onKey: (dir: number) => void;
}) {
  return (
    <>
      {children}
      {last ? null : (
        <div
          className="taw-colhandle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize columns (drag, or use arrow keys; double-click to reset)"
          title="Drag to resize · double-click to reset"
          tabIndex={0}
          onPointerDown={onDown}
          onDoubleClick={onReset}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") { e.preventDefault(); onKey(-1); }
            if (e.key === "ArrowRight") { e.preventDefault(); onKey(1); }
          }}
        >
          <span />
        </div>
      )}
    </>
  );
}
