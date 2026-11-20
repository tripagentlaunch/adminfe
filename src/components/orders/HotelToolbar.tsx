"use client";
/* The hotel results' controls, laid out as on TripSure's own hotel site: List | Map, a sort menu, Filters (a panel on the right),
   a Price menu (range slider with minimum and maximum), and the three quick chips (Free cancellation, Breakfast included, WiFi).
   Nothing else: no name search, no budget bar. Prices are "for 1 night, 1 room", as on TripSure. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui";
import type { HotelView } from "../../lib/hotelListing";

export const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "cheapest", label: "Price: Low to High" },
  { value: "priceDesc", label: "Price: High to Low" },
  { value: "toprated", label: "Star Rating" },
  { value: "guest", label: "Guest Rating" },
];

/** The amenities of TripSure's Filters panel, in its order, with the flag each one reads. */
export const PANEL_AMENITIES: { key: string; label: string }[] = [
  { key: "freeWiFi", label: "WiFi" }, { key: "swimming", label: "Pool" },
  { key: "parking", label: "Parking" }, { key: "breakfast", label: "Breakfast" },
  { key: "airConditioner", label: "AC" }, { key: "gym", label: "Gym" },
  { key: "restaurant", label: "Restaurant" }, { key: "spa", label: "Spa" },
  { key: "bar", label: "Bar" }, { key: "roomService", label: "Room service" },
];

export type PriceRange = { min: number | null; max: number | null };
export type ToolbarFacets = { stayTypes: { name: string; count: number }[]; stars: { k: string; count: number }[] };

const money = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** A price range slider with two handles (two range inputs on one track), bounded by what the results hold. */
function RangeSlider({ lo, hi, min, max, onChange }: { lo: number; hi: number; min: number; max: number; onChange: (lo: number, hi: number) => void }) {
  const span = Math.max(1, max - min);
  const pct = (v: number) => ((v - min) / span) * 100;
  const step = span > 20000 ? 100 : span > 2000 ? 50 : 10;
  return (
    <div className="hf-range">
      <div className="hf-range-track" />
      <div className="hf-range-fill" style={{ left: pct(lo) + "%", right: 100 - pct(hi) + "%" }} />
      <input type="range" aria-label="Minimum price" min={min} max={max} step={step} value={lo}
        onChange={(e) => onChange(Math.min(Number(e.target.value), hi), hi)} />
      <input type="range" aria-label="Maximum price" min={min} max={max} step={step} value={hi}
        onChange={(e) => onChange(lo, Math.max(Number(e.target.value), lo))} />
    </div>
  );
}

function PriceFields({ draft, setDraft, bounds }: { draft: PriceRange; setDraft: (r: PriceRange) => void; bounds: { lo: number; hi: number } }) {
  const lo = draft.min ?? bounds.lo;
  const hi = draft.max ?? bounds.hi;
  const num = (v: string) => (v.replace(/[^\d]/g, "") === "" ? null : Number(v.replace(/[^\d]/g, "")));
  return (
    <>
      <RangeSlider lo={Math.max(bounds.lo, Math.min(lo, bounds.hi))} hi={Math.min(bounds.hi, Math.max(hi, bounds.lo))} min={bounds.lo} max={bounds.hi}
        onChange={(a, b) => setDraft({ min: a <= bounds.lo ? null : a, max: b >= bounds.hi ? null : b })} />
      <div className="hf-fields">
        <label className="hf-field"><span>Minimum</span><div><i>₹</i><input inputMode="numeric" value={draft.min ?? ""} placeholder={String(bounds.lo)} onChange={(e) => setDraft({ ...draft, min: num(e.target.value) })} /></div></label>
        <label className="hf-field"><span>Maximum</span><div><i>₹</i><input inputMode="numeric" value={draft.max ?? ""} placeholder={String(bounds.hi)} onChange={(e) => setDraft({ ...draft, max: num(e.target.value) })} /></div></label>
      </div>
    </>
  );
}

