"use client";
import { cx } from "../../lib/cx";

// Ported from web/js/advisor.js (line ~737).
export function Card(props: any) {
  const { className, title, icon, sub, actions, flush, children } = props;
  return (
    <section className={cx("taw-card", className)}>
      {title != null ? (
        <div className="taw-card-h">
          {icon ? <span>{icon}</span> : null}
          <h3>{title}</h3>
          {sub ? <span className="sub">{sub}</span> : null}
          {actions ? <div style={{ marginLeft: "auto" }}>{actions}</div> : null}
        </div>
      ) : null}
      <div className={cx("taw-card-b", flush && "flush")}>{children}</div>
    </section>
  );
}
