/* =============================================================================
 * TripAgent — src/components/proposal/ProposalDocument.tsx
 * Proposal PDF (2026-09-08, direct request) — react-pdf template matching
 * the sample "Switzerland-Iyer-Itinerary.pdf": cover, day-grid + costs,
 * stays, flights/visa/concierge. Same component tree renders both the
 * in-panel <PDFViewer> preview and the exported file — no drift between
 * the two by construction. Colors reuse the app's own tokens.css values
 * (--ink/--ivory/--gold/--muted) since they already read close to the
 * sample's palette; fonts are Fraunces (serif) + Inter (sans), the
 * closest open match to the sample's typography (see proposalFonts.ts).
 * ===========================================================================*/
import { Document, Page, View, Text, StyleSheet, Svg, Path, Circle } from "@react-pdf/renderer";
import { registerProposalFonts } from "../../lib/proposalFonts";
import { ContourArt } from "./ContourArt";
import { inr } from "../../services/api";

registerProposalFonts();

const INK = "#171310";
const IVORY = "#FAF6EB";
const IVORY_DIM = "#F2EBDA";
const GOLD = "#C0982A";
const GOLD_INK = "#785C12";
const MUTED = "#7A7263";
const LINE = "#D9D2C0";
const LINE_ON_INK = "rgba(250,246,235,0.22)";

const s = StyleSheet.create({
  page: { fontFamily: "Proposal Sans", fontSize: 10, color: INK, backgroundColor: IVORY, padding: "48pt 40pt" },
  coverPage: { backgroundColor: INK, color: IVORY, padding: 0 },
  label: { fontFamily: "Proposal Sans", fontSize: 8, letterSpacing: 1.6, color: MUTED, textTransform: "uppercase" },
  labelOnInk: { fontFamily: "Proposal Sans", fontSize: 8, letterSpacing: 1.6, color: "rgba(250,246,235,0.6)", textTransform: "uppercase" },
  hr: { borderBottomWidth: 0.75, borderBottomColor: LINE, marginTop: 8, marginBottom: 16 },
  hrOnInk: { borderBottomWidth: 0.75, borderBottomColor: LINE_ON_INK, marginTop: 8, marginBottom: 16 },
  h1: { fontFamily: "Proposal Serif", fontWeight: 300, fontSize: 52, color: IVORY },
  h2: { fontFamily: "Proposal Serif", fontWeight: 400, fontSize: 15, color: INK },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  pageHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
});

function PageHeader({ left, right }: { left: string; right: string }) {
  return (
    <View>
      <View style={s.pageHeadRow}>
        <Text style={s.label}>{left}</Text>
        <Text style={s.label}>{right}</Text>
      </View>
      <View style={s.hr} />
    </View>
  );
}

function Cover({ data }: { data: any }) {
  return (
    <Page size="A4" style={[s.page, s.coverPage]}>
      <View style={{ padding: "48pt 40pt", height: "100%", flexDirection: "column", justifyContent: "space-between", position: "relative" }}>
        {/* Painted FIRST (2026-09-08 fix) so it sits behind every other
            child below — react-pdf paints in document order regardless of
            position:absolute, unlike a browser's own stacking contexts. */}
        <View style={{ position: "absolute", left: 0, right: 0, top: "34%" }}>
          <ContourArt width={595} height={360} stroke={GOLD} strokeOpacity={0.55} />
        </View>

        <View style={[s.row, { alignItems: "center" }]}>
          <Text style={[s.labelOnInk, { color: GOLD, opacity: 1 }]}>TRIPAGENT</Text>
          <Text style={s.labelOnInk}>PRIVATE ITINERARY</Text>
        </View>

        <View>
          <Text style={[s.labelOnInk, { color: GOLD, opacity: 1, marginBottom: 14 }]}>{(data.dateRange || "").toUpperCase()}</Text>
          <Text style={s.h1}>{data.destination}</Text>
          <Text style={{ fontFamily: "Proposal Serif", fontSize: 14, color: "rgba(250,246,235,0.65)", marginTop: 10 }}>
            {(data.cities || []).join("  ·  ")}
          </Text>
        </View>

        <View>
          <View style={s.hrOnInk} />
          <View style={s.row}>
            <View>
              <Text style={{ fontFamily: "Proposal Serif", fontSize: 13, color: IVORY }}>{data.memberName || "—"}</Text>
              <Text style={[s.labelOnInk, { marginTop: 4 }]}>
                {data.nights ? `${data.nights} NIGHTS` : ""}
                {data.stays?.length ? ` · ${data.stays.length} STAYS` : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.labelOnInk}>ALL INCLUSIVE</Text>
              <Text style={{ fontFamily: "Proposal Serif", fontSize: 22, color: GOLD, marginTop: 2 }}>{inr(data.grandTotal)}</Text>
            </View>
          </View>
        </View>
      </View>
    </Page>
  );
}

