"use client";
/* =============================================================================
 * TripAgent — src/components/proposal/ProposalPreviewPage.tsx
 * PROOF OF CONCEPT (2026-09-25) — the on-screen Proposal Composer preview,
 * redesigned to match a target visual/interaction design the user shared
 * (switzerland-itinerary-preview.html + a matching src/app/lab/
 * proposal-instinct/page.tsx prototype, gitignored, never committed): a
 * tabbed (Plan/Days/Decisions) card, ivory/gold/Fraunces styling, real
 * hero photo behind the title block.
 *
 * NOT the same artifact as the exported/downloaded PDF (ProposalDocument.tsx,
 * @react-pdf/renderer) — that engine has no tabs, hover, or JS state, so it
 * can't render this design; this component and the PDF are two separate,
 * visually-matched mediums going forward, per direct discussion. This POC
 * only touches the on-screen preview — the PDF export is untouched.
 *
 * Fed entirely from buildProposalTemplateData()'s existing output (the SAME
 * real-data adapter Proposal Composer's PDF export already uses) — nothing
 * here is hardcoded. Two things the target design has that this component
 * deliberately drops, both confirmed to have no real data behind them:
 *   1. "Swap" / 2 alternative flights or hotels per leg — confirmed against
 *      the real backend (tripagent-full/app/services/itinerary_service.py,
 *      2026-09-25) that no itinerary ever persists more than ONE selected
 *      flight/hotel per leg once chosen. Only the single real pick renders.
 *   2. Per-day curated narrative ("Arrive, settle in" + a paragraph) and a
 *      "Reservations that matter" timeline — no such narrative text exists
 *      anywhere in this app's itinerary model (see proposalTemplateData.ts's
 *      own "derive or omit, never invent" rule, which this component
 *      follows). The Days tab instead lists the real calendar/stay/flight
 *      data proposalTemplateData.ts already computes; the Decisions tab
 *      only ever shows the real visa record, and is omitted entirely when
 *      there is none.
 * ===========================================================================*/
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getDestinationPhoto, hotelPhoto, inr, proposalFlightPayQuote, proposalFlightPayRefresh, proposalPayQuote } from "../../services/api";
import { errText } from "../../lib/errText";
import { payHeldOrder } from "../../lib/proposalPayment";
import { PayTimer } from "./PayTimer";
import { ProposalPayModal } from "./ProposalPayModal";
import { ProposalFlightPayModal, type FlightPayQuote } from "./ProposalFlightPayModal";

const noSubscribe = () => () => {};
// "?payment=success&ref=TA-…" / "?payment=failed" when the customer comes back from paying.
const readPayment = () => new URLSearchParams(window.location.search).get("payment") || "";
const readPaymentRef = () => new URLSearchParams(window.location.search).get("ref") || "";
// "?pay=open": opened from the advisor's preview — start with the payment window open.
const readPayOpen = () => new URLSearchParams(window.location.search).get("pay") === "open";
import "../../styles/proposal-preview.css";

const TABS = ["Plan", "Days", "Decisions"] as const;
type Tab = (typeof TABS)[number];

function Chip({ label }: { label: string }) {
  return <span className="pv-recgroup-eyebrow">{label}</span>;
}

// --- Day photos (Days tab) -----------------------------------------------------------------------------
// One stock/catalogue photo per day from the day's own `photoQuery` (a landmark or place the draft named),
// through the same lookup the Traveller Profile hero uses: GET /enquiries/destination-photo (Google Places,
// then Pexels). Never a hotel image. Lazy: a day only asks once it is near the viewport, requests are
// de-duplicated by query and capped at a few in flight, and the day's title and description render
// immediately — the photo slot shows a skeleton until it resolves and disappears if there is no photo.
type DayPhotoResult = { url: string; credit: string | null; creditUrl: string | null } | null;
const dayPhotoCache = new Map<string, Promise<DayPhotoResult>>();
const MAX_PHOTO_REQUESTS = 3;
let photoInFlight = 0;
const photoWaiting: Array<() => void> = [];

function acquirePhotoSlot(): Promise<void> {
  if (photoInFlight < MAX_PHOTO_REQUESTS) {
    photoInFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => photoWaiting.push(() => { photoInFlight++; resolve(); }));
}
function releasePhotoSlot() {
  photoInFlight--;
  const next = photoWaiting.shift();
  if (next) next();
}

function loadDayPhoto(query: string): Promise<DayPhotoResult> {
  const key = query.trim().toLowerCase();
  let hit = dayPhotoCache.get(key);
  if (!hit) {
    hit = acquirePhotoSlot().then(() =>
      getDestinationPhoto(query)
        .then((r: any) => (r && r.url ? { url: r.url as string, credit: r.photographer || null, creditUrl: r.photographerUrl || null } : null))
        .catch(() => null)
        .finally(releasePhotoSlot)
    );
    dayPhotoCache.set(key, hit);
    // A miss or a failure is not remembered, so a transient error does not hide the photo for the session.
    hit.then((r) => { if (!r && dayPhotoCache.get(key) === hit) dayPhotoCache.delete(key); });
  }
  return hit;
}

function DayPhoto({ query }: { query: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  const [photo, setPhoto] = useState<DayPhotoResult | undefined>(undefined); // undefined = loading, null = none
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setNear(true);
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    loadDayPhoto(query).then((r) => { if (!cancelled) setPhoto(r); });
    return () => { cancelled = true; };
  }, [near, query]);

  if (photo === null || failed) return null; // nothing found / failed to load: the day reads fine without it
  return (
    <div className="pv-day-photo" ref={ref}>
      {photo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="" loading="lazy" onError={() => setFailed(true)} />
          {photo.credit ? (
            <span className="pv-day-photo-credit">
              {photo.creditUrl ? (
                <a href={photo.creditUrl} target="_blank" rel="noreferrer">{photo.credit}</a>
              ) : (
                photo.credit
              )}
            </span>
          ) : null}
        </>
      ) : (
        <div className="pv-day-photo-skeleton" aria-hidden="true" />
      )}
    </div>
  );
}

