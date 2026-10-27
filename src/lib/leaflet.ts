// The map engine for the hotel maps (2026-10-27): Leaflet with OpenStreetMap-based tiles, loaded once
// from a CDN the first time a map opens. No API key and no billing: the Map button works everywhere.
// (The tiles are OpenStreetMap's own, credited on the map.)

const VERSION = "1.9.4";
const BASE = "https://cdn.jsdelivr.net/npm/leaflet@" + VERSION + "/dist/";

let pending: Promise<any> | null = null;

export function loadLeaflet(): Promise<any> {
  const w: any = typeof window === "undefined" ? null : window;
  if (!w) return Promise.reject(new Error("load"));
  if (w.L && w.L.map) return Promise.resolve(w.L);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-taw-leaflet]')) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = BASE + "leaflet.css";
      css.setAttribute("data-taw-leaflet", "1");
      document.head.appendChild(css);
    }
    const script = document.createElement("script");
    script.src = BASE + "leaflet.js";
    script.async = true;
    script.onload = () => resolve(w.L);
    script.onerror = () => {
      pending = null;
      reject(new Error("load"));
    };
    document.head.appendChild(script);
  });
  return pending;
}

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
