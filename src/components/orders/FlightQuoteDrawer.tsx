"use client";
/* Pricing a searched flight for the customer's itinerary (Console → Search → Add), the
   same way New booking prices it before taking payment:
     Fare options (Saver / Flex …)  →  Check live price  →  Baggage / Meals / Seats  →  Add to itinerary
   "Check live price" is TripSure's Create Itinerary on its own (POST /flights/itinerary,
   nothing recorded on our side): the airline's actual fare right now, and the itinerary
   id the add-on prices (SSR) are read for. So what goes into the itinerary is the fare
   the ticket would cost plus the exact seat / meal / bag picked, not the search-list
   price. Two calls per flight priced; fare options are cached per flight. */
import { useState } from "react";
import "../../styles/orders-workspace.css";
import { Icon } from "../ui";
import { flightPriceCheck, flightSsr, getTripsureFlightOffer, inr } from "../../services/api";
import { errText } from "../../lib/errText";
import { FareOptionsList, type FareChoice } from "./FareOptionsPanel";
import { FlightTimeline, ItineraryDrawer } from "./FlightItinerary";
import {
  EXTRAS_TABS, FlightExtrasPicker, NO_PICK, extrasCounts, extrasDrawerTabs, extrasSum, firstExtrasTab,
  type ExtrasTab, type SegSel,
} from "./FlightExtras";

/** What the itinerary keeps for a flight priced here (cart item `pricing`). */
export type FlightLivePrice = {
  source: "tripsure_live";
  checkedAt: string;
  /** The search list's price for the chosen fare option, before the check. */
  listPrice: number;
  /** TripSure's totalFare for every traveller searched, at the check. */
  fare: number;
  priceChanged: boolean;
  fareId: string;
  fareName: string;
  refundable: boolean;
  checkinKg: number | null;
  extras: { segment: string; kind: "seat" | "baggage" | "meal"; code: string; label: string; price: number }[];
  extrasTotal: number;
  /** fare + extras: the itinerary's price for this flight. */
  total: number;
  /** Documents the fare needs at booking (passport / PAN / GST), from Create Itinerary's conditions. */
  needs: string[];
};

type Lock = { itineraryId: string; fare: number; priceChanged: boolean; needs: string[]; ssr: any; ssrErr: string | null };

// One searched fare as Create Itinerary takes it: the chosen option's fare id, its provider
// and that provider's search trace id (provider 1 fares are rejected without it).
function fareItem(offer: any, fareId: string) {
  const cached = getTripsureFlightOffer(offer.id);
  if (!cached) return null;
  const traceMap = (cached.supplierTraceIds || {}) as Record<string, string>;
  const traceId = traceMap[String(cached.providerId)] || (Object.keys(traceMap).length === 1 ? Object.values(traceMap)[0] : null);
  return { fareSourceCode: fareId || cached.fareSourceCode, providerId: cached.providerId, ...(traceId ? { traceId } : {}) };
}

// The answer's fare for the whole booking: the top-level priceSummary when there is one,
// else the sector's (one flight = one sector).
function readLock(r: any) {
  const sectors: any[] = Object.values((r && r.data) || {});
  const price = (r && r.priceSummary) || sectors[0]?.priceSummary || {};
  const fare = Number(price.totalFare);
  const v = sectors.map((s) => s?.validation || {});
  if (v.some((x) => x.isValid === false)) throw new Error("TripSure says this fare is no longer valid — search again and pick another.");
  if (!r?.itineraryId || !Number.isFinite(fare) || fare <= 0) throw new Error("TripSure didn't return a price for this fare — try again or pick another.");
  // Guide 6.4 conditions.{passport, pan, gst}: required when true or carrying a true
  // *mandatory / required* flag (the same reading as the backend's documents_required).
  const required = (v: any) => v === true || (!!v && typeof v === "object" && Object.entries(v).some(([k, x]) => x === true && /mandatory|required/i.test(k)));
  const c = sectors.map((s) => s?.conditions || {});
  const needs = (["passport", "pan", "gst"] as const).filter((k) => c.some((x) => required(x[k]))).map((k) => (k === "passport" ? k : k.toUpperCase()));
  return { itineraryId: String(r.itineraryId), fare, priceChanged: v.some((x) => !!x.isPriceChanged), needs };
}

