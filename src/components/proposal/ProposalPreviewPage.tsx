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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getDestinationPhoto, inr } from "../../services/api";
import "../../styles/proposal-preview.css";

const TABS = ["Plan", "Days", "Decisions"] as const;
type Tab = (typeof TABS)[number];

function Chip({ label }: { label: string }) {
  return <span className="pv-recgroup-eyebrow">{label}</span>;
}

function RecommendedFlightRow({ f }: { f: any }) {
  return (
    <div className="pv-recflight">
      <div className="pv-recflight-head">
        <span className="pv-option-name">{f.title}</span>
      </div>
      <div className="pv-recflight-row">
        <div>
          <div className="pv-recflight-time">{f.depTime}</div>
          {f.depCity ? <div className="pv-recflight-city">{f.depCity}</div> : null}
        </div>
        <div className="pv-recflight-mid">
          <div className="pv-recflight-nos">{(f.segments || []).map((s: any) => s.flightNo).filter(Boolean).join(" · ")}</div>
          <div className="pv-recflight-line" />
          <div className="pv-recflight-sub">
            {f.duration}
            {f.cabin ? ` · ${f.cabin}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="pv-recflight-time">{f.arrivalTime || ""}</div>
          {f.arrCity ? <div className="pv-recflight-city">{f.arrCity}</div> : null}
        </div>
      </div>
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

function RecommendedStayRow({ st }: { st: any }) {
  return (
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
        </div>
      </div>
      {st.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pv-recstay-photo" src={st.image} alt="" />
      ) : null}
    </div>
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
        {st.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pv-recstay-stacked-photo" src={st.image} alt="" onError={hideBrokenImage} />
        ) : null}
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
        </div>
      </div>
    </div>
  );

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
    <div className="pv-recgroup-split">
      <div>{chosen}</div>
      <div>
        <div className="pv-recgroup-eyebrow" style={{ marginBottom: 10 }}>
          Alternatives
        </div>
        <div className="pv-alt-stack">{altRows}</div>
      </div>
    </div>
  );
}

export function ProposalPreviewPage({ data, onSwapHotel }: { data: any; onSwapHotel?: (stayId: string, hotelKey: string) => void }) {
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

  // usePlacesPhotos — fetch real Google Places photos for each stay
  // that doesn't already have an image, using the backend's existing
  // /api/places/lookup endpoint (customerbe.onrender.com).
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "https://customerbe.onrender.com";
  const [stayPhotos, setStayPhotos] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!data.stays?.length) return;
    data.stays.forEach(async (st: any) => {
      if (st.image || stayPhotos[st.name]) return;
      try {
        const city = data.cities?.[0] || data.destination || "";
        const res = await fetch(
          `${API_BASE}/api/places/lookup?name=${encodeURIComponent(st.name)}&city=${encodeURIComponent(city)}`
        );
        const json = await res.json();
        if (json.found && json.photo_url) {
          setStayPhotos((prev) => ({ ...prev, [st.name]: json.photo_url }));
        }
      } catch {}
    });
  }, [data.stays]);

  const enrichedStays = data.stays?.map((st: any) => ({
    ...st,
    image: st.image || stayPhotos[st.name] || null,
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
                <button type="button" className="pv-dlbtn">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Download PDF
                </button>
              </div>
              <h1 className="pv-title">{data.destination ? `${data.destination}, curated for you` : "Your itinerary"}</h1>
              <div className="pv-subtitle">
                {data.dateRange}
                {data.nights ? ` · ${data.nights} night${data.nights === 1 ? "" : "s"}` : ""}
                {data.pax ? ` · ${data.pax} traveller${data.pax === 1 ? "" : "s"}` : ""}
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
                      <span className="pv-deflabel">Traveller</span>
                      <span className="pv-defvalue">
                        {data.pax || 1}
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
                      {data.flights.map((f: any, i: number) => (f.depTime ? <RecommendedFlightRow key={i} f={f} /> : <PendingFlightRow key={i} f={f} />))}
                    </>
                  ) : null}

                  {enrichedData.stays?.length ? (
                    <>
                      <h2 className="pv-section-title">Where you stay</h2>
                      {enrichedData.stays.map((st: any, i: number) => (
                        <div className="pv-recgroup" key={i}>
                          <div className="pv-recgroup-head">
                            <span className="pv-recgroup-title">{st.city}</span>
                            {st.dateRange ? <span className="pv-recgroup-sub">{st.dateRange}</span> : null}
                          </div>
                          {st.alternatives?.length ? <StayGroup st={st} onSwap={onSwapHotel} /> : <RecommendedStayRow st={st} />}
                        </div>
                      ))}
                    </>
                  ) : null}

                  {data.costLines?.length ? (
                    <>
                      <h2 className="pv-section-title">What it costs</h2>
                      <div className="pv-costtable">
                        {data.costLines.map((ln: any, i: number) => (
                          <div className="pv-costrow" key={i}>
                            <span>{ln.label}</span>
                            <span>{inr(ln.sell)}</span>
                          </div>
                        ))}
                        <div className="pv-costrow pv-costrow--total">
                          <span>Trip total</span>
                          <span>{inr(data.grandTotal)}</span>
                        </div>
                      </div>
                    </>
                  ) : null}

                  <button type="button" className="pv-cta" onClick={() => setTab("Days")}>
                    See the day-by-day plan
                  </button>
                </>
              ) : null}

              {activeTab === "Days" ? (
                <>
                  <h2 className="pv-section-title">
                    {data.calendarDays?.length ? `${data.calendarDays.length} days, at a glance` : "Your days"}
                  </h2>
                  <div className="pv-days">
                    {(data.calendarBlocks || []).map((b: any, i: number) => (
                      <div className="pv-day" key={i}>
                        <div className="pv-day-num">{i + 1}</div>
                        <div>
                          <div className="pv-day-head">{b.isHome ? "Home" : b.label}</div>
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
