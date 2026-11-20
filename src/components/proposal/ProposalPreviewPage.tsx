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
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getDestinationPhoto, hotelPhoto, inr, proposalFlightPayQuote, proposalFlightPayRefresh, proposalPayQuote } from "../../services/api";
import { errText } from "../../lib/errText";
import { payHeldOrder } from "../../lib/proposalPayment";
import { preloadRazorpay } from "../../lib/razorpay";
import { PayTimer } from "./PayTimer";
import { ProposalPayModal } from "./ProposalPayModal";
import { ProposalFlightPayModal, type FlightPayQuote } from "./ProposalFlightPayModal";

const noSubscribe = () => () => {};
// "?payment=success&ref=TA-…" / "?payment=failed" when the customer comes back from paying.
const readPayment = () => new URLSearchParams(window.location.search).get("payment") || "";
const readPaymentRef = () => new URLSearchParams(window.location.search).get("ref") || "";
// "?pay=open": opened from the advisor's preview — start with the payment window open.
const readPayOpen = () => new URLSearchParams(window.location.search).get("pay") === "open";
// "?debug=1": the advisor testing a link — the live check's calls are shown under Pay now.
const readDebug = () => new URLSearchParams(window.location.search).get("debug") === "1";
import "../../styles/proposal-preview.css";
import type { AddonTable } from "../../lib/flightAddons";
import { LiveCheckTrace } from "./LiveCheckTrace";
import { cardTags, distanceText, eatGuideUrl, tiersOf } from "../../lib/diningPlan";
import { buildDayCards } from "../../lib/proposalDayCards";
import { suggestionCost, suggestionKinds, type SuggestionKind } from "../../lib/suggestions";
import { eatPlaceholder } from "../../lib/eatPlaceholder";
import { leftText, untilText } from "../../lib/offlineBanner";
import { payCheckWords } from "../../lib/payCheckWords";
import { finalPriceView } from "../../lib/finalPrice";

// Restaurants from our city page: photo, name, the award that earned the place its spot, the area, and how far it is from the hotel.
// Small outline icons for the kinds of place, as on the website's tabs (a wine glass for Fine, a shirt for Smart).
function TierIcon({ tier }: { tier: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (tier === "Fine") return <svg {...common}><path d="M8 3h8v5a4 4 0 0 1-8 0V3z" /><path d="M12 12v8M8.5 20h7" /></svg>;
  if (tier === "Smart") return <svg {...common}><path d="M8 4 3 7l2 4 2-1v10h10V10l2 1 2-4-5-3a4 4 0 0 1-8 0z" /></svg>;
  if (tier === "Destination") return <svg {...common}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>;
  if (tier === "Casual") return <svg {...common}><path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 9h2a2 2 0 0 1 0 5h-2M8 3v2M12 3v2" /></svg>;
  return null;
}

// The picture on a card: the restaurant's photo, or a placeholder when it has none or can't be loaded.
function EatCardPhoto({ src, name }: { src: string | null; name: string }) {
  const [bad, setBad] = useState(false);
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="pv-eatc-photo" src={src && !bad ? src : eatPlaceholder(name, 900, 600)} alt={name} loading="lazy" onError={() => setBad(true)} />;
}

// "Where to eat" as the website's city page draws it: the tier tabs (when more than one tier was picked), then a grid of cards, each with
// the restaurant's name, one headline tag, every award in its own box, the description, and the area; ours adds how far it is from the hotel.
// A card's text: two lines, with More / Less (inside a link card the toggle must not open the page).
function CardDesc({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 90;
  return (
    <>
      <p className={"pv-eatc-desc" + (open ? " is-open" : "")}>{text}</p>
      {long ? (
        <button type="button" className="pv-eatc-more" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setOpen((v) => !v); }}>{open ? "Less" : "More"}</button>
      ) : null}
    </>
  );
}