export function FlightQuoteDrawer({ offer, paxNote, asked, onAdd, onClose, startTab = "fares" }: {
  offer: any;
  /** "for 2 adults" */
  paxNote: string;
  /** The customer's requests (shown above the add-ons), if any. */
  asked?: string | null;
  onAdd: (p: FlightLivePrice, fare: FareChoice | null) => void;
  onClose: () => void;
  startTab?: "timeline" | "fares";
}) {
  const d = offer.detail || {};
  const segments: any[] = getTripsureFlightOffer(offer.id)?.raw?.segments || [];
  const rows = segments.length ? segments : [null];
  const [tab, setTab] = useState<string>(startTab);
  const [fare, setFare] = useState<FareChoice | null>(null);
  const [lock, setLock] = useState<Lock | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<SegSel[]>([]);
  const [seg, setSeg] = useState(0);

  const listPrice = (Number(offer.base_net) || 0) + (fare?.delta || 0);

  // A different fare option means a different price: the earlier check no longer applies.
  function chooseFare(c: FareChoice) {
    if (c.fare_id !== fare?.fare_id) { setLock(null); setSel([]); }
    setFare(c);
  }

  async function check() {
    if (!fare) return;
    const item = fareItem(offer, fare.fare_id);
    if (!item) { setErr("This search has expired — search again."); return; }
    setBusy(true);
    setErr(null);
    try {
      const got = readLock(await flightPriceCheck([item]));
      // Add-on prices: a fare with none (or an SSR failure) still has a live fare price.
      let ssr: any = null, ssrErr: string | null = null;
      try {
        ssr = await flightSsr(got.itineraryId);
      } catch (e: any) {
        ssrErr = errText(e);
      }
      setLock({ ...got, ssr, ssrErr });
      setSel(rows.map(() => NO_PICK));
      setSeg(0);
      setTab(ssr ? firstExtrasTab(ssr, rows[0], d) : "fares");
    } catch (e: any) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  function add() {
    if (!lock || !fare) return;
    const route = (i: number) => (rows[i] ? `${rows[i].departureAirport} → ${rows[i].arrivalAirport}` : `${d.originCode || ""} → ${d.destCode || ""}`);
    const extras: FlightLivePrice["extras"] = [];
    sel.forEach((p, i) => {
      (["baggage", "seat", "meal"] as const).forEach((k) => {
        const x = p[k];
        if (x) extras.push({ segment: route(i), kind: k, code: x.code, label: x.label, price: x.price });
      });
    });
    const extrasTotal = extrasSum(sel);
    onAdd({
      source: "tripsure_live",
      checkedAt: new Date().toISOString(),
      listPrice,
      fare: lock.fare,
      priceChanged: lock.priceChanged || Math.abs(lock.fare - listPrice) > 1,
      fareId: fare.fare_id,
      fareName: fare.name,
      refundable: fare.refundable,
      checkinKg: fare.checkin_kg ?? d.baggageKg ?? null,
      extras,
      extrasTotal,
      total: lock.fare + extrasTotal,
      needs: lock.needs,
    }, fare);
  }

  const extrasTotal = extrasSum(sel);
  const counts = extrasCounts(sel);
  const moved = lock && Math.abs(lock.fare - listPrice) > 1 ? lock.fare - listPrice : 0;
  const tabs = [
    { key: "timeline", label: "Timeline", icon: "clock" },
    { key: "fares", label: "Fare options", icon: "list", badge: lock ? "✓" : null },
    ...(lock?.ssr ? extrasDrawerTabs(lock.ssr, rows, d, sel) : []),
  ];
  const shown = EXTRAS_TABS.includes(tab) && !lock?.ssr ? "fares" : tab;

  return (
    <ItineraryDrawer
      title={`Price for the itinerary · ${d.airlineName || d.airline || "Flight"} ${d.flightNo || ""}`}
      tabs={tabs}
      active={shown}
      onTab={setTab}
      onClose={onClose}
      busy={busy}
      price={lock ? inr(lock.fare + extrasTotal) : inr(listPrice)}
      priceNote={lock
        ? (extrasTotal > 0 ? `${inr(lock.fare)} live fare + ${inr(extrasTotal)} add-ons (${counts.text}) · ${paxNote}` : `Live fare from TripSure ${paxNote} · add-ons optional`)
        : `Search price ${paxNote} — check the live price to add it`}
      actions={lock ? (
        <>
          <button type="button" className="taw-btn" onClick={() => { setLock(null); setSel([]); setTab("fares"); }} disabled={busy}>Change fare</button>
          <button type="button" className="taw-btn taw-btn--primary fi-next" onClick={add} disabled={busy}>
            <Icon name="plus" size={14} /> Add to itinerary · {inr(lock.fare + extrasTotal)}
          </button>
        </>
      ) : (
        <button type="button" className="taw-btn taw-btn--primary fi-next" onClick={check} disabled={!fare || busy}>
          {busy ? "Checking with TripSure…" : "Check live price"}
        </button>
      )}
    >
      {err ? <div className="taw-banner taw-banner--danger" style={{ whiteSpace: "normal" }}>{err}</div> : null}
      {lock ? (
        moved ? (
          <div className="taw-banner taw-banner--warn" style={{ whiteSpace: "normal" }} role="alert">
            <b>The airline now prices this fare at {inr(lock.fare)}</b> — the search showed {inr(listPrice)} ({moved > 0 ? "+" : "−"}{inr(Math.abs(moved))}). The itinerary gets the live price.
          </div>
        ) : (
          <div className="taw-banner taw-banner--info" style={{ whiteSpace: "normal" }}>
            <Icon name="check" size={14} /> Live price confirmed with TripSure: {inr(lock.fare)} {paxNote}.
            {lock.needs.length ? ` This fare needs ${lock.needs.join(", ")} at booking.` : ""}
          </div>
        )
      ) : null}
      {lock?.ssrErr ? (
        <div className="taw-banner taw-banner--warn" style={{ whiteSpace: "normal" }}>Couldn&apos;t load seats, meals and baggage ({lock.ssrErr}). The fare price above is live; add-ons can be chosen at booking.</div>
      ) : null}

      {shown === "timeline" ? (
        <FlightTimeline legs={[{ segments }]} />
      ) : shown === "fares" ? (
        <>
          <FareOptionsList offer={offer} selected={fare?.fare_id || null} onSelect={chooseFare} />
          <div className="ow-sub" style={{ whiteSpace: "normal", marginTop: 10 }}>
            {lock
              ? "Picking another fare option needs a new live price check."
              : "Check live price asks TripSure for this fare's price right now — the same price the booking will charge — and then shows the airline's seats, meals and baggage with their prices."}
          </div>
        </>
      ) : (
        <FlightExtrasPicker
          ssr={lock?.ssr}
          rows={rows}
          detail={d}
          tab={shown as ExtrasTab}
          sel={sel}
          seg={seg}
          onSeg={setSeg}
          onPick={(i, kind, v) => setSel((prev) => prev.map((p, j) => (j === i ? { ...p, [kind]: v } : p)))}
          busy={busy}
          asked={asked}
        />
      )}
    </ItineraryDrawer>
  );
}
