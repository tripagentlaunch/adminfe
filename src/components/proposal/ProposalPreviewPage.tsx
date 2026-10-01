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
import { useLayoutEffect, useRef, useState } from "react";
import { inr } from "../../services/api";
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

export function ProposalPreviewPage({ data }: { data: any }) {
  const [tab, setTab] = useState<Tab>("Plan");
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = tabRefs.current[tab];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);

  const hasVisa = !!data.visa;
  const visibleTabs = hasVisa ? TABS : TABS.filter((t) => t !== "Decisions");
  const activeTab = visibleTabs.includes(tab) ? tab : "Plan";

  const heroImage = data.stays?.find((s: any) => s.image)?.image;

  return (
    <div className="pv-page">
      <div className="pv-shell">
        <div className="pv-card">
          <div className="pv-hero" style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}>
            <div className="pv-hero-scrim" />
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

                  {data.stays?.length ? (
                    <>
                      <h2 className="pv-section-title">Where you stay</h2>
                      {data.stays.map((st: any, i: number) => (
                        <div className="pv-recgroup" key={i}>
                          <div className="pv-recgroup-head">
                            <span className="pv-recgroup-title">{st.city}</span>
                            {st.dateRange ? <span className="pv-recgroup-sub">{st.dateRange}</span> : null}
                          </div>
                          <RecommendedStayRow st={st} />
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