/** Closes a menu on a click outside it or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

export function HotelToolbar({ layout, onLayout, sort, onSort, price, onPrice, priceBounds, view, onView, facets, filterCount, onClearAll, nights, rooms, showRecommended }: {
  layout: "list" | "map"; onLayout: (l: "list" | "map") => void;
  sort: string; onSort: (v: string) => void;
  price: PriceRange; onPrice: (r: PriceRange) => void; priceBounds: { lo: number; hi: number };
  view: HotelView; onView: (patch: Partial<HotelView>) => void;
  facets: ToolbarFacets; filterCount: number; onClearAll: () => void;
  nights: number; rooms: number; showRecommended: boolean;
}) {
  const [menu, setMenu] = useState<null | "sort" | "price">(null);
  const [panel, setPanel] = useState(false);
  const close = () => setMenu(null);
  const sortRef = useDismiss(menu === "sort", close);
  const priceRef = useDismiss(menu === "price", close);
  const [pDraft, setPDraft] = useState<PriceRange>(price);
  // the Filters panel edits a copy; Apply commits it
  const [d, setD] = useState<{ price: PriceRange; amenities: string[]; stayTypes: string[]; starSet: string[]; refundable: boolean }>({ price, amenities: [], stayTypes: [], starSet: [], refundable: false });
  const openPanel = () => {
    setD({ price, amenities: view.amenities.slice(), stayTypes: (view.stayTypes || []).slice(), starSet: (view.starSet || []).slice(), refundable: view.refundable });
    setMenu(null); setPanel(true);
  };
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPanel(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);
  const options = SORT_OPTIONS.filter((o) => showRecommended || o.value !== "recommended");
  const sortLabel = (options.find((o) => o.value === sort) || SORT_OPTIONS.find((o) => o.value === sort) || options[0]).label;
  const toggle = (list: string[], v: string) => (list.indexOf(v) >= 0 ? list.filter((x) => x !== v) : list.concat([v]));
  const priceOn = price.min != null || price.max != null;
  const priceLabel = priceOn ? `${price.min != null ? money(price.min) : "Any"} – ${price.max != null ? money(price.max) : "Any"}` : "Price";
  const per = `for ${nights >= 1 ? nights : 1} night${nights === 1 ? "" : "s"}, ${rooms} room${rooms === 1 ? "" : "s"}`;
  void per;

  return (
    <div className="hf-bar">
      <div className="hf-seg" role="group" aria-label="View">
        <button type="button" className={layout === "list" ? "on" : ""} aria-pressed={layout === "list"} onClick={() => onLayout("list")}><Icon name="list" size={15} /> List</button>
        <button type="button" className={layout === "map" ? "on" : ""} aria-pressed={layout === "map"} onClick={() => onLayout("map")}><Icon name="pin" size={15} /> Map</button>
      </div>

      <div className="hf-menu" ref={sortRef}>
        <button type="button" className="hf-btn hf-btn--blue" aria-haspopup="listbox" aria-expanded={menu === "sort"} onClick={() => setMenu(menu === "sort" ? null : "sort")}>
          <Icon name="sort" size={14} /> {sortLabel}
        </button>
        {menu === "sort" ? (
          <div className="hf-pop hf-pop--sort" role="listbox" aria-label="Sort hotels">
            {options.map((o) => (
              <label key={o.value} className="hf-radio">
                <input type="radio" name="hotel-sort" checked={sort === o.value} onChange={() => { onSort(o.value); close(); }} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>

      <button type="button" className="hf-btn" onClick={openPanel}><Icon name="sliders" size={14} /> Filters{filterCount ? ` (${filterCount})` : ""}</button>
      <span className="hf-sep" aria-hidden="true" />

      <div className="hf-menu" ref={priceRef}>
        <button type="button" className={"hf-btn" + (priceOn ? " hf-btn--on" : "")} aria-expanded={menu === "price"} onClick={() => { setPDraft(price); setMenu(menu === "price" ? null : "price"); }}>
          {priceLabel} <Icon name="chevron" size={13} />
        </button>
        {menu === "price" ? (
          <div className="hf-pop hf-pop--price">
            <h4>Total price</h4>
            <p>for 1 night, 1 room</p>
            <PriceFields draft={pDraft} setDraft={setPDraft} bounds={priceBounds} />
            <div className="hf-actions">
              <button type="button" className="hf-clear" onClick={() => { onPrice({ min: null, max: null }); close(); }}>Clear</button>
              <button type="button" className="hf-apply" onClick={() => { onPrice(pDraft); close(); }}>Apply</button>
            </div>
          </div>
        ) : null}
      </div>

      <button type="button" className={"hf-btn" + (view.refundable ? " hf-btn--on" : "")} aria-pressed={view.refundable} onClick={() => onView({ refundable: !view.refundable })}>Free cancellation</button>
      <button type="button" className={"hf-btn" + (view.breakfast ? " hf-btn--on" : "")} aria-pressed={view.breakfast} onClick={() => onView({ breakfast: !view.breakfast })}>Breakfast included</button>
      <button type="button" className={"hf-btn" + (view.amenities.indexOf("freeWiFi") >= 0 ? " hf-btn--on" : "")} aria-pressed={view.amenities.indexOf("freeWiFi") >= 0} onClick={() => onView({ amenities: toggle(view.amenities, "freeWiFi") })}>WiFi</button>
      {filterCount > 0 ? <button type="button" className="hf-link" onClick={onClearAll}>Clear all</button> : null}

      {panel && typeof document !== "undefined" ? createPortal(
        <div className="hf-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setPanel(false); }}>
          <aside className="hf-panel" role="dialog" aria-label="Filters">
            <header><b>Filters</b><button type="button" aria-label="Close" onClick={() => setPanel(false)}><Icon name="x" size={18} /></button></header>
            <div className="hf-scroll">
              <section>
                <h5>Total price</h5>
                <p>for 1 night, 1 room</p>
                <PriceFields draft={d.price} setDraft={(r) => setD((x) => ({ ...x, price: r }))} bounds={priceBounds} />
              </section>
              <section>
                <h5>Amenities</h5>
                <div className="hf-checks">
                  {PANEL_AMENITIES.map((a) => (
                    <label key={a.key} className="hf-check"><input type="checkbox" checked={d.amenities.indexOf(a.key) >= 0} onChange={() => setD((x) => ({ ...x, amenities: toggle(x.amenities, a.key) }))} /><span>{a.label}</span></label>
                  ))}
                </div>
              </section>
              {facets.stayTypes.length ? (
                <section>
                  <h5>Property type</h5>
                  <div className="hf-list">
                    {facets.stayTypes.map((t) => (
                      <label key={t.name} className="hf-check hf-check--count"><input type="checkbox" checked={d.stayTypes.indexOf(t.name) >= 0} onChange={() => setD((x) => ({ ...x, stayTypes: toggle(x.stayTypes, t.name) }))} /><span>{t.name}</span><em>{t.count}</em></label>
                    ))}
                  </div>
                </section>
              ) : null}
              {facets.stars.length ? (
                <section>
                  <h5>Stars</h5>
                  <div className="hf-list">
                    {facets.stars.map((s) => (
                      <label key={s.k} className="hf-check hf-check--count"><input type="checkbox" checked={d.starSet.indexOf(s.k) >= 0} onChange={() => setD((x) => ({ ...x, starSet: toggle(x.starSet, s.k) }))} /><span>{s.k}-star</span><em>{s.count}</em></label>
                    ))}
                  </div>
                </section>
              ) : null}
              <section>
                <h5>Policies</h5>
                <div className="hf-list">
                  <label className="hf-check"><input type="checkbox" checked={d.refundable} onChange={() => setD((x) => ({ ...x, refundable: !x.refundable }))} /><span>Free cancellation</span></label>
                </div>
              </section>
            </div>
            <footer>
              <button type="button" className="hf-clear" onClick={() => { setD({ price: { min: null, max: null }, amenities: [], stayTypes: [], starSet: [], refundable: false }); }}>Clear all</button>
              <button type="button" className="hf-apply" onClick={() => {
                onPrice(d.price);
                onView({ amenities: d.amenities, stayTypes: d.stayTypes, starSet: d.starSet, refundable: d.refundable });
                setPanel(false);
              }}>Apply</button>
            </footer>
          </aside>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
