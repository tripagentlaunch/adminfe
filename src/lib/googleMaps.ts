// Loads the Google Maps JavaScript API once, for the hotel results map (2026-10-27).
// The key is public by design (it is sent to the browser): restrict it to this site's domains in
// Google Cloud, and give it the Maps JavaScript API. Set it as NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.

export const GOOGLE_MAPS_KEY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();

export type MapsFailure = "no_key" | "auth" | "load";

let pending: Promise<any> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

/** True once Google has rejected the key for this site (wrong domain, API not enabled, billing). */
export function mapsAuthFailed(): boolean {
  return authFailed;
}

export function onMapsAuthFailure(fn: () => void): () => void {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export function loadGoogleMaps(): Promise<any> {
  const w: any = typeof window === "undefined" ? null : window;
  if (!w) return Promise.reject(new Error("load"));
  if (w.google && w.google.maps && w.google.maps.Map) return Promise.resolve(w.google.maps);
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error("no_key"));
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    // Google calls this when it refuses the key; the map then shows its own error and stays blank.
    w.gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach((fn) => fn());
    };
    const cb = "__tawGoogleMapsReady";
    w[cb] = () => resolve(w.google.maps);
    const script = document.createElement("script");
    script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(GOOGLE_MAPS_KEY) + "&callback=" + cb + "&loading=async&v=weekly";
    script.async = true;
    script.onerror = () => {
      pending = null;
      reject(new Error("load"));
    };
    document.head.appendChild(script);
  });
  return pending;
}
