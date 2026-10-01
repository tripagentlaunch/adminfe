/* =============================================================================
 * TripAgent — src/components/proposal/ProposalDocument.tsx
 * Proposal PDF (rebuilt 2026-09-26) — restructured into three PDF pages
 * that mirror ProposalPreviewPage.tsx's on-screen Plan/Days/Decisions
 * tabs (a PDF has no tabs/hover/JS state, so each "tab" becomes its own
 * page instead). Same real data fields as the screen version
 * (buildProposalTemplateData()'s output) — nothing here is hardcoded.
 * Colors/fonts unchanged from the previous version (--ink/--ivory/--gold/
 * --muted tokens, Fraunces + Inter via proposalFonts.ts).
 * ===========================================================================*/
import { Document, Page, View, Text, StyleSheet, Svg, Path, Circle, Link, Image } from "@react-pdf/renderer";
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
  tabPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 0.75, borderColor: LINE },
  tabPillActive: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: GOLD_INK },
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

// TabRow — a static (non-clickable) visual echo of the screen's Plan/
// Days/Decisions tab bar, so each page reads as one section of the same
// three-part document instead of a disconnected page. `active` highlights
// which "tab" this page corresponds to — purely decorative in a PDF.
function TabRow({ active, hasVisa }: { active: "Plan" | "Days" | "Decisions"; hasVisa: boolean }) {
  const tabs: Array<"Plan" | "Days" | "Decisions"> = hasVisa ? ["Plan", "Days", "Decisions"] : ["Plan", "Days"];
  return (
    <View style={{ flexDirection: "row", gap: 8, marginBottom: 22 }}>
      {tabs.map((t) => (
        <View key={t} style={t === active ? s.tabPillActive : s.tabPill}>
          <Text
            style={{
              fontFamily: "Proposal Sans",
              fontWeight: 600,
              fontSize: 8,
              letterSpacing: 0.6,
              color: t === active ? IVORY : MUTED,
            }}
          >
            {t.toUpperCase()}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Cover({ data }: { data: any }) {
  return (
    <Page size="A4" style={[s.page, s.coverPage]}>
      <View style={{ padding: "48pt 40pt", height: "100%", flexDirection: "column", justifyContent: "space-between", position: "relative" }}>
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

function PlaneGlyph({ size = 8, color = GOLD }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" stroke={color} strokeWidth={2.4} fill="none" />
    </Svg>
  );
}

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

function ArrowGlyph({ size = 8, color = IVORY }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PinGlyph({ size = 8, color = MUTED }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 21s-7-6.1-7-11.2A7 7 0 0 1 19 9.8C19 14.9 12 21 12 21z"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={9.8} r={2.2} stroke={color} strokeWidth={1.6} fill="none" />
    </Svg>
  );
}

const STAY_STATUS_META: Record<string, string> = {
  on_hold: "ON HOLD",
  booked: "CONFIRMED",
  price_changed: "PRICE UPDATED",
};

const COL_W = 50;
const COL_GAP = 6;

// FlightRow — same confirmed/not-yet-selected rendering the old
// FlightsPage used, shared now by the Plan page's "Getting there" section.
function FlightRow({ f, i }: { f: any; i: number }) {
  return f.depTime ? (
    <View
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
    <View
      style={{ backgroundColor: IVORY_DIM, borderRadius: 4, padding: 14, marginTop: i === 0 ? 6 : 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
    >
      <View>
        <Text style={[s.label, { fontSize: 7.5 }]}>{f.date}</Text>
        <Text style={{ fontFamily: "Proposal Serif", fontSize: 13, marginTop: 4, color: MUTED }}>{f.depCity || f.title}{f.arrCity ? ` – ${f.arrCity}` : ""}</Text>
      </View>
      <Text style={[s.label, { fontSize: 7.5 }]}>{f.nextStep ? f.nextStep.toUpperCase() : "NOT YET SELECTED"}</Text>
    </View>
  );
}

// StayCard — same real-photo-banner card design as before, just factored
// out so PlanPage can render it under "Where you stay".
function StayCard({ st, i, isLast }: { st: any; i: number; isLast: boolean }) {
  const photo = st.image ? (
    // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's own Image; no alt prop exists on it
    <Image src={st.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  ) : (
    <PhotoPlaceholder width={280} height={100} />
  );
  const statusLabel = STAY_STATUS_META[st.status];
  const isStockPhoto = st.imageSource === "pexels";
  const photoBlock = (
    <View style={{ width: "100%", height: 190, backgroundColor: IVORY_DIM, alignItems: "center", justifyContent: "center", position: "relative" }}>
      {photo}
      {isStockPhoto ? (
        <View
          style={{
            position: "absolute",
            left: 10,
            bottom: 10,
            backgroundColor: "rgba(23,19,16,0.74)",
            borderRadius: 3,
            paddingVertical: 4,
            paddingHorizontal: 8,
          }}
        >
          <Text style={{ fontFamily: "Proposal Sans", fontWeight: 600, fontSize: 7.5, letterSpacing: 0.6, color: IVORY }}>REPRESENTATIVE IMAGE</Text>
        </View>
      ) : null}
    </View>
  );
  return (
    <View
      wrap={false}
      style={{
        marginBottom: isLast ? 0 : 22,
        borderWidth: 0.75,
        borderColor: LINE,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {st.url ? (
        <Link src={st.url} style={{ width: "100%", height: 190 }}>
          {photoBlock}
        </Link>
      ) : (
        photoBlock
      )}

      <View style={{ padding: 18 }}>
        <View style={[s.pageHeadRow, { alignItems: "center" }]}>
          <Text style={s.label}>
            {(st.city || "").toUpperCase()}
            {st.dateRange ? `  ·  ${st.dateRange}` : ""}
          </Text>
          {statusLabel ? (
            <View style={{ backgroundColor: IVORY_DIM, borderWidth: 0.75, borderColor: LINE, borderRadius: 3, paddingVertical: 3, paddingHorizontal: 7 }}>
              <Text style={{ fontFamily: "Proposal Sans", fontWeight: 600, fontSize: 7, letterSpacing: 0.8, color: GOLD_INK }}>{statusLabel}</Text>
            </View>
          ) : null}
        </View>

        {st.url ? (
          <Link src={st.url} style={{ textDecoration: "none" }}>
            <Text style={{ fontFamily: "Proposal Serif", fontSize: 19, marginTop: 7, color: INK }}>{st.name}</Text>
          </Link>
        ) : (
          <Text style={{ fontFamily: "Proposal Serif", fontSize: 19, marginTop: 7 }}>{st.name}</Text>
        )}
        {st.roomAndBoard ? <Text style={{ fontSize: 9.5, color: MUTED, marginTop: 3 }}>{st.roomAndBoard}</Text> : null}

        {st.officialWebsiteUrl || st.mapsUrl ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 12 }}>
            {st.officialWebsiteUrl ? (
              <Link src={st.officialWebsiteUrl}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: GOLD_INK,
                    borderRadius: 20,
                    paddingVertical: 7,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text style={{ fontFamily: "Proposal Sans", fontWeight: 600, fontSize: 8.5, letterSpacing: 0.5, color: IVORY }}>VISIT OFFICIAL WEBSITE</Text>
                  <ArrowGlyph size={8} color={IVORY} />
                </View>
              </Link>
            ) : null}
            {st.mapsUrl ? (
              <Link src={st.mapsUrl}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <PinGlyph size={9} color={MUTED} />
                  <Text style={{ fontFamily: "Proposal Sans", fontSize: 8.5, color: MUTED }}>View on map</Text>
                </View>
              </Link>
            ) : null}
          </View>
        ) : null}

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16, paddingTop: 12, borderTopWidth: 0.75, borderTopColor: LINE }}>
          <Text style={[s.label, { fontSize: 7.5 }]}>STAY TOTAL</Text>
          <Text style={{ fontFamily: "Proposal Serif", fontSize: 15, color: GOLD_INK }}>{inr(st.price)}</Text>
        </View>
      </View>
    </View>
  );
}

// PlanPage — mirrors the screen's "Plan" tab: the shape (dates/traveller/
// route), getting there (flights), where you stay (hotel cards), what it
// costs. Same real fields ProposalPreviewPage.tsx's Plan tab reads.
function PlanPage({ data, hasVisa }: { data: any; hasVisa: boolean }) {
  return (
    <Page size="A4" style={s.page}>
      <TabRow active="Plan" hasVisa={hasVisa} />
      <PageHeader left="THE SHAPE" right={(data.dateRange || "").toUpperCase()} />

      <View style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 0.75, borderBottomColor: LINE }}>
          <Text style={s.label}>DATES</Text>
          <Text style={{ fontSize: 10.5 }}>
            {data.dateRange}
            {data.nights ? ` · ${data.nights} nights` : ""}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 0.75, borderBottomColor: LINE }}>
          <Text style={s.label}>TRAVELLER</Text>
          <Text style={{ fontSize: 10.5 }}>
            {data.pax || 1}
            {data.flights?.[0]?.cabin ? ` · ${data.flights[0].cabin} cabin` : ""}
          </Text>
        </View>
        {data.cities?.length ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 0.75, borderBottomColor: LINE }}>
            <Text style={s.label}>ROUTE</Text>
            <Text style={{ fontSize: 10.5 }}>{data.cities.join(" → ")}</Text>
          </View>
        ) : null}
      </View>

      {data.flights?.length ? (
        <View style={{ marginBottom: 24 }} wrap={false}>
          <PageHeader left="GETTING THERE" right="" />
          {data.flights.map((f: any, i: number) => (
            <FlightRow key={i} f={f} i={i} />
          ))}
        </View>
      ) : null}

      {data.stays?.length ? (
        <View style={{ marginBottom: 24 }}>
          <PageHeader left="WHERE YOU STAY" right={`${data.stays.length} ${data.stays.length === 1 ? "STAY" : "STAYS"}`} />
          {data.stays.map((st: any, i: number) => (
            <StayCard key={i} st={st} i={i} isLast={i === data.stays.length - 1} />
          ))}
        </View>
      ) : null}

      {data.costLines?.length ? (
        <View wrap={false}>
          <PageHeader left="WHAT IT COSTS" right={`${data.pax || 1} TRAVELLER${data.pax > 1 ? "S" : ""}, ALL IN`} />
          {data.costLines.map((ln: any, i: number) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 0.75, borderBottomColor: LINE }}>
              <Text style={{ fontSize: 10.5 }}>{ln.label || ln.type}</Text>
              <Text style={{ fontFamily: "Proposal Serif", fontSize: 12 }}>{inr(ln.sell)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 14 }}>
            <Text style={s.label}>TRIP TOTAL</Text>
            <Text style={{ fontFamily: "Proposal Serif", fontSize: 20, color: GOLD_INK }}>{inr(data.grandTotal)}</Text>
          </View>
        </View>
      ) : null}
    </Page>
  );
}

