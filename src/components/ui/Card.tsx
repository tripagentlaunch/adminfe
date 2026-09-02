"use client";
import { cx } from "../../lib/cx";

// Ported from web/js/advisor.js (line ~737).
// containerRef (2026-09-02, optional) — lets a caller measure/animate the
// Card's own root element (e.g. SearchDesksPanel animating its height
// between fit-content and full-column-height) without needing a full
// forwardRef wrapper.
export function Card(props: any) {
  const { className, title, icon, sub, actions, flush, children, containerRef } = props;
  return (
    <section ref={containerRef} className={cx("taw-card", className)}>
      {title != null ? (
        <div className="taw-card-h">
          {icon || null}
          <h3>{title}</h3>
          {sub ? <span className="sub">{sub}</span> : null}
          {actions ? <div style={{ marginLeft: "auto" }}>{actions}</div> : null}
        </div>
      ) : null}
      <div className={cx("taw-card-b", flush && "flush")}>{children}</div>
    </section>
  );
}
