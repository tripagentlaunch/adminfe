"use client";

// The hotel results on a Google map (2026-10-27), like TripSure's own List / Map switch.
// One marker per hotel that has coordinates: the price when the listing has one, else its
// stars. Clicking a marker opens a small card with a button to jump to that hotel in the list.
// The map keeps the same markers while more hotels load behind the first ones (it only adds and
// removes what changed) and re-frames itself only when the advisor changes a filter.

import { useEffect, useRef, useState } from "react";
import { GOOGLE_MAPS_KEY, loadGoogleMaps, mapsAuthFailed, onMapsAuthFailure } from "../../lib/googleMaps";
import { inr } from "../../services/api";

type Pin = { id: string; name: string; lat: number; lng: number; stars: number; net: number; image?: string | null };

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function priceLabel(net: number): string {
  if (net >= 100000) return "₹" + (net / 100000).toFixed(1).replace(/\.0$/, "") + "L";
  if (net >= 1000) return "₹" + (net / 1000).toFixed(net >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
  return "₹" + Math.round(net);
}

// A rounded label as the marker icon: the price (or ★ stars), darker when selected.
function pinIcon(maps: any, text: string, selected: boolean) {
  const w = Math.max(34, 12 + text.length * 7.2);
  const fill = selected ? "#1F2430" : "#8A5A2B";
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="26">' +
    '<rect x="1" y="1" width="' + (w - 2) + '" height="22" rx="11" fill="' + fill + '" stroke="#fff" stroke-width="2"/>' +
    '<text x="' + w / 2 + '" y="16" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">' + esc(text) + "</text></svg>";
  return { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg), scaledSize: new maps.Size(w, 26), anchor: new maps.Point(w / 2, 13) };
}

export function HotelMap({ hotels, selectedId, onPick, fitKey, city }: { hotels: any[]; selectedId: string | null; onPick: (id: string) => void; fitKey: string; city?: string }) {
  const box = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapsRef = useRef<any>(null);
  const markers = useRef<Map<string, any>>(new Map());
  const info = useRef<any>(null);
  const framedFor = useRef<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "no_key" | "auth" | "load">(GOOGLE_MAPS_KEY ? "loading" : "no_key");

  const pins: Pin[] = [];
  hotels.forEach((o) => {
    const d = o.detail || {};
    const lat = Number(d.lat), lng = Number(d.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) {
      pins.push({ id: String(o.id), name: d.hotelName || "Hotel", lat, lng, stars: d.stars || 0, net: Number(o.base_net) || 0, image: d.image });
    }
  });

  // The map itself, once.
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY) return;
    let alive = true;
    const stopAuth = onMapsAuthFailure(() => alive && setState("auth"));
    loadGoogleMaps()
      .then((maps: any) => {
        if (!alive || !box.current) return;
        mapsRef.current = maps;
        mapRef.current = new maps.Map(box.current, {
          center: { lat: 20.5937, lng: 78.9629 },
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        info.current = new maps.InfoWindow();
        setState(mapsAuthFailed() ? "auth" : "ready");
      })
      .catch((e: any) => alive && setState(e && e.message === "no_key" ? "no_key" : "load"));
    return () => {
      alive = false;
      stopAuth();
      markers.current.forEach((m) => m.setMap(null));
      markers.current.clear();
      if (info.current) info.current.close();
      mapRef.current = null;
    };
  }, []);

  // The markers: add what is new, remove what is gone, restyle what changed.
  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (state !== "ready" || !maps || !map) return;
    const want = new Set(pins.map((p) => p.id));
    markers.current.forEach((m, id) => {
      if (!want.has(id)) {
        m.setMap(null);
        markers.current.delete(id);
      }
    });
    pins.forEach((p) => {
      const text = p.net > 0 ? priceLabel(p.net) : p.stars ? "★" + p.stars : "•";
      const selected = p.id === selectedId;
      const look = text + (selected ? "*" : "");
      let m = markers.current.get(p.id);
      if (!m) {
        m = new maps.Marker({ position: { lat: p.lat, lng: p.lng }, map, title: p.name, icon: pinIcon(maps, text, selected), zIndex: selected ? 1000 : undefined });
        m.addListener("click", () => openCard(m.__pin));
        markers.current.set(p.id, m);
        m.__look = look;
      } else if (m.__look !== look) {
        // Only a marker whose label or selection changed is redrawn: the list grows by hundreds.
        m.setIcon(pinIcon(maps, text, selected));
        m.setZIndex(selected ? 1000 : undefined);
        m.__look = look;
      }
      m.__pin = p; // the card shows the latest price/name
    });
    // Frame the hotels the first time there are some, and again after a filter change.
    if (pins.length && framedFor.current !== fitKey) {
      framedFor.current = fitKey;
      const bounds = new maps.LatLngBounds();
      pins.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 48);
      const once = maps.event.addListenerOnce(map, "idle", () => {
        if ((map.getZoom() || 0) > 16) map.setZoom(16); // one hotel: not street level
      });
      void once;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hotels, selectedId, fitKey]);

  function openCard(p: Pin) {
    const maps = mapsRef.current, map = mapRef.current;
    if (!maps || !map || !info.current) return;
    const wrap = document.createElement("div");
    wrap.style.cssText = "max-width:230px;font-family:inherit";
    const price = p.net > 0 ? inr(p.net) : "Rates on selection";
    wrap.innerHTML =
      (p.image ? '<img src="' + esc(p.image) + '" alt="" style="width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:6px"/>' : "") +
      '<div style="font-weight:600;font-size:13px;color:#1F2430;line-height:1.3">' + esc(p.name) + "</div>" +
      '<div style="font-size:12px;color:#8A8070;margin:2px 0 8px">' + (p.stars ? "★".repeat(p.stars) + " · " : "") + esc(price) + "</div>";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "View in list";
    btn.style.cssText = "background:#1F2430;color:#fff;border:0;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer";
    btn.onclick = () => {
      info.current.close();
      onPick(p.id);
    };
    wrap.appendChild(btn);
    info.current.setContent(wrap);
    info.current.setPosition({ lat: p.lat, lng: p.lng });
    info.current.open({ map });
  }

  const missing = hotels.length - pins.length;
  const message =
    state === "no_key"
      ? "The map needs a Google Maps key. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for this site."
      : state === "auth"
        ? "Google Maps refused the key for this site. Allow this domain on the key and make sure the Maps JavaScript API is enabled."
        : state === "load"
          ? "The map could not be loaded. Check your connection and try again."
          : null;

  return (
    <div style={{ position: "relative", flex: "1 1 auto", minHeight: 420, borderRadius: 10, overflow: "hidden", border: "1px solid var(--line, #E1E4E8)", background: "#F1F3F5" }}>
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      {state === "loading" ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--taupe)" }}>Loading map…</div>
      ) : null}
      {message ? (
        <div role="alert" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontSize: 13, color: "#B03434", background: "rgba(255,255,255,.92)" }}>
          {message}
        </div>
      ) : null}
      {state === "ready" ? (
        <div style={{ position: "absolute", left: 8, bottom: 8, background: "rgba(255,255,255,.94)", borderRadius: 8, padding: "4px 9px", fontSize: 11.5, color: "#1F2430", boxShadow: "0 1px 4px rgba(0,0,0,.15)" }}>
          {pins.length} {pins.length === 1 ? "hotel" : "hotels"}{city ? " in " + city : ""}
          {missing > 0 ? " · " + missing + " without a location" : ""}
        </div>
      ) : null}
    </div>
  );
}