function EatCards({ entries, guideTab = "eat", compact = false }: { entries: any[]; guideTab?: "eat" | "do" | "party"; compact?: boolean }) {
  const tiers = tiersOf(entries);
  const [picked, setPicked] = useState<string>("");
  const tier = tiers.includes(picked) ? picked : tiers[0];
  const shown = tiers.length > 1 ? entries.filter((e) => (e.tier || "Picks") === tier) : entries;
  return (
    <>
      {tiers.length > 1 ? (
        <div className="pv-eatt" role="tablist" aria-label="Kind of place">
          {tiers.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={t === tier} className={"pv-eatt-btn" + (t === tier ? " is-active" : "")} onClick={() => setPicked(t)}>
              <TierIcon tier={t} /> {t}
            </button>
          ))}
        </div>
      ) : null}
      <div className={"pv-eatg" + (compact ? " pv-eatg--compact" : "")}>
        {shown.map((e: any) => {
          const { headline, rest } = cardTags(e);
          // A card opens the city page it comes from on our website (the Goa page for a Goa restaurant), in a new tab.
          const Card: any = e.url ? "a" : "article";
          const cardProps = e.url ? { href: eatGuideUrl(e.url, guideTab), target: "_blank", rel: "noopener noreferrer", title: "Open the " + (e.city || "city") + " guide on our website" } : {};
          return (
            <Card className={"pv-eatc" + (e.url ? " pv-eatc--link" : "")} key={e.id} {...cardProps}>
              <EatCardPhoto src={e.photo || null} name={e.name} />
              <div className="pv-eatc-body">
                <h3 className="pv-eatc-name">{e.name}</h3>
                {headline ? <span className="pv-eatc-tag">{headline}</span> : null}
                {rest.length ? (
                  <ul className="pv-eatc-creds">
                    {rest.map((c: string, i: number) => <li key={i}>{c}</li>)}
                  </ul>
                ) : null}
                {e.description ? (compact ? <CardDesc text={e.description} /> : <p className="pv-eatc-desc">{e.description}</p>) : null}
              </div>
              {e.area || e.distance || e.est ? (
                <div className="pv-eatc-foot">
                  {e.area ? (
                    <div className="pv-eatc-loc">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.2A7 7 0 0 1 19 9.8C19 14.8 12 21 12 21z" /><circle cx="12" cy="10" r="2.5" /></svg>
                      <span>{e.area}</span>
                    </div>
                  ) : null}
                  {e.distance ? <div className="pv-eatc-dist">{distanceLine(e.distance)}</div> : null}
                  {e.est ? (
                    <div className="pv-eatc-dist">
                      {e.est.high === 0 ? "Free" : `About ₹${Math.round(e.est.low).toLocaleString("en-IN")}–${Math.round(e.est.high).toLocaleString("en-IN")} each`} · estimate
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </>
  );
}

// "3.2 km from Taj West End · 11 min drive"
const distanceLine = (d: any) => distanceText(d);

// Offline prices: a flight or stay the advisor priced by hand because another vendor quoted it. They are held for 12 hours and are
// never re-checked with the airline or hotel, so the page says until when. On the customer's link the time comes from the server
// (offsetMs = server clock - this computer's), so a wrong computer clock changes nothing.
type OfflineNotice = { validUntil: string | null; expired: boolean; offsetMs: number };

function OfflineBanner({ notice }: { notice: OfflineNotice }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const msLeft = notice.validUntil ? Date.parse(notice.validUntil) - (now + notice.offsetMs) : 0;
  const expired = notice.expired || !(msLeft > 0);
  return (
    <div className={"pv-offline" + (expired ? " is-expired" : "")} role="status">
      {expired ? (
        <>
          <b>The offline prices in this proposal are no longer held.</b>
          <span>Lines marked &ldquo;Quoted offline&rdquo; were quoted by your advisor from another vendor. Please ask your advisor to confirm them again before you pay.</span>
        </>
      ) : (
        <>
          <b>Offline prices held until {untilText(notice.validUntil)} · {leftText(msLeft)}</b>
          <span>Lines marked &ldquo;Quoted offline&rdquo; were quoted by your advisor from another vendor. They aren&apos;t live prices: they&apos;re held for 12 hours, and your advisor confirms them with you.</span>
        </>
      )}
    </div>
  );
}

const OfflineTag = () => <span className="pv-offtag" title="Quoted by your advisor from another vendor: held for 12 hours, not a live price">Quoted offline</span>;

const TABS = ["Plan", "Days", "Suggestions", "Decisions"] as const;
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

function DayPhoto({ query, hero }: { query: string; hero?: boolean }) {
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
    <div className={"pv-day-photo" + (hero ? " pv-day-photo--hero" : "")} ref={ref}>
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
  return <span className="pv-chip pv-chip--estimate" title="From the AI's general knowledge — not a live rate. Replace with a real search result before quoting.">AI estimate</span>;
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
        {f.extrasLine && f.alternatives?.some((a: any) => a.fareOnly || a.livePriced) ? <small className="pv-price-note"> incl. the add-ons above</small> : null}
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
                  {a.livePriced ? <div className="pv-price-note">{a.addonsNote} · live airline price</div> : null}
                  {onSwap && f.id && !f.noSwap ? (
                    <button type="button" className="pv-swap-btn" onClick={() => onSwap(f.id, a.altIndex ?? i)}>
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
      {f.extrasTable && f.extrasTable.length ? <AddonsTable table={f.extrasTable} /> : f.extrasLine ? <div className="pv-recflight-extras"><b>Add-ons</b> {f.extrasLine}</div> : null}
    </div>
  );
}

// The add-ons picked for each traveller: one row per traveller, a column per kind picked
// (seat / meal / extra baggage), one block per segment when the flight has several.
const ADDON_HEAD: Record<string, string> = { seat: "Seat", meal: "Meal", baggage: "Extra baggage" };
function AddonsTable({ table }: { table: AddonTable }) {
  return (
    <div className="pv-addons">
      <b className="pv-addons-title">Add-ons</b>
      {table.map((t) => (
        <div key={t.segment} className="pv-addons-seg">
          {table.length > 1 && t.segment ? <div className="pv-addons-route">{t.segment}</div> : null}
          <table className="pv-addons-table">
            <thead><tr><th>Traveller</th>{t.kinds.map((k) => <th key={k}>{ADDON_HEAD[k]}</th>)}</tr></thead>
            <tbody>
              {t.rows.map((r) => (
                <tr key={r.who}>
                  <td>{r.who}</td>
                  {t.kinds.map((k) => <td key={k}>{r[k] ? r[k]!.label : <span className="pv-addons-none">—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
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
  const lines: [string, string | string[]][] = [];
  if ((room.inclusions || []).length) lines.push(["Included", room.inclusions.join(" · ")]);
  const roomBits = [room.view, room.bed, room.size].filter(Boolean).join(" · ");
  if (roomBits) lines.push(["Room", roomBits]);
  if (facts.checkIn || facts.checkOut)
    lines.push(["Check-in / out", [facts.checkIn ? facts.checkIn + (facts.checkInUntil ? " – " + facts.checkInUntil : "") : null, facts.checkOut].filter(Boolean).join(" / ")]);
  if ((room.cancellation || []).length) lines.push(["Cancellation", room.cancellation[0]]);
  // Highlights, good to know and nearby are lists, shown as one item per line (chips for the highlights), not run together
  // with " · " into one paragraph: that is what made the wide card's columns uneven.
  if ((facts.highlights || []).length) lines.push(["Highlights", facts.highlights.slice(0, 8)]);
  if ((facts.mustKnow || []).length) lines.push(["Good to know", facts.mustKnow.slice(0, 4)]);
  if ((facts.nearby || []).length) lines.push(["Nearby", facts.nearby.slice(0, 5)]);
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
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                {Array.isArray(v) ? (
                  <ul className={k === "Highlights" ? "pv-stayfacts-chips" : "pv-stayfacts-list"}>
                    {v.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                ) : v}
              </dd>
            </div>
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
  // On the customer's link only the hotels the advisor's publish priced for booking carry Swap (st.swapKeys); in the composer every alternative does.
  const canSwap = (a: any) => !!onSwap && !!st.id && (!st.swapKeys || st.swapKeys.includes(a.hotelKey));

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
        {st.originalHotelKey && a.hotelKey === st.originalHotelKey ? <span className="pv-chip pv-chip--choice" style={{ alignSelf: "flex-start", marginBottom: 4 }}>Our choice</span> : null}
        <span className="pv-option-name pv-option-name--block">{a.name}</span>
        {a.detail ? <div className="pv-option-detail">{a.detail}</div> : null}
        <div className="pv-altcard-foot">
          <span className="pv-option-price">{inr(a.price)}{a.offline ? <OfflineTag /> : null}</span>
          {canSwap(a) ? (
            <button type="button" className="pv-swap-btn" onClick={() => onSwap!(st.id, a.hotelKey)}>
              Swap
            </button>
          ) : null}
        </div>
        {a.offline && a.offlineUntil ? <div className="pv-option-detail pv-option-off">Held until {untilText(a.offlineUntil)}</div> : null}
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
        {st.originalHotelKey && a.hotelKey === st.originalHotelKey ? <span className="pv-chip pv-chip--choice" style={{ alignSelf: "flex-start", marginBottom: 4 }}>Our choice</span> : null}
        <span className="pv-option-name pv-option-name--block">{a.name}</span>
        {a.detail ? <div className="pv-option-detail">{a.detail}</div> : null}
      </div>
      <div className="pv-option-side">
        <div className="pv-option-price">{inr(a.price)}{a.offline ? <OfflineTag /> : null}</div>
        {a.offline && a.offlineUntil ? <div className="pv-option-detail pv-option-off">Held until {untilText(a.offlineUntil)}</div> : null}
        {canSwap(a) ? (
          <button type="button" className="pv-swap-btn" onClick={() => onSwap!(st.id, a.hotelKey)}>
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
// A day's photo: the hotel the traveller stays at that night (TripSure's gallery for it); a place photo only for a day with no hotel
// photo, or when the hotel's picture can't be loaded.
function DayCardPhoto({ card }: { card: { stayPhoto: { url: string; hotel: string } | null; photoQuery: string | null } }) {
  const [bad, setBad] = useState<string | null>(null);
  const sp = card.stayPhoto && card.stayPhoto.url !== bad ? card.stayPhoto : null;
  if (sp) {
    return (
      <div className="pv-day-photo pv-day-photo--hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sp.url} alt={sp.hotel} loading="lazy" onError={() => setBad(sp.url)} />
        <span className="pv-day-photo-stay">{sp.hotel}</span>
      </div>
    );
  }
  return card.photoQuery ? <DayPhoto query={card.photoQuery} hero /> : null;
}

// The Days tab: "All days" or one day at a time (pills, with arrows when they overflow), each day a card with its photo, date and
// title, what is planned, what is booked and where to eat.
function DaysTab({ data, stays }: { data: any; stays?: any[] }) {
  const cards = buildDayCards(data, stays);
  const [pick, setPick] = useState(0); // 0 = all days, k = day k
  const rowRef = useRef<HTMLDivElement | null>(null);
  const shown = pick > 0 && pick <= cards.length ? [cards[pick - 1]] : cards;
  const scroll = (dir: number) => { if (rowRef.current) rowRef.current.scrollBy({ left: dir * 220, behavior: "smooth" }); };
  const aiDrafted = (data.dayPlan || []).some((d: any) => d.description);
  if (!cards.length) return <h2 className="pv-section-title">Your days</h2>;
  return (
    <>
      <h2 className="pv-section-title">{cards.length} days, at a glance</h2>
      {aiDrafted ? <div className="pv-costrange-note" style={{ marginBottom: 12 }}>AI-drafted day plan — suggestions only, not checked against availability or booked.</div> : null}
      {cards.length > 1 ? (
        <div className="pv-subtabs-row">
          <button type="button" className="pv-subtabs-chevron" aria-label="Scroll days left" onClick={() => scroll(-1)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="pv-dtabs" ref={rowRef} role="tablist" aria-label="Days">
            {["All days"].concat(cards.map((c) => "Day " + c.n)).map((t, i) => (
              <button key={t} type="button" role="tab" aria-selected={pick === i} className={"pv-dtab" + (pick === i ? " is-active" : "")} onClick={() => setPick(i)}>{t}</button>
            ))}
          </div>
          <button type="button" className="pv-subtabs-chevron" aria-label="Scroll days right" onClick={() => scroll(1)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      ) : null}
      <div className="pv-dcards" key={pick}>
        {shown.map((c) => (
          <div className="pv-dcard" key={c.n}>
            <DayCardPhoto card={c} />
            <div className="pv-dcard-body">
              <div className="pv-dcard-eyebrow">Day {c.n}</div>
              <div className="pv-dcard-head">{[c.dateLabel, c.title].filter(Boolean).join(" · ")}</div>
              {c.description ? <div className="pv-dcard-text">{c.description}</div> : null}
              {c.facts.length ? <ul className="pv-dcard-facts">{c.facts.map((f, i) => <li key={i}>{f}</li>)}</ul> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// The Suggestions tab: a pill per kind (Where to eat / Things to do / A night out, with how many), one list at a time as compact cards,
// and what they add up to on the ground. Everything is a suggestion: nothing here is booked.
function SuggestionsTab({ data }: { data: any }) {
  const kinds: SuggestionKind[] = suggestionKinds(data);
  const [pick, setPick] = useState<string>("");
  const cur = kinds.find((k) => k.key === pick) || kinds[0];
  const cost = suggestionCost(kinds);
  if (!cur) return null;
  const cities = Array.from(new Set(kinds.flatMap((k) => k.groups.map((g) => g.city)).filter(Boolean)));
  return (
    <>
      <h2 className="pv-section-title">Suggestions</h2>
      <div className="pv-costrange-note" style={{ marginBottom: 12 }}>
        Our picks from the {cities.join(" and ")} city guide: suggestions only, not booked.
      </div>
      {cost ? (
        <div className="pv-sugg-cost">
          <span>On the ground{cost.pax ? ` for ${cost.pax}` : ""}</span>
          <b>About {inr(cost.low)}–{inr(cost.high)}</b>
          <small>estimate · from {cost.counted} of {cost.total} suggestion{cost.total === 1 ? "" : "s"}</small>
        </div>
      ) : null}
      {kinds.length > 1 ? (
        <div className="pv-dtabs pv-sugg-tabs" role="tablist" aria-label="Kind of suggestion">
          {kinds.map((k) => (
            <button key={k.key} type="button" role="tab" aria-selected={k.key === cur.key} className={"pv-dtab" + (k.key === cur.key ? " is-active" : "")} onClick={() => setPick(k.key)}>
              {k.label} <span className="pv-sugg-count">{k.count}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div key={cur.key} className="pv-dcards">
        {cur.groups.map((g) => (
          <div className="pv-recgroup" key={cur.key + "-" + g.city}>
            <div className="pv-recgroup-head">
              <span className="pv-recgroup-title">{g.city}</span>
              {g.url ? <a className="pv-recgroup-sub" href={eatGuideUrl(g.url, cur.key)} target="_blank" rel="noopener noreferrer">The full {g.city} guide</a> : <span className="pv-recgroup-sub">From our city guide</span>}
            </div>
            <EatCards entries={g.picks} guideTab={cur.key} />
          </div>
        ))}
      </div>
    </>
  );
}

export function ProposalPreviewPage({
  data,
  onSwapHotel,
  onSwapFlight,
  choiceVersion = 0,
  onDownload,
  payToken,
  payPreviewUrl,
}: {
  data: any;
  onSwapHotel?: (stayId: string, hotelKey: string) => void;
  onSwapFlight?: (flightId: string, altIndex: number) => void;
  /** Public link: bumped when the customer has swapped a flight (saved) — the trip is checked again live. */
  choiceVersion?: number;
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
  const debug = useSyncExternalStore(noSubscribe, readDebug, () => false);
  const autoOpened = useRef(false);
  const payment = useSyncExternalStore(noSubscribe, readPayment, () => "");
  const paymentRef = useSyncExternalStore(noSubscribe, readPaymentRef, () => "");
  // The live price check runs when the customer presses Pay now (2026-11-03, direct request), not
  // when the link opens: every payable item is re-checked and held on the server (refresh — for a
  // flight that is TripSure's Update Itinerary with the passengers and add-ons), then payment
  // opens, or a changed price is shown first. Each press checks again. The short details form only
  // appears when we don't hold the traveller's name, email or mobile.
  const router = useRouter();
  const [check, setCheck] = useState<{ status: "idle" | "checking" | "ready" | "needs_details" | "needs_passengers" | "paid" | "error"; data?: any; message?: string }>({ status: "idle" });
  // "Payment 1 of 2 · Flight BLR → DEL" while TripSure's payments are taken booking by booking.
  const [payStep, setPayStep] = useState<{ step: number; steps: number; label: string } | null>(null);
  const [changeSeen, setChangeSeen] = useState(false);
  // Pay now pressed (or opened with ?pay=open): pay as soon as the check is ready.
  const [wantPay, setWantPay] = useState(false);
  const wantPayRef = useRef(false);
  const want = (v: boolean) => { wantPayRef.current = v; setWantPay(v); };
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  // The quotes load once per page view (the effect below can fire again as the URL flags settle).
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
        else if (next.status === "needs_details" || next.status === "needs_passengers") setPayingFlights(true);   // the customer enters the traveller details
      })
      .catch((e: any) => { want(false); setCheck({ status: "error", message: errText(e) }); });
  }
  // Checkout's script is fetched while the customer reads, not after Pay now.
  useEffect(() => { if (payToken) preloadRazorpay(); }, [payToken]);
  useEffect(() => {
    if (!payToken) return;
    if (payOpen && !autoOpened.current) { autoOpened.current = true; want(true); }
    if (checkStarted.current) return;
    checkStarted.current = true;
    proposalPayQuote(payToken).then((q: any) => setPayQuote(q)).catch(() => setPayQuote(null));
    proposalFlightPayQuote(payToken)
      .then((q: any) => {
        setFlightQuote(q);
        // ?pay=open is a Pay now press: the same traveller details window as pressing Pay now.
        if (q && q.payable && payment !== "success" && wantPayRef.current) { want(false); setPayingFlights(true); }
      })
      .catch(() => { want(false); setFlightQuote(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payToken, payOpen]);

  // After a swap on the link: the new quote. An earlier check was for the old flights, so it is
  // cleared; Pay now checks the trip as chosen.
  useEffect(() => {
    if (!payToken || !choiceVersion) return;
    proposalFlightPayQuote(payToken).then((q: any) => setFlightQuote(q)).catch(() => setFlightQuote(null));
    setCheck({ status: "idle" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choiceVersion]);

  // The Pay now button: a fresh live check every press, then payment (or the price-change popup).
  function startPay() {
    if (!payToken || paying || check.status === "checking") return;
    setPayErr(null);
    // The airline needs every passenger's details before it takes payment. When we don't hold them yet the customer enters them now
    // (Next saves them, checks the live price and shows the final price), instead of waiting for the advisor.
    // Every Pay now press (and ?pay=open) is the same flow: the traveller details window (pre-filled, or showing what we hold to
    // check), then Next runs the live check once and shows the final price, then Pay.
    if (flightQuote && flightQuote.payable) { setPayingFlights(true); return; }
    want(true);
    runCheck();
  }
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
      // The hold ended while the page sat open: check again for a fresh price and hold, then pay.
      if (e && e.status === 410) { want(true); runCheck(); }
      else setPayErr(errText(e));
    } finally {
      setPaying(false);
      setPayStep(null);
    }
  }
  const priceChange = check.status === "ready" && check.data?.price_changed && !changeSeen ? check.data : null;
  // What is charged, before and after the live check: the whole-trip amount Pay now takes (our fee and GST included), so the popup,
  // the button and the summary all say the same number.
  const chargeOf = (d: any) => Number(d?.pay_amount ?? d?.trip_total ?? d?.amount ?? 0);
  const chargedBefore = Number(flightQuote?.pay_amount ?? flightQuote?.trip_total ?? data.grandTotal ?? 0);
  // Offline prices (entered by hand): on the link the server's own clock and the live trip decide; else what this proposal was built with.
  const offlineNotice: OfflineNotice | null = flightQuote && flightQuote.offline
    ? { validUntil: flightQuote.offline.valid_until, expired: !!flightQuote.offline.expired, offsetMs: Date.parse(flightQuote.offline.now) - Date.now() || 0 }
    : data.offlineNotice ? { validUntil: data.offlineNotice.validUntil, expired: !!data.offlineNotice.expired, offsetMs: 0 } : null;
  // What Pay now says it is checking: only the online (live) items; vendor-quoted ones are said not to change.
  const words = payCheckWords(flightQuote);
  // One price table: once the live check is back, "What it costs" itself shows the final price (a moved line shows its old price struck
  // through), so a line never has two prices on the page.
  const finalView = check.status === "ready" && check.data && check.data.trip_total != null
    ? finalPriceView(data.costLines || [], check.data.lines, Number(data.grandTotal) || 0, Number(check.data.trip_total))
    : null;
  const costRows: any[] = finalView ? finalView.lines : data.costLines || [];
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
  // Suggestions (restaurants, things to do, a night out from the city guide) has a tab of its own once the advisor added any; Decisions only with a visa.
  const hasEat = !!((data.whereToEat && data.whereToEat.length) || (data.placesToGo && data.placesToGo.length));
  const visibleTabs: Tab[] = TABS.filter((t) => (t === "Decisions" ? hasVisa : t === "Suggestions" ? hasEat : true));
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
            <p>{words.changedIntro} We&apos;ve held the same flights, fare, seats and rooms for you at the new price.</p>
            {words.offlineUnchanged ? <p className="pv-pchg-off">{words.offlineUnchanged}</p> : null}
            <div className="pv-pchg-rows">
              <div><span>In your proposal</span><s>{inr(finalView ? finalView.was ?? chargedBefore : chargedBefore)}</s></div>
              <div className="now"><span>Final price now</span><b>{inr(finalView ? finalView.total : chargeOf(priceChange))}</b></div>
              <div className="diff"><span>{(finalView ? finalView.total : chargeOf(priceChange)) > (finalView ? finalView.was ?? chargedBefore : chargedBefore) ? "Increase" : "Decrease"}</span><span>{inr(Math.abs((finalView ? finalView.total : chargeOf(priceChange)) - (finalView ? finalView.was ?? chargedBefore : chargedBefore)))}</span></div>
            </div>
            {finalView && finalView.moved.length ? (
              <div className="pv-pchg-lines">
                <div className="pv-pchg-lines-h">What moved</div>
                {finalView.moved.map((l, i) => (
                  <div key={i}><span>{l.label}</span><span><s>{inr(l.was)}</s> → <b>{inr(l.now)}</b></span></div>
                ))}
                <div className="pv-pchg-lines-n">Our service fee and GST move with it. The table below now shows the final prices.</div>
              </div>
            ) : null}
            <div className="pv-pchg-actions">
              <button type="button" className="pv-cta pv-cta--ghost" onClick={() => setChangeSeen(true)}>Not now</button>
              <button type="button" className="pv-cta pv-cta--pay" onClick={() => { setChangeSeen(true); void payNow(); }}>
                Pay <span className="pv-cta-amt">{inr(chargeOf(priceChange))}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {payToken && payingFlights && flightQuote ? (
        <ProposalFlightPayModal token={payToken} quote={flightQuote} onClose={() => setPayingFlights(false)}
          // the live check is back (Next): the prices on the page behind show the final price too, and the old popup stays quiet
          onChecked={(r) => { setChangeSeen(true); setCheck({ status: "ready", data: r }); }} />
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
            {offlineNotice ? <OfflineBanner notice={offlineNotice} /> : null}
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
                        <Fragment key={i}>
                          {f.offline ? <div style={{ marginTop: 6 }}><OfflineTag /></div> : null}
                          {f.depTime ? (f.alternatives?.length ? <FlightGroup f={f} onSwap={onSwapFlight} /> : <RecommendedFlightRow f={f} />) : <PendingFlightRow f={f} />}
                        </Fragment>
                      )}
                    </>
                  ) : null}

                  {enrichedData.stays?.length ? (
                    <>
                      <h2 className="pv-section-title">Where you stay</h2>
                      {enrichedData.stays.map((st: any, i: number) => (
                        <div className="pv-recgroup" key={i}>
                          <div className="pv-recgroup-head">
                            <span className="pv-recgroup-title">{st.area ? `${st.city} · ${st.area}` : st.city}{st.offline ? <> <OfflineTag /></> : null}</span>
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
                        {data.costRange.estimateLabels.length ? " Lines marked AI estimate are not live rates." : ""}
                      </div>
                    </>
                  ) : null}

                  {data.costLines?.length ? (
                    <>
                      <h2 className="pv-section-title">What it costs</h2>
                      <div className="pv-costtable">
                        {costRows.map((ln: any, i: number) =>
                          // a line that moved at the live check no longer matches its fare breakdown, so it shows as a plain row
                          ln.breakdown?.length && ln.was == null ? (
                            // A live-priced flight: its line opens into what the price is made of.
                            <details className="pv-costrow-wrap" key={i}>
                              <summary className="pv-costrow pv-costrow--open">
                                <span>{ln.label}{ln.offline ? <> <OfflineTag /></> : null}<span className="pv-costrow-caret" aria-hidden="true" /></span>
                                <span>{ln.was != null ? <s className="pv-was">{inr(ln.was)}</s> : null}{inr(ln.sell)}</span>
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
                              <span>{ln.label}{ln.offline ? <> <OfflineTag /></> : null}</span>
                              <span>{ln.was != null ? <s className="pv-was">{inr(ln.was)}</s> : null}{Number(ln.sell) > 0 ? inr(ln.sell) : "To be confirmed"}</span>
                            </div>
                          ),
                        )}
                        <div className="pv-costrow pv-costrow--total">
                          <span>{finalView ? "Final trip total" : "Trip total"}{finalView ? <small className="pv-final-tag"> · checked live just now</small> : null}</span>
                          <span>{finalView && finalView.was != null ? <s className="pv-was">{inr(finalView.was)}</s> : null}{inr(finalView ? finalView.total : data.grandTotal)}</span>
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
                      <button type="button" className="pv-cta pv-cta--pay" onClick={startPay} disabled={check.status === "checking" || paying}
                        aria-busy={check.status === "checking" || paying}>
                        {paying ? (payStep && payStep.steps > 1 ? `Paying ${payStep.step} of ${payStep.steps}…` : "Opening payment…")
                          : check.status === "checking" && wantPay ? words.buttonChecking : "Pay now"}
                        {/* the amount only once the live check has confirmed it: before that it is not final */}
                        {!paying && !(check.status === "checking" && wantPay) && check.status === "ready" && check.data ? (
                          <span className="pv-cta-amt">{inr(chargeOf(check.data))}</span>
                        ) : null}
                      </button>
                    ) : payToken && !data._locked && payQuote?.payable && !flightQuote?.payable ? (
                      <button type="button" className="pv-cta pv-cta--pay" onClick={() => setPayingStay(payQuote.stays[0])}>
                        Pay now
                      </button>
                    ) : previewPayable ? (
                      payPreviewUrl ? (
                        // The very link "Copy web link" copies, opened in a new tab: the customer's own page and flow (Pay now there asks for the
                        // traveller details, checks the live price once, shows the final price, then pays). No extra settings, so nothing runs by itself.
                        <a className="pv-cta pv-cta--pay" href={payPreviewUrl} target="_blank" rel="noreferrer"
                          title="Opens the customer's web link in a new tab, exactly as the customer sees it: press Pay now there">
                          Pay now <span aria-hidden="true">↗</span>
                        </a>
                      ) : (
                        <button type="button" className="pv-cta pv-cta--pay" disabled title="Create the web link first: Pay now runs on the customer's link">
                          Pay now
                        </button>
                      )
                    ) : null}
                  </div>
                  {payToken && flightQuote?.payable && payment !== "success" ? (
                    <div className={"pv-actions-note" + (check.status === "error" || payErr ? " is-err" : "")} role="status">
                      {payErr ? payErr
                        : check.status === "checking" ? <><span className="pv-dot" /> {words.checking}</>
                        : check.status === "needs_passengers" ? <>We need the traveller details before you can pay. <button type="button" className="pv-linkbtn" onClick={() => setPayingFlights(true)}>Enter traveller details</button></>
                        : check.status === "ready" ? <>{words.ready}{check.data?.price_changed ? ` — now ${inr(check.data.pay_amount ?? check.data.amount)}` : ""} · secure payment
                            {Number(check.data?.addons_by_advisor || 0) > 0 ? " · your seats, meals and bags are included — your advisor confirms them with the airline right after booking" : ""}
                            {(check.data?.bookings || []).length > 1 ? ` · ${check.data.bookings.length} payments, one per booking` : ""}</>
                        : check.status === "paid" ? `Payment received${check.data?.order_number ? ` · booking ${check.data.order_number}` : ""}. Your advisor is completing the booking.`
                        : check.status === "error" ? <>{check.message || "We couldn't confirm the live price."} <button type="button" className="pv-linkbtn" onClick={startPay}>Try again</button></>
                        : words.idle}
                    </div>
                  ) : null}
                  {payToken && flightQuote?.payable && payment !== "success" && check.status !== "paid" && words.offlineLine ? (
                    // the vendor-quoted items are not part of the live check, so the page says they don't change
                    <div className="pv-actions-note pv-offnote" role="note">{words.offlineLine}</div>
                  ) : (payToken && !data._locked && payQuote?.payable && payment !== "success") || previewPayable ? (
                    <div className="pv-actions-note">Secure payment · prices are re-checked with the airline and hotel before you pay</div>
                  ) : null}
                  {payToken && flightQuote?.payable && payment !== "success" && check.status !== "paid" ? (
                    // The price table above is the one price: it says what is final once the live check is back.
                    check.status === "ready" && check.data ? (
                      Number(check.data.pays_trip_total ?? flightQuote.pays_trip_total) ? null : (
                        <div className="pv-actions-note">Pay now {inr(check.data.amount ?? flightQuote.amount)} covers the airline and hotel fares; our service fee, GST and any other items are settled with your advisor.</div>
                      )
                    ) : (
                      <div className="pv-actions-note">{words.summaryNote}</div>
                    )
                  ) : null}
                  {payToken && flightQuote && !flightQuote.payable && flightQuote.reason && payment !== "success" && check.status !== "paid" ? (
                    <div className="pv-actions-note is-err" role="status">{flightQuote.reason}</div>
                  ) : null}
                  {payToken && debug ? (
                    <LiveCheckTrace token={payToken} version={`${check.status}:${choiceVersion}:${payErr || ""}:${paying}`}
                      onRerun={runCheck} busy={check.status === "checking"} />
                  ) : null}
                  {payToken && check.status === "ready" && check.data?.pay_by && payment !== "success" ? (
                    <div className="pv-hold"><PayTimer payBy={check.data.pay_by} onExpire={() => setCheck({ status: "idle" })} what={flightQuote?.flights?.length ? "trip" : "room"} /></div>
                  ) : null}
                </>
              ) : null}

              {activeTab === "Days" ? <DaysTab data={data} stays={enrichedStays} /> : null}

              {activeTab === "Suggestions" && hasEat ? <SuggestionsTab data={data} /> : null}
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
