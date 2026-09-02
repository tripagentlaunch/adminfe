"use client";
/* =============================================================================
 * TripAgent — src/components/DevInspector.tsx
 * Dev-only hover inspector. Press "I" to toggle it on; hover any element to
 * see its computed font/color/spacing/flex/radius/shadow — and, where a
 * value matches a live custom property, which design token it resolves to
 * (e.g. "rgb(23,19,16) (--ink)"). Press "L" to lock the tooltip on whatever
 * element is currently under the cursor, so you can move the mouse to read
 * it without it jumping around; press again to unlock. Both are single,
 * unmodified keys — safe because they're ignored whenever focus is on an
 * input/textarea/select/contentEditable (see isTypingTarget()), so normal
 * typing (including on the sign-in form) is never intercepted. Mounted at the very
 * root (see AppRoot.tsx) so it's available on the sign-in screen too, not
 * just once past the gate. Never rendered outside NEXT_PUBLIC_APP_ENV=
 * development (see src/lib/env.ts) — this ships in no real deployment.
 *
 * The token lookup is NOT a hand-maintained list — it reads every `--*`
 * custom property actually resolved on <html> at runtime via
 * getComputedStyle(), so it always matches tokens.css exactly, including any
 * future addition, with nothing here to keep in sync by hand.
 * ===========================================================================*/
import { useEffect, useRef, useState } from "react";
import { IS_DEV } from "../lib/env";

type Info = {
  tag: string;
  font: string;
  lineHeight: string;
  color: string;
  background: string;
  padding: string;
  margin: string;
  flexContainer: string | null;
  gridContainer: string | null;
  flexItem: string;
  radius: string;
  border: string;
  shadow: string;
};

type TokenMaps = {
  fontSize: Record<string, string>;
  spacing: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  color: Record<string, string>;
};

function tokenCategory(name: string): keyof TokenMaps | null {
  if (/^t-/.test(name)) return "fontSize";
  if (/^sp-\d/.test(name)) return "spacing";
  if (/^radius/.test(name)) return "radius";
  if (/^shadow/.test(name) || name === "focus") return "shadow";
  return "color"; // resolved below only if the raw value actually looks like a color
}