// Small paper-plane glyph (2026-09-08) — react-pdf/PDF fonts can't
// reliably render the ✈ emoji, so this draws the same simple arrow-plane
// shape the app's own Icon.tsx "send" glyph uses, scaled down, for the
// calendar strip's real arrival/departure captions.
function PlaneGlyph({ size = 8, color = GOLD }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" stroke={color} strokeWidth={2.4} fill="none" />
    </Svg>
  );
}

// PhotoPlaceholder (2026-09-08, direct feedback) — the stay thumbnail
// previously reused ContourArt (the cover's decorative motif), which
// reads as a finished illustration rather than an empty slot: "these
// are supposed to be image placeholders." A plain mountain/sun icon on
// a flat tint is the honest signal — the app's own established pattern
// for "no data yet" (see Design Principles memory: honest empty states
// over fabricated content) — since there's no real per-hotel photo
// source in this app yet, not a decorative flourish to build instead.
function PhotoPlaceholder({ width, height }: { width: number; height: number }) {
  const cx = width / 2;
  const cy = height / 2;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Circle cx={cx - width * 0.12} cy={cy - height * 0.14} r={Math.min(width, height) * 0.07} stroke={MUTED} strokeWidth={1.2} fill="none" />
      <Path
        d={`M${cx - width * 0.28} ${cy + height * 0.16} L${cx - width * 0.06} ${cy - height * 0.1} L${cx + width * 0.08} ${cy + height * 0.02} L${cx + width * 0.2} ${cy - height * 0.12} L${cx + width * 0.28} ${cy + height * 0.16} Z`}
        stroke={MUTED}
        strokeWidth={1.2}
        fill="none"
      />
    </Svg>
  );
}

const COL_W = 50;
const COL_GAP = 6;

// DayCostPage — day-by-day calendar strip + real cost breakdown
// (2026-09-08, rebuilt per direct feedback to actually match the sample:
// stays render as spanning colored blocks across their real number of
// nights — not one flat tile per day — using calendarDays/calendarBlocks
// from proposalTemplateData.ts. Only the arrival/departure time captions
// are real (parsed from actual flight data); the sample's mid-trip
// transit captions ("Funicular from lakeshore") are curated narrative
// with no source in this data model, so those are left out rather than
// invented — the SAME "derive or omit" rule as the rest of this
// template. Cost lines are the SAME real pricing.lines the app's own
// Quote Builder shows, never a separate/invented number.
function DayCostPage({ data }: { data: any }) {
  const days = data.calendarDays || [];
  const blocks = data.calendarBlocks || [];
  const captions = data.calendarCaptions || {};
  const stripWidth = days.length * COL_W + Math.max(0, days.length - 1) * COL_GAP;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader left={`YOUR ${days.length} DAYS`} right={(data.dateRange || "").toUpperCase()} />

      <View style={{ marginTop: 6, marginBottom: 28, width: stripWidth }}>
        <View style={{ flexDirection: "row" }}>
          {days.map((d: any, i: number) => (
            <View key={i} style={{ width: COL_W, marginRight: i < days.length - 1 ? COL_GAP : 0, alignItems: "center" }}>
              <Text style={[s.label, { fontSize: 7, textAlign: "center" }]}>{d.dow}</Text>
              <Text style={{ fontFamily: "Proposal Serif", fontSize: 18, color: INK, marginTop: 2, textAlign: "center" }}>{d.dom}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", marginTop: 8 }}>
          {blocks.map((b: any, i: number) => (
            <View
              key={i}
              style={{
                width: b.span * COL_W + (b.span - 1) * COL_GAP,
                marginRight: b.startIdx + b.span < days.length ? COL_GAP : 0,
                backgroundColor: b.isHome ? IVORY_DIM : b.tone,
                borderRadius: 3,
                padding: 8,
                minHeight: 44,
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: "Proposal Sans", fontWeight: 700, fontSize: 8, letterSpacing: 0.6, color: b.isHome ? MUTED : IVORY }}>{b.label}</Text>
              {b.sub ? <Text style={{ fontSize: 7.5, color: b.isHome ? MUTED : "rgba(250,246,235,0.7)", marginTop: 2 }}>{b.sub}</Text> : null}
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", marginTop: 8 }}>
          {days.map((d: any, i: number) => (
            <View key={i} style={{ width: COL_W, marginRight: i < days.length - 1 ? COL_GAP : 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 }}>
              {captions[i] ? (
                <>
                  <PlaneGlyph size={7} />
                  <Text style={{ fontSize: 7.5, color: GOLD_INK }}>{captions[i]}</Text>
                </>
              ) : null}
            </View>
          ))}
        </View>
      </View>

      <PageHeader left="WHAT IT COSTS" right={`${data.pax || 1} TRAVELLER${data.pax > 1 ? "S" : ""}, ALL IN`} />

      <View>
        {(data.costLines || []).map((ln: any, i: number) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 0.75, borderBottomColor: LINE }}>
            <Text style={{ fontSize: 10.5 }}>{ln.label || ln.type}</Text>
            <Text style={{ fontFamily: "Proposal Serif", fontSize: 12 }}>{inr(ln.sell)}</Text>
          </View>
        ))}
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 14 }}>
          <Text style={s.label}>TOTAL</Text>
          <Text style={{ fontFamily: "Proposal Serif", fontSize: 20, color: GOLD_INK }}>{inr(data.grandTotal)}</Text>
        </View>
      </View>
    </Page>
  );
}

