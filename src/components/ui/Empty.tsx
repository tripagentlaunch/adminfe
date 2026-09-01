"use client";
import { Icon } from "./Icon";
import { cx } from "../../lib/cx";

// Ported from web/js/advisor.js (line ~766). Accepts either a JSX icon
// element (existing call sites) or a bare string icon name (routed through
// Icon) plus an optional title/message pair — CallCopilotPanel.jsx was built
// assuming the latter shape, which this didn't actually support until now
// (title/message were silently dropped and a string icon rendered as literal
// text). Every other call site's {icon, children} shape is unchanged.
//
// `size="page"` (2026-08-28): per the Jira type-usage analysis in
// design_reference_jira memory — Jira gives empty/onboarding states its
// SECOND-biggest text in the whole app (bigger than a normal page title),
// specifically when the empty state is the only thing on the screen (a
// whole empty Board/Plan tab), not when it's one inset panel among other
// populated cards. Default stays exactly as before (small in-card empties
// like Itinerary Cart, Member 360 shouldn't suddenly get a huge headline —
// nothing else on those screens is competing with them for size, but they
// share the screen with other populated cards, unlike a genuinely
// whole-page empty state). Use size="page" only where Empty is the ENTIRE
// content of a route, e.g. ConsolePlaceholder.
export function Empty(props: any) {
  const { icon, title, message, children, size } = props;
  const iconNode = typeof icon === "string" ? <Icon name={icon} size={size === "page" ? 32 : 26} /> : icon;
  const hasTitleOrMessage = title != null || message != null;
  return (
    <div className={cx("taw-empty", size === "page" && "taw-empty--page")}>
      {iconNode ? (
        <span className="ic-badge">
          <span className="ic">{iconNode}</span>
        </span>
      ) : null}
      {hasTitleOrMessage ? (
        <>
          {title ? <div className="title">{title}</div> : null}
          {message ? <div className="message">{message}</div> : null}
        </>
      ) : (
        children
      )}
    </div>
  );
}