// Custom properties preserve their DECLARED text ("#171310"), but the
// computed style of a real property that uses one (cs.color, cs.boxShadow,
// ...) comes back browser-normalized ("rgb(23, 19, 16)"). Comparing those
// two strings directly would almost never match for colors/shadows — so
// each candidate value is round-tripped through a hidden scratch element on
// the SAME property type first, putting both sides in the same format
// before they're compared. Plain lengths (px) don't get reformatted, so
// they're indexed as-is.
//
// Split into separate maps PER CATEGORY (not one flat map) — several
// unrelated tokens share the same raw number (e.g. --sp-3 and --t-label are
// both "12px"), so a flat map would randomly label a font-size as a spacing
// token or vice versa depending on iteration order. Each CSS property below
// only ever looks itself up in its own category's map.
function buildTokenMap(): TokenMaps {
  const maps: TokenMaps = { fontSize: {}, spacing: {}, radius: {}, shadow: {}, color: {} };
  if (typeof window === "undefined") return maps;
  const rootStyle = getComputedStyle(document.documentElement);
  const scratch = document.createElement("div");
  scratch.style.position = "absolute";
  scratch.style.visibility = "hidden";
  scratch.style.pointerEvents = "none";
  document.body.appendChild(scratch);

  for (let i = 0; i < rootStyle.length; i++) {
    const prop = rootStyle[i];
    if (!prop.startsWith("--")) continue;
    const name = prop.slice(2);
    const raw = rootStyle.getPropertyValue(prop).trim();
    if (!raw) continue;
    const category = tokenCategory(name);
    if (!category) continue;

    if (category === "shadow") {
      scratch.style.boxShadow = raw;
      const normalized = getComputedStyle(scratch).boxShadow;
      scratch.style.boxShadow = "";
      if (normalized && !(normalized in maps.shadow)) maps.shadow[normalized] = prop;
    } else if (category === "color") {
      if (!/^#|^rgb|^hsl/i.test(raw)) continue; // not actually a color (e.g. --serif, --ease) — skip
      scratch.style.color = raw;
      const normalized = getComputedStyle(scratch).color;
      scratch.style.color = "";
      if (normalized && !(normalized in maps.color)) maps.color[normalized] = prop;
    } else {
      // fontSize / spacing / radius — plain px values, compare as declared.
      if (!(raw in maps[category])) maps[category][raw] = prop;
    }
  }

  document.body.removeChild(scratch);
  return maps;
}

function withToken(value: string, tokenMap: Record<string, string> | undefined, display?: string): string {
  // Defensive: a dev tool should degrade to "no token label" rather than
  // crash the page it's inspecting — e.g. if buildTokenMap() hasn't
  // finished yet, or a stale closure survives a hot-reload mid-edit.
  const shown = display !== undefined ? display : value;
  if (!tokenMap || !value) return shown;
  // Token-map lookup always keys off the RAW getComputedStyle value (e.g.
  // "rgb(23, 19, 16)") since that's how buildTokenMap() built it — `display`
  // (e.g. a hex conversion for on-screen readability) only swaps what's
  // shown, never what's matched against the token map.
  const hit = tokenMap[value.trim()];
  return hit ? `${shown} (${hit})` : shown;
}

// getComputedStyle always normalizes colors to rgb()/rgba(), which is
// harder to eyeball/paste into a design tool than hex — this is display-
// only formatting, the raw rgb string is still what's matched against the
// token map above. Anything that isn't a plain rgb()/rgba() (e.g.
// "transparent", or an already-hex value) passes through unchanged.
function toHex(value: string): string {
  const m = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (!m) return value;
  const [, r, g, b, a] = m;
  const byte = (n: string) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, "0");
  let hex = "#" + byte(r) + byte(g) + byte(b);
  const alpha = a !== undefined ? parseFloat(a) : 1;
  if (alpha < 1) hex += Math.round(alpha * 255).toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

function uniform(vals: string[]): boolean {
  return vals.every((v) => v === vals[0]);
}

function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

function readInfo(el: HTMLElement, tokenMaps: TokenMaps): Info {
  const cs = getComputedStyle(el);
  const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft];
  const mar = [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft];
  const cls =
    el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";

  const isFlexContainer = cs.display.includes("flex");
  const isGridContainer = cs.display.includes("grid");
  // Gap applies to both flex and grid containers — previously missing
  // entirely, so a grid's column/row gutter (e.g. .taw-grid's 12px between
  // Queue/Itinerary Builder/Search) was invisible in this tool no matter
  // what you hovered. Reported on whichever container type actually applies.
  const gap = `${withToken(cs.columnGap, tokenMaps.spacing)} / ${withToken(cs.rowGap, tokenMaps.spacing)}`;

  return {
    tag: el.tagName.toLowerCase() + cls,
    font: `${cs.fontFamily.split(",")[0].replace(/["']/g, "")} ${cs.fontWeight} / ${withToken(cs.fontSize, tokenMaps.fontSize)}`,
    lineHeight: cs.lineHeight,
    color: withToken(cs.color, tokenMaps.color, toHex(cs.color)),
    background: withToken(cs.backgroundColor, tokenMaps.color, toHex(cs.backgroundColor)),
    padding: uniform(pad) ? withToken(pad[0], tokenMaps.spacing) : pad.map((p) => withToken(p, tokenMaps.spacing)).join(" / "),
    margin: uniform(mar) ? withToken(mar[0], tokenMaps.spacing) : mar.map((p) => withToken(p, tokenMaps.spacing)).join(" / "),
    flexContainer: isFlexContainer
      ? `${cs.flexDirection}, gap:${gap}, justify:${cs.justifyContent}, align:${cs.alignItems}, wrap:${cs.flexWrap}`
      : null,
    gridContainer: isGridContainer ? `cols:${cs.gridTemplateColumns}, gap:${gap}` : null,
    flexItem: `grow ${cs.flexGrow} / shrink ${cs.flexShrink} / basis ${cs.flexBasis}`,
    radius: withToken(cs.borderRadius, tokenMaps.radius),
    border: cs.borderWidth !== "0px" ? `${cs.borderWidth} ${cs.borderStyle} ${withToken(cs.borderColor, tokenMaps.color, toHex(cs.borderColor))}` : "none",
    shadow: cs.boxShadow !== "none" ? withToken(cs.boxShadow, tokenMaps.shadow) : "none",
  };
}

