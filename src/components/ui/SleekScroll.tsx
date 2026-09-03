"use client";
/* =============================================================================
 * TripAgent — src/components/ui/SleekScroll.tsx
 * A custom scrollbar overlay, built 2026-09-02 for Queue after native
 * OS/browser scrollbars (styled via ::-webkit-scrollbar + scrollbar-width/
 * -color) turned out NOT to reliably satisfy "visible whenever content
 * overflows, whether or not the user is actively scrolling" — several
 * engines (macOS overlay scrollbars in particular) fade the thumb out the
 * moment scrolling stops regardless of ::-webkit-scrollbar styling, which
 * is a browser/OS-level overlay-scrollbar policy CSS can't reliably
 * override everywhere. This sidesteps that entirely: the native scrollbar
 * is hidden altogether on the inner scrollable div, and a real DOM thumb
 * is rendered in its place, positioned from actual scrollTop/scrollHeight/
 * clientHeight — so its visibility is under our own control, not the
 * browser's. The track column itself is always present (a fixed width),
 * so the reserved-space requirement ("space reserved whether or not the
 * thumb is currently visible") holds regardless of overflow state.
 * ===========================================================================*/
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "../../lib/cx";

// SleekScroll({ className, children }) — wraps a list/content block that
// may overflow; renders its own always-correctly-visible thumb instead of
// relying on the browser's native scrollbar.
export function SleekScroll(props: any) {
  const { className, children } = props;
  const scrollRef = useRef<any>(null);
  const [state, setState] = useState({ visible: false, top: 0, height: 0 });

  function update() {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const visible = scrollHeight > clientHeight + 1;
    const next = !visible
      ? { visible: false, top: 0, height: 0 }
      : (() => {
          const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * clientHeight);
          const maxTop = clientHeight - thumbHeight;
          const scrollable = scrollHeight - clientHeight;
          const top = scrollable > 0 ? (scrollTop / scrollable) * maxTop : 0;
          return { visible: true, top, height: thumbHeight };
        })();
    // Skip the setState when nothing actually changed (2026-09-02) —
    // required, not an optimization: this runs from a no-deps
    // useLayoutEffect (every render), so an UNCONDITIONAL setState here
    // — even to an equal-valued new object — re-triggers a render every
    // time, which re-triggers the effect again: an infinite update loop.
    setState((s) => (s.visible === next.visible && s.top === next.top && s.height === next.height ? s : next));
  }

  // No dependency array (2026-09-02) — deliberately runs after EVERY
  // render, not just mount: the list's own content (row count) changes
  // over time (enquiries added/removed), which changes scrollHeight
  // without necessarily changing the scroll container's OWN box size —
  // a ResizeObserver on the container wouldn't catch that, since it only
  // observes the element's own border box, not its scrollable content
  // size. Re-measuring on every render is cheap enough for a list this size.
  useLayoutEffect(() => {
    update();
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className={cx("taw-sleek-scroll", className)}>
      <div className="taw-sleek-scroll-content" ref={scrollRef}>
        {children}
      </div>
      <div className="taw-sleek-scroll-track">
        {state.visible ? (
          <div className="taw-sleek-scroll-thumb" style={{ height: state.height, transform: "translateY(" + state.top + "px)" }} />
        ) : null}
      </div>
    </div>
  );
}
