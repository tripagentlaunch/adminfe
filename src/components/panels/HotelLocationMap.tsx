"use client";

// A hotel's "Location" section (2026-10-27), like the one on TripSure's hotel page: the address with a
// "View in Maps" link, a small map with the hotel's pin, and the places nearby with their distances.

import { useEffect, useRef, useState } from "react";
import { TILE_ATTRIBUTION, TILE_URL, loadLeaflet } from "../../lib/leaflet";

export function HotelLocationMap({ name, address, lat, lng, nearby }: { name?: string; address?: string | null; lat?: number | null; lng?: number | null; nearby?: any[] }) {
  const box = useRef<HTMLDivElement | null>(null);
  const hasPoint = lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);
  const near = (nearby || []).filter((n: any) => n && n.name);

  useEffect(() => {
    if (!hasPoint) return;
    let alive = true;
    let map: any = null;
    loadLeaflet()
      .then((L: any) => {
        if (!alive || !box.current) return;
        map = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
        L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
        const at = [Number(lat), Number(lng)];
        map.setView(at, 15);
        L.marker(at, { icon: L.divIcon({ className: "tm-pin-wrap", html: '<span class="tm-pin is-on tm-pin--home">&#9679;</span>', iconSize: [0, 0] }), title: name || "" }).addTo(map);
      })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; if (map) map.remove(); };
  }, [lat, lng, hasPoint, name]);

  if (!hasPoint && !address && !near.length) return null;
  const mapsUrl = hasPoint ? "https://www.google.com/maps/search/?api=1&query=" + Number(lat) + "," + Number(lng) : address ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address) : null;
  return (
    <div className="tm-loc">
      <div className="tm-loc-h">Location</div>
      {address || mapsUrl ? (
        <div className="tm-loc-addr">
          <span>{address || name}</span>
          {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noreferrer">View in Maps ↗</a> : null}
        </div>
      ) : null}
      {hasPoint ? (failed ? <div className="tm-msg tm-msg--err" style={{ position: "static", padding: 16 }}>The map could not be loaded.</div> : <div ref={box} className="tm-loc-map" />) : null}
      {near.length ? (
        <>
          <div className="tm-near">
            {(all ? near : near.slice(0, 6)).map((n: any, i: number) => (
              <div key={n.name + i} className="tm-near-i">
                <span className="tm-near-ic">★</span>
                <span><b>{n.name}</b><small>{n.distance ? n.distance + " " + (n.unit || "Km") + " away" : ""}</small></span>
              </div>
            ))}
          </div>
          {near.length > 6 ? <button type="button" className="tm-near-more" onClick={() => setAll(!all)}>{all ? "Show fewer" : "See all nearby"}</button> : null}
        </>
      ) : null}
    </div>
  );
}
