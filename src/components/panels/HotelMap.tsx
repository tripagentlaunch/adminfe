"use client";

// The hotel results on a map (2026-10-27), laid out like TripSure's own Map view:
//  - a white price pin on every hotel (the price in k, or its stars when the listing has no price),
//  - chips along the top for the city's neighbourhoods and landmarks: click one and the map goes there,
//  - click a pin and a card opens bottom right with the hotel's photos, stars, price and a button,
//    and the pin turns dark.
// The map keeps the same pins while more hotels load behind the first ones (it only adds and removes
// what changed) and re-frames itself only when the advisor changes a filter.

import { useEffect, useRef, useState } from "react";
import { TILE_ATTRIBUTION, TILE_URL, loadLeaflet } from "../../lib/leaflet";
import { inr } from "../../services/api";

type Pin = { id: string; name: string; lat: number; lng: number; stars: number; net: number; city: string; nights: number; rooms: number; images: string[] };
export type MapPlace = { name: string; lat: number; lng: number };

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// "₹2k", like TripSure's pins.
export function pinLabel(net: number, stars: number): string {
  if (net >= 100000) return "₹" + (net / 100000).toFixed(1).replace(/\.0$/, "") + "L";
  if (net >= 10000) return "₹" + Math.round(net / 1000) + "k";
  if (net >= 1000) return "₹" + (net / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (net > 0) return "₹" + Math.round(net);
  return stars ? "★" + stars : "•";
}

/** Neighbourhood and landmark chips from a TripSure location suggestion (popular_locations + popular_poi). */
export function placesFromSuggestion(loc: any): MapPlace[] {
  const out: MapPlace[] = [];
  [...((loc && loc.popular_locations) || []), ...((loc && loc.popular_poi) || [])].forEach((p: any) => {
    const c = p && p.coordinates;
    const lat = c && Number(c.lat), lng = c && Number(c.lon != null ? c.lon : c.lng);
    if (p && p.name && Number.isFinite(lat) && Number.isFinite(lng) && !out.some((x) => x.name === p.name)) out.push({ name: p.name, lat, lng });
  });
  return out;
}

export function HotelMap({ hotels, onAction, actionLabel = "Select", fitKey, city, places = [] }: {
  hotels: any[]; onAction: (id: string) => void; actionLabel?: string; fitKey: string; city?: string; places?: MapPlace[];
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const markers = useRef<Map<string, any>>(new Map());
  const framedFor = useRef<string | null>(null);
  const pinsById = useRef<Map<string, Pin>>(new Map());
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [openId, setOpenId] = useState<string | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [activePlace, setActivePlace] = useState<string | null>(null);

  const pins: Pin[] = [];
  hotels.forEach((o) => {
    const d = o.detail || {};
    const lat = Number(d.lat), lng = Number(d.lng);
    if (d.lat != null && d.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) {
      const raw = (o._raw && o._raw.hotelInfo) || {};
      const images: string[] = (raw.imagesList && raw.imagesList.length ? raw.imagesList : d.image ? [d.image] : []).slice(0, 8);
      pins.push({ id: String(o.id), name: d.hotelName || "Hotel", lat, lng, stars: d.stars || 0, net: Number(o.base_net) || 0, city: d.cityName || city || "", nights: d.nights || 1, rooms: d.rooms || 1, images });
    }
  });
  pinsById.current = new Map(pins.map((p) => [p.id, p]));

  // The map itself, once.
  useEffect(() => {
    let alive = true;
    loadLeaflet()
      .then((L: any) => {
        if (!alive || !box.current) return;
        const map = L.map(box.current, { zoomControl: false, attributionControl: true, preferCanvas: true });
        L.control.zoom({ position: "bottomright" }).addTo(map);
        L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
        map.setView([20.5937, 78.9629], 5);
        layerRef.current = L.layerGroup().addTo(map);
        map.on("click", () => setOpenId(null));
        mapRef.current = map;
        (mapRef.current as any).__L = L;
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
      markers.current.clear();
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // The pins: add what is new, remove what is gone, relabel what changed.
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (state !== "ready" || !map || !layer) return;
    const L = map.__L;
    const want = new Set(pins.map((p) => p.id));
    markers.current.forEach((m, id) => {
      if (!want.has(id)) {
        layer.removeLayer(m);
        markers.current.delete(id);
      }
    });
    pins.forEach((p) => {
      const label = pinLabel(p.net, p.stars);
      let m = markers.current.get(p.id);
      if (!m) {
        m = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "tm-pin-wrap", html: '<span class="tm-pin">' + esc(label) + "</span>", iconSize: [0, 0] }), title: p.name, riseOnHover: true });
        m.on("click", (e: any) => { if (e && e.originalEvent) L.DomEvent.stopPropagation(e); setImgIdx(0); setOpenId(p.id); });
        layer.addLayer(m);
        markers.current.set(p.id, m);
        m.__label = label;
      } else if (m.__label !== label) {
        const el = m.getElement && m.getElement();
        const span = el && el.querySelector(".tm-pin");
        if (span) span.textContent = label;
        m.__label = label;
      }
    });
    // Frame the hotels the first time there are some, and again after a filter change.
    if (pins.length && framedFor.current !== fitKey) {
      framedFor.current = fitKey;
      map.fitBounds(pins.map((p) => [p.lat, p.lng]), { padding: [60, 60], maxZoom: 16 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hotels, fitKey]);

  // The open hotel's pin is dark and on top.
  useEffect(() => {
    markers.current.forEach((m, id) => {
      const el = m.getElement && m.getElement();
      const span = el && el.querySelector(".tm-pin");
      if (span) span.classList.toggle("is-on", id === openId);
      m.setZIndexOffset(id === openId ? 10000 : 0);
    });
  }, [openId, state, hotels]);

  function goTo(p: MapPlace) {
    const map = mapRef.current;
    if (!map) return;
    setActivePlace(p.name);
    map.flyTo([p.lat, p.lng], 14, { duration: 0.6 });
  }

  const open = openId ? pinsById.current.get(openId) : null;
  const missing = hotels.length - pins.length;
  const stepImg = (d: number, n: number) => setImgIdx((i) => (i + d + n) % n);

  return (
    <div className="tm-wrap">
      <div ref={box} className="tm-map" />
      {state === "loading" ? <div className="tm-msg">Loading map…</div> : null}
      {state === "error" ? <div role="alert" className="tm-msg tm-msg--err">The map could not be loaded. Check your connection and try again.</div> : null}
      {state === "ready" && places.length ? (
        <div className="tm-chips">
          {places.map((p) => (
            <button key={p.name} type="button" className={"tm-chip" + (activePlace === p.name ? " is-on" : "")} onClick={() => goTo(p)}>{p.name}</button>
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="tm-card" role="dialog" aria-label={open.name}>
          <div className="tm-card-img">
            {open.images.length ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.images[imgIdx % open.images.length]} alt={open.name} />
            ) : <div className="tm-card-ph">No photo</div>}
            <button type="button" className="tm-x" aria-label="Close" onClick={() => setOpenId(null)}>×</button>
            {open.images.length > 1 ? (
              <>
                <button type="button" className="tm-nav tm-nav--l" aria-label="Previous photo" onClick={() => stepImg(-1, open.images.length)}>‹</button>
                <button type="button" className="tm-nav tm-nav--r" aria-label="Next photo" onClick={() => stepImg(1, open.images.length)}>›</button>
                <div className="tm-dots">
                  {open.images.slice(0, 5).map((_, i) => <i key={i} className={i === imgIdx % Math.min(5, open.images.length) ? "is-on" : ""} />)}
                </div>
              </>
            ) : null}
          </div>
          <div className="tm-card-body">
            <div className="tm-card-name" title={open.name}>{open.name}</div>
            <div className="tm-card-sub">{open.stars ? open.stars + "-star Hotel" : "Hotel"}{open.city ? " · " + open.city : ""}</div>
            <div className="tm-card-price">
              {open.net > 0 ? (
                <>
                  <b>{inr(open.net)}</b> <em>onwards</em> <span>· {open.nights} night{open.nights === 1 ? "" : "s"}, {open.rooms} room{open.rooms === 1 ? "" : "s"}</span>
                </>
              ) : <span>Price on selection</span>}
            </div>
            <button type="button" className="tm-act" onClick={() => onAction(open.id)}>{actionLabel}</button>
          </div>
        </div>
      ) : null}
      {state === "ready" ? (
        <div className="tm-count">
          {pins.length} {pins.length === 1 ? "hotel" : "hotels"}{city ? " in " + city : ""}
          {missing > 0 ? " · " + missing + " without a location" : ""}
        </div>
      ) : null}
    </div>
  );
}