export function DevInspector() {
  const [active, setActive] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [info, setInfo] = useState<Info | null>(null);
  const tokenMapRef = useRef<TokenMaps>({ fontSize: {}, spacing: {}, radius: {}, shadow: {}, color: {} });
  const lockedRef = useRef(false);
  const activeRef = useRef(false);

  useEffect(() => {
    if (!IS_DEV) return;
    tokenMapRef.current = buildTokenMap();
  }, []);

  // Keyboard shortcuts — single, unmodified keys, ignored while typing (see
  // isTypingTarget) so they never interfere with the sign-in form or any
  // other input on the page.
  useEffect(() => {
    if (!IS_DEV) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        const next = !activeRef.current;
        activeRef.current = next;
        setActive(next);
        if (!next) {
          lockedRef.current = false;
          setLocked(false);
          setInfo(null);
        }
      } else if ((e.key === "l" || e.key === "L") && activeRef.current) {
        e.preventDefault();
        lockedRef.current = !lockedRef.current;
        setLocked(lockedRef.current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!IS_DEV || !active) return;

    function onMove(e: MouseEvent) {
      setPos({ x: e.clientX, y: e.clientY });
      if (lockedRef.current) return; // frozen on whatever was last read
      const el = (e.target as HTMLElement) || document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.closest("[data-ta-inspector]")) return; // ignore the inspector's own UI
      try {
        setInfo(readInfo(el, tokenMapRef.current));
      } catch (err) {
        // A dev tool must never crash the page it's inspecting. Swallow and
        // keep whatever was last shown rather than throw mid-hover.
        console.warn("[DevInspector] readInfo failed", err);
      }
    }

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [active]);

  if (!IS_DEV) return null;

  const tooltipLeft = typeof window !== "undefined" ? Math.min(pos.x + 16, window.innerWidth - 300) : pos.x + 16;
  const tooltipTop = typeof window !== "undefined" ? Math.min(pos.y + 16, window.innerHeight - 300) : pos.y + 16;

  return (
    <div data-ta-inspector="true">
      {/* Small always-visible status pill — no click target, purely a reminder
          of the shortcuts and current state (off / hovering / locked). */}
      <div
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 999999,
          pointerEvents: "none",
          background: active ? "#171310" : "rgba(23,19,16,.55)",
          color: "#FAF6EB",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: ".02em",
          borderRadius: 999,
          padding: "5px 12px",
          boxShadow: "0 2px 8px rgba(0,0,0,.18)",
        }}
      >
        {active ? (locked ? 'Inspect: LOCKED ("L" to unlock)' : 'Inspect: ON ("L" to lock)') : 'Press "I" to inspect'}
      </div>

      {active && info ? (
        <div
          style={{
            position: "fixed",
            left: tooltipLeft,
            top: tooltipTop,
            zIndex: 999999,
            pointerEvents: "none",
            background: "rgba(23,19,16,.95)",
            color: "#FAF6EB",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11.5,
            lineHeight: 1.65,
            padding: "10px 13px",
            borderRadius: 8,
            maxWidth: 300,
            boxShadow: "0 8px 24px rgba(0,0,0,.35)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 5, color: "#D9B24B" }}>{info.tag}</div>
          <div>font: {info.font}</div>
          <div>line-height: {info.lineHeight}</div>
          <div>color: {info.color}</div>
          <div>background: {info.background}</div>
          <div>padding: {info.padding}</div>
          <div>margin: {info.margin}</div>
          {info.flexContainer ? <div>flex (container): {info.flexContainer}</div> : null}
          {info.gridContainer ? <div>grid (container): {info.gridContainer}</div> : null}
          <div>flex (item): {info.flexItem}</div>
          <div>radius: {info.radius}</div>
          <div>border: {info.border}</div>
          <div>shadow: {info.shadow}</div>
        </div>
      ) : null}
    </div>
  );
}