// DaysPage — mirrors the screen's "Days" tab: the real calendar strip
// (unchanged from the previous DayCostPage — same calendarDays/
// calendarBlocks/calendarCaptions from proposalTemplateData.ts).
function DaysPage({ data, hasVisa }: { data: any; hasVisa: boolean }) {
  const days = data.calendarDays || [];
  const blocks = data.calendarBlocks || [];
  const captions = data.calendarCaptions || {};
  const stripWidth = days.length * COL_W + Math.max(0, days.length - 1) * COL_GAP;

  return (
    <Page size="A4" style={s.page}>
      <TabRow active="Days" hasVisa={hasVisa} />
      <PageHeader left={`YOUR ${days.length} DAYS`} right={(data.dateRange || "").toUpperCase()} />

      <View style={{ marginTop: 6, width: stripWidth }}>
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
    </Page>
  );
}

// DecisionsPage — mirrors the screen's "Decisions" tab: only rendered
// when data.visa exists (same condition ProposalPreviewPage.tsx uses to
// hide the Decisions tab entirely). Concierge contact moved here from the
// old FlightsPage, since "before you travel" logistics belong with visa.
function DecisionsPage({ data, hasVisa }: { data: any; hasVisa: boolean }) {
  return (
    <Page size="A4" style={s.page}>
      <TabRow active="Decisions" hasVisa={hasVisa} />
      <PageHeader left="BEFORE MONEY MOVES" right="" />

      <View style={{ backgroundColor: IVORY_DIM, borderRadius: 4, padding: 16, marginTop: 6 }}>
        <Text style={{ fontFamily: "Proposal Serif", fontSize: 13 }}>
          <Text style={{ fontWeight: 700 }}>{(data.visa?.title || "Visa").toUpperCase()}. </Text>
          {data.visa?.decisionNote || data.visa?.sub}
        </Text>
        {data.visa?.submittedNote ? <Text style={{ fontSize: 9, color: MUTED, marginTop: 6 }}>{data.visa.submittedNote}</Text> : null}
      </View>

      {data.visa?.passportNote ? (
        <View style={{ marginTop: 24 }}>
          <PageHeader left="PASSPORTS" right="" />
          <Text style={{ fontFamily: "Proposal Serif", fontSize: 13, marginTop: 4 }}>{data.visa.passportNote}</Text>
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

// PAGE_COUNT — Cover, Plan, Days, +Decisions only when data.visa exists
// (matches the screen's own hasVisa gate, so the page navigator and the
// tab bar never disagree about how many sections this proposal has).
export function pageCountFor(data: any): number {
  return data?.visa ? 4 : 3;
}
export const PAGE_COUNT = 4; // kept for any caller still importing the old static constant; prefer pageCountFor(data).

export function ProposalDocument({ data }: { data: any }) {
  const hasVisa = !!data.visa;
  return (
    <Document>
      <Cover data={data} />
      <PlanPage data={data} hasVisa={hasVisa} />
      <DaysPage data={data} hasVisa={hasVisa} />
      {hasVisa ? <DecisionsPage data={data} hasVisa={hasVisa} /> : null}
    </Document>
  );
}