const stopsText = (n: number) => (n === 0 ? "Non-stop" : `${n} stop${n > 1 ? "s" : ""}`);

function EstimateBadge() {
  return <span className="pv-chip pv-chip--estimate" title="From the AI's general knowledge — not a TripSure rate. Replace with a real search result before quoting.">AI estimate</span>;
}

// A flight leg's chosen flight with its alternatives and Swap (generated itineraries only; a leg without
// alternatives renders exactly as before). Alternatives are addressed by position.
function FlightGroup({ f, onSwap }: { f: any; onSwap?: (flightId: string, altIndex: number) => void }) {
  const alts: any[] = f.alternatives || [];
  return (
    <div className="pv-recgroup">
      <RecommendedFlightRow f={f} />
      <div className="pv-option-price" style={{ margin: "6px 0 10px" }}>
        {inr(f.price)}
        {f.extrasLine && f.alternatives?.some((a: any) => a.fareOnly) ? <small className="pv-price-note"> incl. the add-ons above</small> : null}
        {f.isOriginalChoice === false ? " · Selected" : ""}
      </div>
      {alts.length ? (
        <details className="pv-otheroptions" open>
          <summary>Other flights</summary>
          <div className="pv-alt-stack">
            {alts.map((a: any, i: number) => (
              <div className="pv-option" key={`${a.flightNo}-${a.depTime}`}>
                <div className="pv-option-body">
                  <span className="pv-option-name pv-option-name--block">
                    {a.carrier} {a.flightNo}
                  </span>
                  <div className="pv-option-detail">
                    {[a.depTime && a.arrTime ? `${a.depTime} → ${a.arrTime}` : null, a.detail].filter(Boolean).join(" · ")}
                  </div>
                  {a.facts?.length ? <div className="pv-option-detail">{a.facts.join(" · ")}</div> : null}
                </div>
                <div className="pv-option-side">
                  <div className="pv-option-price">{a.fareOnly ? "from " : ""}{inr(a.price)}</div>
                  {a.fareOnly ? <div className="pv-price-note">fare only · seat, meal &amp; bag extra</div> : null}
                  {onSwap && f.id ? (
                    <button type="button" className="pv-swap-btn" onClick={() => onSwap(f.id, i)}>
                      Swap
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function RecommendedFlightRow({ f }: { f: any }) {
  return (
    <div className="pv-recflight">
      <div className="pv-recflight-head">
        <span className="pv-option-name">{f.title}</span>
        {f.date ? <span className="pv-recflight-date">{f.date}</span> : null}
      </div>
      <div className="pv-recflight-row">
        <div>
          <div className="pv-recflight-time">{f.depTime}</div>
          {f.depCity ? <div className="pv-recflight-city">{f.depCity}</div> : null}
        </div>
        <div className="pv-recflight-mid">
          <div className="pv-recflight-nos">{(f.segments || []).map((s: any) => s.flightNo).filter(Boolean).join(" · ") || f.flightNo || ""}</div>
          <div className="pv-recflight-line" />
          <div className="pv-recflight-sub">
            {f.duration || (f.stops != null ? stopsText(f.stops) : "")}
            {f.cabin ? ` · ${f.cabin}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="pv-recflight-time">{f.arrivalTime || ""}</div>
          {f.arrCity ? <div className="pv-recflight-city">{f.arrCity}</div> : null}
          {f.arrivalDate && f.arrivalDate !== "Same day" ? <div className="pv-recflight-city">Arrives {f.arrivalDate}</div> : null}
        </div>
      </div>
      {f.fareLine ? <div className="pv-recflight-extras"><b>Fare</b> {f.fareLine}</div> : null}
      {f.extrasLine ? <div className="pv-recflight-extras"><b>Add-ons</b> {f.extrasLine}</div> : null}
    </div>
  );
}

// Not-yet-selected flight — real status, not a fabricated time (mirrors
// ProposalDocument.tsx's FlightsPage — same "honest omission" rule).
function PendingFlightRow({ f }: { f: any }) {
  return (
    <div className="pv-recflight">
      <div className="pv-recflight-head">
        <span className="pv-option-name">
          {f.depCity || f.title}
          {f.arrCity ? ` – ${f.arrCity}` : ""}
        </span>
        <Chip label={f.nextStep ? f.nextStep.toUpperCase() : "NOT YET SELECTED"} />
      </div>
    </div>
  );
}

// What the stay is really like: a photo strip and the specifics that take
// effort to find (what the rate includes, check-in window, cancellation,
// must-read rules, nearby). From adminbe's /hotels/facts; nothing invented.
// `skip`: fact labels already shown elsewhere (the wide card's summary column).
function StayDetails({ facts, skip = [] }: { facts: any; skip?: string[] }) {
  const [big, setBig] = useState<string | null>(null);
  if (!facts) return null;
  const room = facts.room || {};
  const photos: string[] = [...(room.images || []), ...(facts.images || [])].filter((u, i, a) => a.indexOf(u) === i).slice(0, 10);
  const lines: [string, string][] = [];
  if ((room.inclusions || []).length) lines.push(["Included", room.inclusions.join(" · ")]);
  const roomBits = [room.view, room.bed, room.size].filter(Boolean).join(" · ");
  if (roomBits) lines.push(["Room", roomBits]);
  if (facts.checkIn || facts.checkOut)
    lines.push(["Check-in / out", [facts.checkIn ? facts.checkIn + (facts.checkInUntil ? " – " + facts.checkInUntil : "") : null, facts.checkOut].filter(Boolean).join(" / ")]);
  if ((room.cancellation || []).length) lines.push(["Cancellation", room.cancellation[0]]);
  if ((facts.highlights || []).length) lines.push(["Highlights", facts.highlights.slice(0, 6).join(" · ")]);
  if ((facts.mustKnow || []).length) lines.push(["Good to know", facts.mustKnow.slice(0, 3).join(" · ")]);
  if ((facts.nearby || []).length) lines.push(["Nearby", facts.nearby.slice(0, 4).join(" · ")]);
  if (facts.guestRating && facts.guestRating.rating) lines.push(["Guest rating", facts.guestRating.rating + (facts.guestRating.count ? " (" + facts.guestRating.count + " reviews)" : "")]);
  const shown = lines.filter(([k]) => !skip.includes(k));
  return (
    <div className="pv-staydetails">
      {photos.length > 1 ? (
        <div className="pv-staygallery" aria-label="More photos">
          {photos.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt="" onClick={() => setBig(u)} onError={hideBrokenImage} />
          ))}
        </div>
      ) : null}
      {shown.length ? (
        <dl className="pv-stayfacts">
          {shown.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      ) : null}
      {big ? (
        <div className="pv-lightbox" role="dialog" aria-label="Photo" onClick={() => setBig(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big} alt="" />
        </div>
      ) : null}
    </div>
  );
}

// The stay's photos, one at a time with previous / next — the chosen hotel's
// gallery from /hotels/facts (or its single listing photo).
function PhotoCarousel({ images, className }: { images: string[]; className: string }) {
  const [i, setI] = useState(0);
  if (!images.length) return null;
  const at = Math.min(i, images.length - 1);
  return (
    <div className="pv-carousel">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={className} src={images[at]} alt="" onError={hideBrokenImage} />
      {images.length > 1 ? (
        <>
          <button type="button" className="pv-carousel-btn is-prev" aria-label="Previous photo" onClick={() => setI((at - 1 + images.length) % images.length)}>‹</button>
          <button type="button" className="pv-carousel-btn is-next" aria-label="Next photo" onClick={() => setI((at + 1) % images.length)}>›</button>
          <span className="pv-carousel-count">{at + 1} / {images.length}</span>
        </>
      ) : null}
    </div>
  );
}

function stayImages(st: any): string[] {
  const list = [st.image, ...((st.facts && st.facts.images) || []), ...((st.facts && st.facts.room && st.facts.room.images) || [])].filter(Boolean);
  return list.filter((u: string, k: number) => list.indexOf(u) === k).slice(0, 12);
}

function RecommendedStayRow({ st }: { st: any }) {
  return (
    <>
    <div className="pv-recstay">
      <div className="pv-recstay-body">
        <div className="pv-recflight-head">
          <span className="pv-option-name">{st.name}</span>
        </div>
        {st.roomAndBoard ? (
          <div className="pv-option-detail" style={{ marginTop: 8 }}>
            {st.roomAndBoard}
          </div>
        ) : null}
        <div className="pv-option-price pv-option-price--hotel" style={{ marginTop: 10 }}>
          {inr(st.price)}
          {st.priceIsEstimate ? <EstimateBadge /> : null}
        </div>
      </div>
      <PhotoCarousel images={stayImages(st)} className="pv-recstay-photo" />
    </div>
    <StayDetails facts={st.facts} />
    </>
  );
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

function hideBrokenImage(e: any) {
  e.currentTarget.style.display = "none";
}

// "Our choice" + alternatives with Swap (mockup: switzerland-itinerary-preview.html's
// recommendationGroupHTML, hotel/sideBySide layout). Desktop: chosen card and the
// alternatives list side by side; mobile: chosen card, alternatives behind <details>.
function StayGroup({ st, onSwap }: { st: any; onSwap?: (stayId: string, hotelKey: string) => void }) {
  const mobile = useIsMobile();
  const alts: any[] = st.alternatives || [];
  const badge = st.isOriginalChoice === false ? "Selected" : "Our choice";

  const chosen = (
    <div className="pv-recstay-stacked">
      <div className="pv-recstay-stacked-media">
        <PhotoCarousel images={stayImages(st)} className="pv-recstay-stacked-photo" />
        <div className="pv-recstay-chip-overlay">
          <span className="pv-chip pv-chip--choice">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L6 21l1.6-7L2.2 9.2l7.1-.6z" />
            </svg>
            {badge}
          </span>
        </div>
      </div>
      <div className="pv-recstay-stacked-body">
        <span className="pv-option-name pv-option-name--block">{st.name}</span>
        {st.roomAndBoard ? (
          <div className="pv-option-detail" style={{ marginTop: 8 }}>
            {st.roomAndBoard}
          </div>
        ) : null}
        <div className="pv-option-price pv-option-price--hotel" style={{ marginTop: 10 }}>
          {inr(st.price)}
          {st.priceIsEstimate ? <EstimateBadge /> : null}
        </div>
        <StayDetails facts={st.facts} />
      </div>
    </div>
  );

  // Desktop (2026-10-28): the chosen stay across the full width (photos left;
  // name, room, price and the quick facts right), its details in two columns
  // below, and the alternatives as a row of cards underneath, instead of a
  // half-width card beside a mostly empty alternatives column.
  const f = st.facts || {};
  const quick: [string, string][] = [];
  if (f.checkIn || f.checkOut) quick.push(["Check-in / out", [f.checkIn ? f.checkIn + (f.checkInUntil ? " – " + f.checkInUntil : "") : null, f.checkOut].filter(Boolean).join(" / ")]);
  if (f.guestRating && f.guestRating.rating) quick.push(["Guest rating", f.guestRating.rating + (f.guestRating.count ? " (" + f.guestRating.count + " reviews)" : "")]);
  if (f.room && (f.room.inclusions || []).length) quick.push(["Included", f.room.inclusions.join(" · ")]);
  const wide = (
    <div className="pv-staywide">
      <div className="pv-staywide-top">
        <div className="pv-recstay-stacked-media">
          <PhotoCarousel images={stayImages(st)} className="pv-staywide-photo" />
          <div className="pv-recstay-chip-overlay">
            <span className="pv-chip pv-chip--choice">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L6 21l1.6-7L2.2 9.2l7.1-.6z" />
              </svg>
              {badge}
            </span>
          </div>
        </div>
        <div className="pv-staywide-summary">
          <span className="pv-option-name pv-option-name--block">{st.name}</span>
          {st.roomAndBoard ? <div className="pv-option-detail" style={{ marginTop: 6 }}>{st.roomAndBoard}</div> : null}
          <div className="pv-option-price pv-option-price--hotel" style={{ marginTop: 10 }}>
            {inr(st.price)}
            {st.priceIsEstimate ? <EstimateBadge /> : null}
          </div>
          {quick.length ? (
            <dl className="pv-stayfacts pv-stayfacts--quick">
              {quick.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
      <div className="pv-staywide-more">
        <StayDetails facts={st.facts} skip={quick.map(([k]) => k)} />
      </div>
    </div>
  );

  const altCards = alts.map((a: any) => (
    <div className="pv-altcard" key={a.hotelKey}>
      {a.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pv-altcard-photo" src={a.image} alt="" onError={hideBrokenImage} />
      ) : <div className="pv-altcard-photo" aria-hidden="true" />}
      <div className="pv-altcard-body">
        <span className="pv-option-name pv-option-name--block">{a.name}</span>
        {a.detail ? <div className="pv-option-detail">{a.detail}</div> : null}
        <div className="pv-altcard-foot">
          <span className="pv-option-price">{inr(a.price)}</span>
          {onSwap && st.id ? (
            <button type="button" className="pv-swap-btn" onClick={() => onSwap(st.id, a.hotelKey)}>
              Swap
            </button>
          ) : null}
        </div>
      </div>
    </div>
  ));

  const altRows = alts.map((a: any) => (
    <div className="pv-option" key={a.hotelKey}>
      {a.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pv-option-thumb" src={a.image} alt="" onError={hideBrokenImage} />
      ) : null}
      <div className="pv-option-body">
        <span className="pv-option-name pv-option-name--block">{a.name}</span>
        {a.detail ? <div className="pv-option-detail">{a.detail}</div> : null}
      </div>
      <div className="pv-option-side">
        <div className="pv-option-price">{inr(a.price)}</div>
        {onSwap && st.id ? (
          <button type="button" className="pv-swap-btn" onClick={() => onSwap(st.id, a.hotelKey)}>
            Swap
          </button>
        ) : null}
      </div>
    </div>
  ));

  return mobile ? (
    <>
      {chosen}
      <details className="pv-otheroptions">
        <summary>Other options</summary>
        <div className="pv-alt-grid">{altRows}</div>
      </details>
    </>
  ) : (
    <>
      {wide}
      {alts.length ? (
        <div className="pv-altcards-wrap">
          <div className="pv-recgroup-eyebrow" style={{ marginBottom: 10 }}>
            Alternatives
          </div>
          <div className="pv-altcards">{altCards}</div>
        </div>
      ) : null}
    </>
  );
}

// onDownload — the hero's Download PDF button; hidden when there is nothing to call.
export function ProposalPreviewPage({
  data,
  onSwapHotel,
  onSwapFlight,
  onDownload,
  payToken,
  payPreviewUrl,
}: {
  data: any;
  onSwapHotel?: (stayId: string, hotelKey: string) => void;
  onSwapFlight?: (flightId: string, altIndex: number) => void;
  onDownload?: () => void;
  /** Set only on the public customer web link — enables the "Pay now" button. */
  payToken?: string | null;
  /** Advisor's preview only: the proposal's live customer link — Pay now opens it in a new tab. */
  payPreviewUrl?: string | null;
}) {
  // Customer "Pay now" (public link only): which stays can be booked online + the pay modal.
  const [payQuote, setPayQuote] = useState<{ payable: boolean; stays: any[]; gateway_configured: boolean; guest?: any } | null>(null);
  const [payingStay, setPayingStay] = useState<any | null>(null);
  // Flights priced live by the advisor are paid through the flight flow (the hotel flow above is
  // for hotel-only proposals).
  const [flightQuote, setFlightQuote] = useState<FlightPayQuote | null>(null);
  const [payingFlights, setPayingFlights] = useState(false);
  const payOpen = useSyncExternalStore(noSubscribe, readPayOpen, () => false);
  const autoOpened = useRef(false);
  const payment = useSyncExternalStore(noSubscribe, readPayment, () => "");
  const paymentRef = useSyncExternalStore(noSubscribe, readPaymentRef, () => "");
  // As soon as the link is opened, every payable item is re-checked live and held on the server
  // (refresh): Pay now then goes straight to payment, or a changed price is shown first. The
  // short details form only appears when we don't hold the traveller's name, email or mobile.
  const router = useRouter();
  const [check, setCheck] = useState<{ status: "idle" | "checking" | "ready" | "needs_details" | "needs_passengers" | "paid" | "error"; data?: any; message?: string }>({ status: "idle" });
  // "Payment 1 of 2 · Flight BLR → DEL" while TripSure's payments are taken booking by booking.
  const [payStep, setPayStep] = useState<{ step: number; steps: number; label: string } | null>(null);
  const [changeSeen, setChangeSeen] = useState(false);
  // Pay now pressed while the check was still running (or opened with ?pay=open): pay as soon as it is ready.
  const [wantPay, setWantPay] = useState(false);
  const wantPayRef = useRef(false);
  const want = (v: boolean) => { wantPayRef.current = v; setWantPay(v); };
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  // The automatic check runs once per page view (the effect below can fire again as the URL
  // flags settle); "Check again" and an ended hold run it on purpose.
  const checkStarted = useRef(false);
  function runCheck() {
    if (!payToken) return;
    checkStarted.current = true;
    setCheck({ status: "checking" });
    setChangeSeen(false);
    proposalFlightPayRefresh(payToken)
      .then((r: any) => {
        // "paying": some bookings paid already (e.g. the flight) — carry on with the rest.
        const st = r?.status === "paying" ? "ready" : r?.status;
        const next = { status: (["ready", "needs_details", "needs_passengers", "paid"].includes(st) ? st : "error") as any, data: r };
        setCheck(next);
        if (!wantPayRef.current) return;
        want(false);
        // A changed price is shown first (the popup); otherwise straight on to payment.
        if (next.status === "ready" && !r.price_changed) void payNow(next);
        else if (next.status === "needs_details") setPayingFlights(true);
      })
      .catch((e: any) => { want(false); setCheck({ status: "error", message: errText(e) }); });
  }
  useEffect(() => {
    if (!payToken) return;
    if (payOpen && !autoOpened.current) { autoOpened.current = true; want(true); }
    if (checkStarted.current) return;
    checkStarted.current = true;
    proposalPayQuote(payToken).then((q: any) => setPayQuote(q)).catch(() => setPayQuote(null));
    proposalFlightPayQuote(payToken)
      .then((q: any) => {
        setFlightQuote(q);
        if (q && q.payable && payment !== "success") {
          runCheck();
        }
      })
      .catch(() => setFlightQuote(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payToken, payOpen]);

  async function payNow(current = check) {
    if (!payToken) return;
    if (current.status === "checking") { want(true); return; }
    if (current.status === "needs_details") { setPayingFlights(true); return; }
    if (current.status !== "ready" || paying) return;
    setPaying(true);
    setPayErr(null);
    try {
      const out = await payHeldOrder(payToken, current.data, (url) => router.push(url), setPayStep);
      if (out.kind === "paid") setCheck({ status: "paid", data: { order_number: out.orderNumber } });
    } catch (e: any) {
      // The hold ended while the page sat open: check again for a fresh price and hold.
      if (e && e.status === 410) runCheck();
      else setPayErr(errText(e));
    } finally {
      setPaying(false);
      setPayStep(null);
    }
  }
  const priceChange = check.status === "ready" && check.data?.price_changed && !changeSeen ? check.data : null;
  // Advisor's own preview: the live-priced flights the customer will be able to pay for.
  const previewPayable = !payToken && !data._locked && ((data.flights || []).some((f: any) => f.fareLine)
    || (data.stays || []).some((st: any) => st.hotelKey && Number(st.price) > 0 && st.checkIn && st.roomType));
  const [tab, setTab] = useState<Tab>("Plan");
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = tabRefs.current[tab];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);

  const hasVisa = !!data.visa;
  const visibleTabs: Tab[] = hasVisa ? [...TABS] : TABS.filter((t) => t !== "Decisions");
  const activeTab = visibleTabs.includes(tab) ? tab : "Plan";

  // A Google Places photo for each stay without one — through our own adminbe
  // (GET /hotels/photo), not by calling customerbe from the browser (which also
  // fell back to the PROD customerbe when its env var was unset).
  const [stayPhotos, setStayPhotos] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!data.stays?.length) return;
    data.stays.forEach(async (st: any) => {
      if (st.image || (st.facts && st.facts.images && st.facts.images.length) || stayPhotos[st.name]) return;
      try {
        const city = st.city || data.cities?.[0] || data.destination || "";
        const json: any = await hotelPhoto(st.name, city);
        if (json && json.url) setStayPhotos((prev) => ({ ...prev, [st.name]: json.url }));
      } catch {}
    });
  }, [data.stays]);

  const enrichedStays = data.stays?.map((st: any) => ({
    ...st,
    image: st.image || (st.facts && st.facts.images && st.facts.images[0]) || stayPhotos[st.name] || null,
  }));
  const enrichedData = { ...data, stays: enrichedStays };

  // Destination hero photo — adbe's GET /enquiries/destination-photo (Google
  // Places, then Pexels). "Nepal (Kathmandu + Pokhara)" is searched as "Nepal":
  // the parenthetical route detail isn't part of the place name. When it
  // returns nothing the hero is exactly what it was before (first stay photo,
  // else the plain dark background).
  const destQuery = data.destination ? String(data.destination).replace(/\s*\(.*\)\s*$/, "").trim() : "";
  const [destPhoto, setDestPhoto] = useState<{ dest: string; url: string; credit: string | null; creditUrl: string | null } | null>(null);
  useEffect(() => {
    if (!destQuery) return;
    let cancelled = false;
    getDestinationPhoto(destQuery)
      .then((r: any) => {
        if (!cancelled && r && r.url) {
          setDestPhoto({ dest: destQuery, url: r.url, credit: r.photographer || null, creditUrl: r.photographerUrl || null });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [destQuery]);
  const destPhotoShown = destPhoto && destPhoto.dest === destQuery ? destPhoto : null;

  const heroImage = (destPhotoShown && destPhotoShown.url) || enrichedStays?.find((s: any) => s.image)?.image;

  return (
    <div className="pv-page">
      {payToken && priceChange ? (
        <div className="pv-pchg-back" role="dialog" aria-modal="true" aria-label="Price change">
          <div className="pv-pchg">
            <h2>The price has changed</h2>
            <p>Since your proposal was prepared, the airline or hotel has changed the price. We&apos;ve held the same flights, fare, seats and rooms for you at the new price.</p>
            <div className="pv-pchg-rows">
              <div><span>In your proposal</span><s>{inr(priceChange.quoted)}</s></div>
              <div className="now"><span>Now</span><b>{inr(priceChange.amount)}</b></div>
              <div className="diff"><span>{priceChange.amount > priceChange.quoted ? "Increase" : "Decrease"}</span><span>{inr(Math.abs(priceChange.amount - priceChange.quoted))}</span></div>
            </div>
            <div className="pv-pchg-actions">
              <button type="button" className="pv-cta pv-cta--ghost" onClick={() => setChangeSeen(true)}>Not now</button>
              <button type="button" className="pv-cta pv-cta--pay" onClick={() => { setChangeSeen(true); void payNow(); }}>
                Pay <span className="pv-cta-amt">{inr(priceChange.amount)}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {payToken && payingFlights && flightQuote ? (
        <ProposalFlightPayModal token={payToken} quote={flightQuote} onClose={() => setPayingFlights(false)} />
      ) : null}
      {payToken && payingStay ? (
        <ProposalPayModal
          token={payToken}
          stay={payingStay}
          gatewayConfigured={!!payQuote?.gateway_configured}
          prefill={payQuote?.guest}
          onClose={() => setPayingStay(null)}
        />
      ) : null}
      <div className="pv-shell">
        <div className="pv-card">
          <div className="pv-hero" style={heroImage ? { backgroundImage: `url("${heroImage}")` } : undefined}>
            <div className="pv-hero-scrim" />
            {/* Photo attribution (required by Google Places photo terms; shown for
                Pexels too) — only when the destination photo is the one on screen. */}
            {destPhotoShown && destPhotoShown.credit ? (
              <span style={{ position: "absolute", right: 14, bottom: 8, zIndex: 1, fontSize: 10, color: "rgba(250,246,235,0.78)" }}>
                Photo:{" "}
                {destPhotoShown.creditUrl ? (
                  <a href={destPhotoShown.creditUrl} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
                    {destPhotoShown.credit}
                  </a>
                ) : (
                  destPhotoShown.credit
                )}
              </span>
            ) : null}
            <div className="pv-hero-content">
              <div className="pv-header">
                <div className="pv-header-left">
                  <span className="pv-wordmark">TripAgent</span>
                  <span className="pv-madefor">
                    {data.memberName ? `Made for ${data.memberName}` : "Your proposal"}
                  </span>
                </div>
                {onDownload ? (
                  <button type="button" className="pv-dlbtn" onClick={onDownload}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Download PDF
                  </button>
                ) : null}
              </div>
              <h1 className="pv-title">{data.destination ? `${data.destination}, curated for you` : "Your itinerary"}</h1>
              <div className="pv-subtitle">
                {data.dateRange}
                {data.nights ? ` · ${data.nights} night${data.nights === 1 ? "" : "s"}` : ""}
                {data.paxLabel ? ` · ${data.paxLabel}` : data.pax ? ` · ${data.pax} traveller${data.pax === 1 ? "" : "s"}` : ""}
              </div>
              {data.cities?.length ? (
                <p className="pv-summary">
                  A route through {data.cities.join(", ")} — {data.stays?.length || 0} stay{data.stays?.length === 1 ? "" : "s"} and{" "}
                  {data.flights?.length || 0} flight{data.flights?.length === 1 ? "" : "s"} arranged so far.
                </p>
              ) : null}
            </div>
          </div>

          <div className="pv-body">
            {data._locked ? (
              // Paid on this link: what the customer sees from now on (the link never changes again).
              <div className="pv-paid-note pv-paid-note--ok pv-booked" role="status">
                <b>{data._locked.all_paid ? "Booked & paid" : "Payment received"}</b>
                {[data._locked.order_number ? `Booking ${data._locked.order_number}` : null,
                  data._locked.paid_amount ? `${inr(data._locked.paid_amount)} paid` : null,
                  data._locked.paid_at ? new Date(data._locked.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null,
                ].filter(Boolean).join(" · ")}
                <span>{data._locked.all_paid
                  ? "This is the trip you paid for — your advisor is confirming the bookings and will send your tickets and vouchers."
                  : "Part of this trip is paid — your advisor will be in touch about the rest."}</span>
              </div>
            ) : payment === "success" ? (
              <div className="pv-paid-note pv-paid-note--ok" role="status">
                Payment received{paymentRef ? ` · booking ${paymentRef}` : ""}. Your advisor is issuing your tickets and will send them to you.
              </div>
            ) : payment === "failed" ? (
              <div className="pv-paid-note pv-paid-note--err" role="status">The payment didn&apos;t go through and you haven&apos;t been charged. You can try again with Pay now below.</div>
            ) : null}
            <div className="pv-tabs">
              <span className="pv-tab-indicator" style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }} />
              {visibleTabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  ref={(el) => {
                    tabRefs.current[t] = el;
                  }}
                  className={"pv-tab" + (activeTab === t ? " is-active" : "")}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <div key={activeTab} className="pv-tabcontent">
              {activeTab === "Plan" ? (
                <>
                  <h2 className="pv-section-title">The shape</h2>
                  <div className="pv-deflist">
                    <div className="pv-defrow">
                      <span className="pv-deflabel">Dates</span>
                      <span className="pv-defvalue">
                        {data.dateRange}
                        {data.nights ? ` · ${data.nights} nights` : ""}
                      </span>
                    </div>
                    <div className="pv-defrow">
                      <span className="pv-deflabel">Travellers</span>
                      <span className="pv-defvalue">
                        {data.paxLabel || data.pax || 1}
                        {data.flights?.[0]?.cabin ? ` · ${data.flights[0].cabin} cabin` : ""}
                      </span>
                    </div>
                    {data.cities?.length ? (
                      <div className="pv-defrow">
                        <span className="pv-deflabel">Route</span>
                        <span className="pv-defvalue">{data.cities.join(" → ")}</span>
                      </div>
                    ) : null}
                  </div>

                  {data.flights?.length ? (
                    <>
                      <h2 className="pv-section-title">Getting there</h2>
                      {data.flights.map((f: any, i: number) =>
                        f.depTime ? (f.alternatives?.length ? <FlightGroup key={i} f={f} onSwap={onSwapFlight} /> : <RecommendedFlightRow key={i} f={f} />) : <PendingFlightRow key={i} f={f} />
                      )}
                    </>
                  ) : null}

                  {enrichedData.stays?.length ? (
                    <>
                      <h2 className="pv-section-title">Where you stay</h2>
                      {enrichedData.stays.map((st: any, i: number) => (
                        <div className="pv-recgroup" key={i}>
                          <div className="pv-recgroup-head">
                            <span className="pv-recgroup-title">{st.area ? `${st.city} · ${st.area}` : st.city}</span>
                            {st.dateRange ? <span className="pv-recgroup-sub">{st.dateRange}</span> : null}
                          </div>
                          {st.alternatives?.length ? <StayGroup st={st} onSwap={onSwapHotel} /> : <RecommendedStayRow st={st} />}
                        </div>
                      ))}
                    </>
                  ) : null}

                  {/* One "What it costs" for the customer: the priced quote (costLines,
                      with markup and taxes) when there is one; the as-chosen supplier
                      prices only until the quote has been priced. */}
                  {data.costRange && data.costRange.lines.length && !data.costLines?.length ? (
                    <>
                      <h2 className="pv-section-title">What it costs</h2>
                      <div className="pv-costtable">
                        {data.costRange.lines.map((ln: any) => (
                          <div className="pv-costrow" key={ln.id}>
                            <span>
                              {ln.label}
                              {ln.estimate ? <EstimateBadge /> : null}
                            </span>
                            <span>{ln.low === ln.high ? inr(ln.recommended) : `${inr(ln.low)} – ${inr(ln.high)}`}</span>
                          </div>
                        ))}
                        <div className="pv-costrow pv-costrow--total">
                          <span>Flights + stays</span>
                          <span>{data.costRange.low === data.costRange.high ? inr(data.costRange.recommended) : `${inr(data.costRange.low)} – ${inr(data.costRange.high)}`}</span>
                        </div>
                      </div>
                      <div className="pv-costrange-note">
                        As chosen: {inr(data.costRange.recommended)}.
                        {data.costRange.budgetCap
                          ? data.costRange.withinBudget
                            ? ` Within the ${inr(data.costRange.budgetCap)} budget.`
                            : ` Above the ${inr(data.costRange.budgetCap)} budget — swap to a lower option or confirm the budget with the traveller.`
                          : ""}
                        {data.costRange.unpriced.length ? ` Not yet priced, so left out: ${data.costRange.unpriced.join(", ")}.` : ""}
                        {data.costRange.estimateLabels.length ? " Lines marked AI estimate are not TripSure rates." : ""}
                      </div>
                    </>
                  ) : null}

                  {data.costLines?.length ? (
                    <>
                      <h2 className="pv-section-title">What it costs</h2>
                      <div className="pv-costtable">
                        {data.costLines.map((ln: any, i: number) =>
                          ln.breakdown?.length ? (
                            // A live-priced flight: its line opens into what the price is made of.
                            <details className="pv-costrow-wrap" key={i}>
                              <summary className="pv-costrow pv-costrow--open">
                                <span>{ln.label}<span className="pv-costrow-caret" aria-hidden="true" /></span>
                                <span>{inr(ln.sell)}</span>
                              </summary>
                              <div className="pv-costbreak">
                                {ln.breakdown.map((b: any, j: number) => (
                                  <div className="pv-costbreak-row" key={j}>
                                    <span>{b.label}</span>
                                    <span>{b.amount > 0 ? inr(b.amount) : "Included"}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          ) : (
                            <div className="pv-costrow" key={i}>
                              <span>{ln.label}</span>
                              <span>{Number(ln.sell) > 0 ? inr(ln.sell) : "To be confirmed"}</span>
                            </div>
                          ),
                        )}
                        <div className="pv-costrow pv-costrow--total">
                          <span>Trip total</span>
                          <span>{inr(data.grandTotal)}</span>
                        </div>
                      </div>
                      {data.costRange && (data.costRange.unpriced.length || data.costRange.budgetCap) ? (
                        <div className="pv-costrange-note">
                          {data.costRange.budgetCap
                            ? data.costRange.withinBudget
                              ? `Within the ${inr(data.costRange.budgetCap)} budget.`
                              : `Above the ${inr(data.costRange.budgetCap)} budget — swap to a lower option or confirm the budget with the traveller.`
                            : ""}
                          {data.costRange.unpriced.length ? ` Not yet priced, so left out: ${data.costRange.unpriced.join(", ")}.` : ""}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {/* The trip's two next steps, together under the total: read the plan, or pay. */}
                  <div className="pv-actions">
                    <button type="button" className="pv-cta pv-cta--ghost" onClick={() => setTab("Days")}>
                      See the day-by-day plan
                    </button>
                    {payToken && flightQuote?.payable && payment !== "success" && check.status !== "paid" ? (
                      <button type="button" className="pv-cta pv-cta--pay" onClick={() => payNow()} disabled={check.status === "error" || check.status === "needs_passengers" || paying}
                        aria-busy={check.status === "checking" || paying}>
                        {paying ? (payStep && payStep.steps > 1 ? `Paying ${payStep.step} of ${payStep.steps}…` : "Opening payment…")
                          : check.status === "checking" && wantPay ? "Checking live prices…" : "Pay now"}
                        {!paying && !(check.status === "checking" && wantPay) ? (
                          <span className="pv-cta-amt">{inr(check.status === "ready" && check.data?.amount != null ? check.data.amount : flightQuote.amount)}</span>
                        ) : null}
                      </button>
                    ) : payToken && !data._locked && payQuote?.payable && !flightQuote?.payable ? (
                      <button type="button" className="pv-cta pv-cta--pay" onClick={() => setPayingStay(payQuote.stays[0])}>
                        Pay now
                      </button>
                    ) : previewPayable ? (
                      payPreviewUrl ? (
                        <a className="pv-cta pv-cta--pay" href={`${payPreviewUrl}?pay=open`} target="_blank" rel="noreferrer"
                          title="Opens the customer's web link in a new tab, with the payment window open">
                          Pay now <span className="pv-cta-amt">{inr(data.grandTotal)}</span> <span aria-hidden="true">↗</span>
                        </a>
                      ) : (
                        <button type="button" className="pv-cta pv-cta--pay" disabled title="Create the web link first: Pay now runs on the customer's link">
                          Pay now <span className="pv-cta-amt">{inr(data.grandTotal)}</span>
                        </button>
                      )
                    ) : null}
                  </div>
                  {payToken && flightQuote?.payable && payment !== "success" ? (
                    <div className={"pv-actions-note" + (check.status === "error" || payErr ? " is-err" : "")} role="status">
                      {payErr ? payErr
                        : check.status === "checking" ? <><span className="pv-dot" /> Checking live prices with the airline and hotel…</>
                        : check.status === "needs_passengers" ? "Your advisor is completing the passenger details — Pay now opens as soon as they're in."
                        : check.status === "ready" ? <>✓ Live prices confirmed{check.data?.price_changed ? ` — now ${inr(check.data.amount)}` : ""} · secure payment by Razorpay
                            {(check.data?.bookings || []).length > 1 ? ` · ${check.data.bookings.length} payments, one per booking` : ""}</>
                        : check.status === "paid" ? `Payment received${check.data?.order_number ? ` · booking ${check.data.order_number}` : ""}. Your advisor is completing the booking.`
                        : check.status === "error" ? <>{check.message || "We couldn't confirm the live price."} <button type="button" className="pv-linkbtn" onClick={runCheck}>Check again</button></>
                        : "Secure payment by Razorpay"}
                    </div>
                  ) : (payToken && !data._locked && payQuote?.payable && payment !== "success") || previewPayable ? (
                    <div className="pv-actions-note">Secure payment by Razorpay · prices are re-checked with the airline and hotel before you pay</div>
                  ) : null}
                  {payToken && flightQuote?.payable && payment !== "success" && check.status !== "paid" && Number((check.data?.fee ?? flightQuote.fee) || 0) > 0 ? (
                    // Our markup + GST: part of the trip total, on its own line — the payment above is the
                    // airline's / hotel's price, taken through TripSure for TripAgent.
                    <div className="pv-actions-note">
                      Pay now covers the airline and hotel fares. TripAgent service fee &amp; GST {inr(check.data?.fee ?? flightQuote.fee ?? 0)} is
                      part of your trip total of {inr(check.data?.trip_total ?? flightQuote.trip_total ?? data.grandTotal)} and is shown separately.
                    </div>
                  ) : null}
                  {payToken && check.status === "ready" && check.data?.pay_by && payment !== "success" ? (
                    <div className="pv-hold"><PayTimer payBy={check.data.pay_by} onExpire={runCheck} what={flightQuote?.flights?.length ? "trip" : "room"} /></div>
                  ) : null}
                </>
              ) : null}

              {activeTab === "Days" ? (
                <>
                  <h2 className="pv-section-title">
                    {data.calendarDays?.length ? `${data.calendarDays.length} days, at a glance` : "Your days"}
                  </h2>
                  {data.dayPlan?.length ? (
                    <>
                      <div className="pv-costrange-note" style={{ marginBottom: 12 }}>
                        AI-drafted day plan — suggestions only, not checked against availability or booked.
                      </div>
                      <div className="pv-days">
                        {data.dayPlan.map((d: any, i: number) => (
                          <div className="pv-day" key={i}>
                            <div className="pv-day-num">{i + 1}</div>
                            <div className="pv-day-main">
                              <div className="pv-day-text">
                                <div className="pv-day-head">
                                  {d.title || d.label}
                                  {d.date ? ` · ${d.date}` : ""}
                                </div>
                                {d.description ? <div className="pv-day-body">{d.description}</div> : null}
                              </div>
                              {d.photoQuery ? <DayPhoto query={d.photoQuery} /> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <div className="pv-days">
                    {(data.calendarBlocks || []).map((b: any, i: number) => (
                      <div className="pv-day" key={i}>
                        {/* Calendar day numbers: "1", "2–4" (a stay's nights), "5". */}
                        <div className="pv-day-num">{b.span > 1 ? `${b.startIdx + 1}–${b.startIdx + b.span}` : b.startIdx + 1}</div>
                        <div>
                          <div className="pv-day-head">
                            {(b.span > 1 ? `Days ${b.startIdx + 1}–${b.startIdx + b.span}` : `Day ${b.startIdx + 1}`) + " · "}
                            {b.label}
                          </div>
                          {b.sub ? <div className="pv-day-body">{b.sub}</div> : null}
                          {data.calendarCaptions?.[b.startIdx] ? <div className="pv-day-body">{data.calendarCaptions[b.startIdx]}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {activeTab === "Decisions" && hasVisa ? (
                <>
                  <h2 className="pv-section-title">Before money moves</h2>
                  <div className="pv-callout">
                    <strong>{data.visa.title || "Visa"}</strong>
                    {data.visa.decisionNote || data.visa.sub}
                    {data.visa.submittedNote ? <div style={{ marginTop: 6 }}>{data.visa.submittedNote}</div> : null}
                    {data.visa.passportNote ? <div style={{ marginTop: 6 }}>{data.visa.passportNote}</div> : null}
                  </div>
                </>
              ) : null}
            </div>

            <div className="pv-footnote">
              Prepared {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}. Nothing is booked, held or paid unless
              noted above.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