// StaysPage — one block per hotel, real data only: no curated
// neighborhood/place prose (see proposalTemplateData.ts's note on why
// that's omitted rather than invented). Thumbnail is PhotoPlaceholder —
// an honest "no photo yet" slot, not decorative art standing in for one
// (there's no real per-hotel photo source in the app yet).
function StaysPage({ data }: { data: any }) {
  const stays = data.stays || [];
  return (
    <Page size="A4" style={s.page}>
      <PageHeader left="WHERE YOU STAY" right={`${stays.length} ${stays.length === 1 ? "STAY" : "STAYS"}`} />
      {stays.map((st: any, i: number) => (
        <View key={i} style={{ flexDirection: "row", gap: 20, paddingVertical: 20, borderBottomWidth: i < stays.length - 1 ? 0.75 : 0, borderBottomColor: LINE }}>
          <View style={{ width: 170, height: 115, backgroundColor: IVORY_DIM, borderRadius: 4, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
            <PhotoPlaceholder width={170} height={115} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.pageHeadRow}>
              <Text style={s.label}>{(st.city || "").toUpperCase()}</Text>
              <Text style={s.label}>{st.dateRange}</Text>
            </View>
            <Text style={{ fontFamily: "Proposal Serif", fontSize: 15, marginTop: 4 }}>{st.name}</Text>
            {st.roomAndBoard ? <Text style={{ fontSize: 9.5, color: MUTED, marginTop: 3 }}>{st.roomAndBoard}</Text> : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
              <Text style={[s.label, { fontSize: 7.5 }]}>{(st.status || "").replace(/_/g, " ").toUpperCase()}</Text>
              <Text style={{ fontFamily: "Proposal Serif", fontSize: 12 }}>{inr(st.price)}</Text>
            </View>
          </View>
        </View>
      ))}
    </Page>
  );
}

// FlightsPage — flights + visa/passport + concierge contact. Every
// section is independently conditional: an itinerary with no visa yet,
// or before an advisor record loads, should just show less — never a
// placeholder pretending data exists (same "honest omission" rule as the
// rest of this template).
function FlightsPage({ data }: { data: any }) {
  const flights = data.flights || [];
  return (
    <Page size="A4" style={s.page}>
      <PageHeader left="GETTING THERE AND BACK" right="" />

      {flights.map((f: any, i: number) =>
        f.depTime ? (
          // Confirmed leg — real departure AND arrival, both derived
          // from real fields (day.route for cities, duration for the
          // arrival date — see addDurationDate in proposalTemplateData.ts).
          <View
            key={i}
            style={{ backgroundColor: IVORY_DIM, borderRadius: 4, padding: 14, marginTop: i === 0 ? 6 : 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <View>
              <Text style={[s.label, { fontSize: 7.5 }]}>{f.date}</Text>
              <Text style={{ fontFamily: "Proposal Serif", fontSize: 20, marginTop: 4 }}>{f.depTime}</Text>
              {f.depCity ? <Text style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>{f.depCity}</Text> : null}
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 8.5, letterSpacing: 1, color: MUTED }}>
                {(f.segments || []).map((seg: any) => seg.flightNo).filter(Boolean).join("  ·  ")}
              </Text>
              <View style={{ borderBottomWidth: 0.75, borderBottomColor: LINE, width: 90, marginTop: 6 }} />
              <Text style={{ fontSize: 8, color: MUTED, marginTop: 6 }}>{f.duration}{f.cabin ? ` · ${f.cabin}` : ""}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[s.label, { fontSize: 7.5 }]}>{f.arrivalDate || f.date}</Text>
              <Text style={{ fontFamily: "Proposal Serif", fontSize: 20, marginTop: 4 }}>{f.arrivalTime || ""}</Text>
              {f.arrCity ? <Text style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>{f.arrCity}</Text> : null}
            </View>
          </View>
        ) : (
          // Not yet selected — real status, not a fabricated time (see
          // mockItinerary.ts's return leg: time:null, nextStep:"4
          // options"). Showing this honestly instead of blank fields.
          <View
            key={i}
            style={{ backgroundColor: IVORY_DIM, borderRadius: 4, padding: 14, marginTop: i === 0 ? 6 : 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <View>
              <Text style={[s.label, { fontSize: 7.5 }]}>{f.date}</Text>
              <Text style={{ fontFamily: "Proposal Serif", fontSize: 13, marginTop: 4, color: MUTED }}>{f.depCity || f.title}{f.arrCity ? ` – ${f.arrCity}` : ""}</Text>
            </View>
            <Text style={[s.label, { fontSize: 7.5 }]}>{f.nextStep ? f.nextStep.toUpperCase() : "NOT YET SELECTED"}</Text>
          </View>
        )
      )}

      {data.visa || data.concierge ? (
        <View style={{ marginTop: 28 }}>
          <PageHeader left="BEFORE YOU TRAVEL" right="" />
          {data.visa ? (
            <View style={{ flexDirection: "row", gap: 24 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{(data.visa.title || "VISA").toUpperCase()}</Text>
                <Text style={{ fontFamily: "Proposal Serif", fontSize: 13, marginTop: 4 }}>{data.visa.decisionNote || data.visa.sub}</Text>
                {data.visa.submittedNote ? <Text style={{ fontSize: 9, color: MUTED, marginTop: 3 }}>{data.visa.submittedNote}</Text> : null}
              </View>
              {data.visa.passportNote ? (
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>PASSPORTS</Text>
                  <Text style={{ fontFamily: "Proposal Serif", fontSize: 13, marginTop: 4 }}>{data.visa.passportNote}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {data.concierge ? (
        <View style={{ position: "absolute", left: 40, right: 40, bottom: 48 }}>
          <View style={s.hr} />
          <View style={s.row}>
            <View>
              <Text style={{ fontFamily: "Proposal Serif", fontSize: 13 }}>{data.concierge.name}</Text>
              <Text style={[s.label, { marginTop: 4 }]}>YOUR CONCIERGE · 24 HOURS</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              {data.concierge.phone ? <Text style={{ fontSize: 10 }}>{data.concierge.phone}</Text> : null}
              {data.concierge.email ? <Text style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{data.concierge.email}</Text> : null}
            </View>
          </View>
        </View>
      ) : null}
    </Page>
  );
}

// PAGE_COUNT (2026-09-08) — the page navigator control in Proposal
// Composer's header needs a total-pages number, but there's no clean way
// to introspect a rendered PDF's page count from OUR side (the preview
// is the browser's own native PDF viewer inside an iframe, not something
// we render/measure ourselves — see the z-index/background fixes in
// DESIGN-CHANGES.md for the full story on that boundary). Keep this in
// sync by hand whenever a <Page> is added to/removed from the Document
// below. 4 pages: Cover, day-grid + costs, stays, flights/visa/concierge.
export const PAGE_COUNT = 4;

export function ProposalDocument({ data }: { data: any }) {
  return (
    <Document>
      <Cover data={data} />
      <DayCostPage data={data} />
      <StaysPage data={data} />
      <FlightsPage data={data} />
    </Document>
  );
}
