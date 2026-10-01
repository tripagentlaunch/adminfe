"use client";
/* =============================================================================
 * TripAgent — src/components/PublicHotelView.tsx
 * Public, unauthenticated viewer for a hotel name/photo clicked in a
 * Proposal PDF or its in-app preview (/hotel/[hotelKey], 2026-09-10).
 * Counterpart to PublicProposalView.tsx — same posture (no session, calls
 * the FastAPI backend directly via services/api.ts's hotelPublicGet(), no
 * Authorization header) and same tal-shell/tal-card shell for loading/error
 * states, borrowed directly rather than reinvented.
 *
 * Sell-only, real data only: renders whatever hotel_snapshots actually
 * stored (name/city/address/stars/image/images/facilities) — no price, no
 * rate, no description prose invented for a field TripSure's listing()
 * response doesn't carry.
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { hotelPublicGet } from "../services/api";
import { errText } from "../lib/advisorHelpers";
import { Icon, Spinner } from "./ui";
import "../styles/advisor-login.css";

type ViewState = { status: "loading" } | { status: "error"; message: string } | { status: "redirecting" } | { status: "active"; hotel: any };

export function PublicHotelView({ hotelKey }: { hotelKey: string }) {
  const [view, setView] = useState<ViewState>({ status: "loading" });

  useEffect(() => {
    hotelPublicGet(hotelKey)
      .then((res: any) => {
        // Real-website redirect (2026-09-11) — once an advisor has set this
        // hotel's own official site (see HotelDesk.tsx's HotelWebsiteEditor),
        // THIS page is only ever reached via a stale/cached link (new links
        // are built pointing straight at it — see proposalTemplateData.ts's
        // hotelUrl()); send the visitor on to the real site rather than
        // showing our own display-only snapshot.
        if (res && res.website) {
          setView({ status: "redirecting" });
          window.location.replace(res.website);
          return;
        }
        setView({ status: "active", hotel: res });
      })
      .catch((e: any) => setView({ status: "error", message: errText(e) }));
  }, [hotelKey]);

  if (view.status === "redirecting") {
    return (
      <div className="tal-shell">
        <div className="tal-card tal-card--loading">
          <Spinner />
          <p className="tal-sub" style={{ margin: 0 }}>
            Redirecting to the hotel&rsquo;s website…
          </p>
        </div>
      </div>
    );
  }

  if (view.status === "loading") {
    return (
      <div className="tal-shell">
        <div className="tal-card tal-card--loading">
          <Spinner />
          <p className="tal-sub" style={{ margin: 0 }}>
            Loading hotel details…
          </p>
        </div>
      </div>
    );
  }

  if (view.status === "error") {
    return (
      <div className="tal-shell">
        <div className="tal-card">
          <div className="tal-brand">
            <Icon name="alert" size={20} />
            <span>TripAgent</span>
          </div>
          <h1 className="tal-title">Hotel not found</h1>
          <p className="tal-sub">This hotel link isn&rsquo;t available — it may not have been searched yet, or the link is out of date.</p>
        </div>
      </div>
    );
  }

  const h = view.hotel;
  const images: string[] = (h.images && h.images.length ? h.images : h.image ? [h.image] : []).slice(0, 8);
  const facilities: string[] = h.facilities || [];

  return (
    <div className="tal-shell" style={{ alignItems: "flex-start", padding: "32px 16px" }}>
      <div style={{ width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="tal-brand" style={{ margin: 0 }}>
          <Icon name="note" size={20} />
          <span>TripAgent</span>
        </div>

        {images.length ? (
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
              {images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt={h.name || "Hotel photo"}
                  style={{ height: 220, width: i === 0 ? 340 : 160, flex: "0 0 auto", objectFit: "cover", borderRadius: 8, background: "var(--card-2, #eee)" }}
                />
              ))}
            </div>
            {/* Pexels stock photo (2026-09-16; priority changed 2026-09-15 —
                direct request) — h.imageSource comes straight from GET
                /hotels/public/{hotelKey} (hotel_router.py's get_hotel_public),
                which now PREFERS a generic city-exterior Pexels photo over a
                real TripSure photo whenever one is available, not just when
                this hotel has none — "pexels" never means a real photo of
                THIS property, whether or not a real one also exists on file.
                Labeled so a customer is never misled, same rule
                ProposalDocument.tsx's PDF card follows. */}
            {h.imageSource === "pexels" ? (
              <span
                style={{
                  position: "absolute",
                  left: 10,
                  bottom: 10,
                  background: "rgba(23,19,16,0.74)",
                  color: "var(--ivory, #FAF6EB)",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  borderRadius: 4,
                  padding: "4px 8px",
                }}
              >
                Representative image
              </span>
            ) : null}
          </div>
        ) : (
          <div style={{ height: 220, borderRadius: 8, background: "var(--card-2, #eee)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="hotel" size={28} />
          </div>
        )}

        <div className="tal-card" style={{ maxWidth: "none" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1 className="tal-title" style={{ marginBottom: 4 }}>
              {h.name || "Hotel"}
            </h1>
            {h.stars ? (
              <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--gold-ink)", fontFamily: "var(--sans)", fontSize: 13, whiteSpace: "nowrap" }}>
                <Icon name="star" size={14} />
                {h.stars}-star
              </span>
            ) : null}
          </div>
          {h.chain_name ? <p className="tal-sub" style={{ marginBottom: 6 }}>{h.chain_name}</p> : null}
          <p className="tal-sub" style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            {(h.address || h.city) ? (
              <>
                <Icon name="compass" size={14} />
                <span>{[h.address, h.city].filter(Boolean).join(", ")}</span>
              </>
            ) : null}
          </p>

          {facilities.length ? (
            <div style={{ marginTop: 14 }}>
              <p className="tal-sub" style={{ margin: "0 0 8px", fontWeight: 600 }}>
                Amenities
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {facilities.map((f, i) => (
                  <span
                    key={i}
                    style={{ fontFamily: "var(--sans)", fontSize: 12, padding: "5px 10px", borderRadius: 999, background: "var(--card-2, #f2f0eb)", color: "var(--taupe)" }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
