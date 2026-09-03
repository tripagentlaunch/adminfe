"use client";
/* =============================================================================
 * TripAgent — src/components/ui/Icon.tsx
 * Ported from web/js/icons.js (window.TA_ICONS) + the Ic() shorthand from
 * web/js/advisor.js (line ~47). One crafted inline-SVG icon set replacing
 * every emoji across the product. Hairline, 24px grid, stroke = currentColor
 * (inherits text colour), decorative (aria-hidden).
 * ===========================================================================*/

// path/shape data per icon (inside a 24x24 viewBox, stroked).
const PATHS: Record<string, string> = {
  inbox: "M3 13h4l2 3h6l2-3h4M5 5h14l2 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z",
  alert: "M12 9v4m0 4h.01M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z",
  flight: "M21 16v-2l-8-5V4a1.5 1.5 0 0 0-3 0v5l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-3.5z",
  hotel: "M3 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M12 21v-9a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v9M2 21h20M7 8h0M7 12h0M16 15h0M16 18h0",
  visa: "M5 3h10l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v4h4M8 13h8M8 17h5M9 9h2",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0",
  luggage: "M6 8h12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M9 20v1M15 20v1",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-1.8 5.2-5.2 1.8 1.8-5.2z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  sparkle: "M12 3l1.8 5.6L19 10l-5.2 1.4L12 17l-1.8-5.6L5 10l5.2-1.4zM19 4v3M20.5 5.5h-3",
  check: "M5 13l4 4L19 7",
  celebrate: "M3 21l5-12 7 7-12 5zM14 11l3-3M16 4l1 1M20 8l1-1M19 13h1M13 3v1",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z",
  note: "M4 4h13l3 3v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 9h8M8 13h8M8 17h5",
  refresh: "M21 12a9 9 0 1 1-2.6-6.3M21 4v4h-4",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  chevron: "M6 9l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  arrowUR: "M7 17 17 7M9 7h8v8",
  calendar: "M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 9h16M8 3v4M16 3v4",
  heart: "M12 20s-7-4.5-9.3-8.6C1 8.4 2.6 5 5.8 5 8 5 12 8 12 8s4-3 6.2-3c3.2 0 4.8 3.4 3.1 6.4C19 15.5 12 20 12 20z",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  shield: "M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z",
  home: "M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10",
  spark: "M12 4l1.4 6.6L20 12l-6.6 1.4L12 20l-1.4-6.6L4 12l6.6-1.4z",
  trend: "M3 17l6-6 4 4 8-8M21 7v5h-5",
  tag: "M20 13l-7 7a1.4 1.4 0 0 1-2 0l-7-7V4a1 1 0 0 1 1-1h7zM8 8h.01",
  handshake: "M11 17l2 2a1.4 1.4 0 0 0 2 0l4-4M3 10l4-4 4 1 3 3M2 12l4 4M12 7l3 3 3-1",
  sliders: "M4 8h10M18 8h2M4 16h2M10 16h10M14 6v4M8 14v4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  mail: "M3 6h18v12H3zM3 6l9 7 9-7",
  wifi: "M5 12.5a10 10 0 0 1 14 0M8 15.5a5.5 5.5 0 0 1 8 0M12 19h.01",
  radar: "M12 12l6-3.5M12 3v3M12 21v-3M3 12h3M18 12h3M6 6l2 2M18 6l-2 2M6 18l2-2M18 18l-2-2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  "inbox-check": "M3 13h4l2 3h6l2-3h4M5 5h14l2 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4zM9.5 16.5l1.5 1.5 3-3",
  sidebar: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 3v18",
  swap: "M3 7h14M13 3l4 4-4 4M21 17H7M11 21l-4-4 4-4",
  sort: "M7 4v16M7 4 3 8M7 4l4 4M17 20V4M17 20l4-4M17 20l-4-4",
  x: "M18 6 6 18M6 6l12 12",
  sunrise: "M3 18h18M12 14a4 4 0 0 1 4 4H8a4 4 0 0 1 4-4zM12 2v5M9 4l3 3 3-3",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M2 12h2M20 12h2",
  sunset: "M3 18h18M12 14a4 4 0 0 1 4 4H8a4 4 0 0 1 4-4zM12 2v5M9 6l3-3 3 3",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
};

// Aliases so callers can use intent names.
const ALIAS: Record<string, string> = {
  enquiry: "inbox", warning: "alert", traveller: "user", journey: "compass",
  points: "sparkle", booked: "check", success: "check", concierge: "chat",
  quote: "note", deal: "tag", deals: "tag", trending: "trend", analytics: "trend",
  lifecycle: "compass", broadcast: "send", award: "handshake", pulse: "spark",
  star: "sparkle", arrow: "arrowUR", expand: "chevron",
};

function resolve(name: any): string | null {
  return PATHS[name] ? name : (ALIAS[name] && PATHS[ALIAS[name]] ? ALIAS[name] : null);
}

export function Icon(props: any) {
  props = props || {};
  const key = resolve(props.name) || "sparkle";
  const size = props.size || 20;
  const sw = props.strokeWidth || 1.5;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={props.className || undefined}
      style={Object.assign({ flex: "none", verticalAlign: "middle", display: "inline-block" }, props.style || {})}
    >
      <path d={PATHS[key]} />
    </svg>
  );
}

// Raw markup (for non-React string contexts).
export function svg(name: any, size?: number) {
  const key = resolve(name) || "sparkle";
  size = size || 20;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + PATHS[key] + '"/></svg>';
}

export function has(n: any) {
  return !!resolve(n);
}

export const names = Object.keys(PATHS);

// Ic(name, opts) — icon shorthand ported from web/js/advisor.js (line ~47).
// Renders a crafted line icon (currentColor, aria-hidden) to REPLACE every
// emoji; returns null if no name resolves so callers still degrade quietly.
export function Ic(name: any, opts?: any) {
  return <Icon {...Object.assign({ name: name }, opts || {})} />;
}
