"use client";
/* =============================================================================
 * TripAgent — src/components/panels/HotelRecommendations.tsx
 * The itinerary hotel-suggestion flow (2026-09-15) — replaces the Hotels
 * tab's plain "Nothing added from the Hotels desk yet." empty state with
 * real, ranked TripSure recommendations for each hotel base this
 * itinerary actually needs (one city + date range — see
 * itineraryFromCart.ts's hotelBasesFromItinerary, and its own note on how
 * a multi-city trip splits into more than one).
 *
 * Reuses HotelDesk.tsx's own `.taw-res*`/`.taw-chip*`/`.taw-btn*` result-
 * card markup rather than inventing new visual design — this is the same
 * "real hotel, name/stars/price/Add button" shape that component already
 * established, just fed from itinerary_service.recommend_hotels's ranked
 * picks instead of a raw manual search.
 *
 * CRITICAL: every field a card shows (name/stars/price/board/refundable/
 * address) comes straight from the backend's real TripSure response —
 * this component never invents or edits a number. No LLM call happens
 * anywhere in this file; ranking already happened server-side as plain
 * code (see recommend_hotels's own docstring).
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { hotelRecommendations, inr } from "../../services/api";
import { hotelBasesFromItinerary, type HotelBase } from "../../lib/itineraryFromCart";
import { errText, toast } from "../../lib/advisorHelpers";
import { Empty, Icon, Spinner } from "../ui";

const RECOMMENDATION_LABELS: Record<string, string> = {
  best_match: "Best Match",
  best_value: "Best Value",
  premium: "Premium",
  recommended: "Recommended",
};

type BaseState = { status: "loading" | "done" | "error"; hotels: any[]; error?: string };

function baseKey(base: HotelBase) {
  return `${base.city}|${base.checkIn}|${base.checkOut}`;
}

export function HotelRecommendations({
  data,
  ask,
  onAdd,
  addedHotelKeys,
}: {
  data: any;
  ask: any;
  onAdd: (hotel: any, base: HotelBase) => void;
  addedHotelKeys: Set<string>;
}) {
  const bases = hotelBasesFromItinerary(data);
  const basesSig = bases.map(baseKey).join(",");
  const [byBase, setByBase] = useState<Record<string, BaseState>>({});

  // Hard requirements pulled from the SAME real enquiry `ask` Member360/
  // FlightDesk.tsx already read (GET /enquiries/{id}/traveller-profile —
  // see enquiry_service.get_traveller_profile) — never re-asked here, per
  // the "don't ask a hotel-location question when inputs already exist"
  // rule: this flow only ever runs once real check-in/check-out/city are
  // already known (hotelBasesFromItinerary requires real itinerary days).
  const starMin = ask?.hotel?.stars?.state === "value" ? Number(ask.hotel.stars.value) || undefined : undefined;
  const adults = (ask?.persons || []).length || data?.pax || 2;
  const budgetTotal = typeof ask?.budgetCap === "number" ? ask.budgetCap : undefined;

  useEffect(() => {
    if (!bases.length) return;
    let cancelled = false;
    bases.forEach((base) => {
      const key = baseKey(base);
      setByBase((m) => (m[key] ? m : { ...m, [key]: { status: "loading", hotels: [] } }));
      hotelRecommendations({
        city: base.city,
        checkIn: base.checkIn,
        checkOut: base.checkOut,
        adults,
        rooms: 1,
        starMin,
        budgetTotal,
      })
        .then((res: any) => {
          if (cancelled) return;
          setByBase((m) => ({ ...m, [key]: { status: "done", hotels: (res && res.hotels) || [] } }));
        })
        .catch((e: any) => {
          if (cancelled) return;
          setByBase((m) => ({ ...m, [key]: { status: "error", hotels: [], error: errText(e) } }));
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basesSig, starMin, adults, budgetTotal]);

  if (!bases.length) {
    // No real per-day date/city signal at all yet (e.g. a brand-new
    // scratch itinerary with no days) — the honest empty state, same
    // wording as before this feature existed. Never a fabricated search.
    return <Empty icon={<Icon name="hotel" size={26} />}>Nothing added from the Hotels desk yet.</Empty>;
  }

  const multiCity = bases.length > 1;

  return (
    <div className="taw-hotelrec">
      {bases.map((base) => {
        const key = baseKey(base);
        const state = byBase[key] || { status: "loading", hotels: [] };
        return (
          <div key={key} className="taw-hotelrec-base">
            {multiCity ? (
              <div className="taw-hotelrec-base-h">
                <Icon name="hotel" size={15} />
                <span>{base.city}</span>
                <span className="taw-muted">
                  {base.nights} night{base.nights === 1 ? "" : "s"}
                </span>
              </div>
            ) : null}

            {state.status === "loading" ? (
              <div className="taw-hotelrec-loading">
                <Spinner /> Searching real hotels in {base.city}…
              </div>
            ) : state.status === "error" ? (
              <div className="taw-banner taw-banner--err">
                <Icon name="alert" size={14} />
                {state.error || "Hotel search failed."}
              </div>
            ) : state.hotels.length === 0 ? (
              <Empty icon={<Icon name="hotel" size={22} />}>No hotels matched the requirements in {base.city} right now.</Empty>
            ) : (
              <div className="taw-results">
                {state.hotels.map((hotel: any) => {
                  const already = addedHotelKeys.has(String(hotel.hotelKey));
                  const label = RECOMMENDATION_LABELS[hotel.recommendationLabel] || "Recommended";
                  let starStr = "";
                  for (let i = 0; i < (hotel.stars || 0); i++) starStr += "★";
                  return (
                    <div key={hotel.hotelKey} className="taw-res" style={{ display: "block" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14 }}>
                        <div className="taw-res-main">
                          <div className="taw-res-title">
                            <Icon name="hotel" size={18} />
                            {hotel.name || "Hotel"}
                            <span className={"taw-chip taw-chip--reco taw-chip--reco-" + hotel.recommendationLabel}>{label}</span>
                            {starStr ? <span className="taw-chip taw-chip--star">{starStr}</span> : null}
                            {hotel.refundable ? <span className="taw-chip taw-chip--ref">Refundable</span> : <span className="taw-chip taw-chip--noref">Non-ref</span>}
                            {hotel.verified ? (
                              <span className="taw-chip taw-chip--verified" title="Live TripSure search result, not AI-drafted">
                                Live · Verified
                              </span>
                            ) : null}
                          </div>
                          <div className="taw-res-sub">
                            {hotel.address ? <span>{hotel.address}</span> : null}
                            <span>{adults} guest{adults === 1 ? "" : "s"} · 1 room</span>
                            <span>
                              {base.nights} night{base.nights === 1 ? "" : "s"}
                            </span>
                            {hotel.board ? <span>{hotel.board}</span> : null}
                          </div>
                        </div>
                        <div className="taw-res-side">
                          <div className="taw-res-net ta-num">
                            {inr(hotel.totalPrice)}
                            <small>total, {base.nights}N</small>
                          </div>
                          <button
                            className="taw-btn taw-btn--accent taw-btn--sm"
                            disabled={already}
                            onClick={() => {
                              onAdd(hotel, base);
                              if (!already) toast(`${hotel.name} added to itinerary`, "success");
                            }}
                          >
                            <Icon name={already ? "check" : "plus"} size={13} />
                            {already ? "Added" : "Add to itinerary"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
