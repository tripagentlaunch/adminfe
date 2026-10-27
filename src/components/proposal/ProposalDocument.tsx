/* =============================================================================
 * TripAgent — src/components/proposal/ProposalDocument.tsx
 * Proposal PDF (restyled 2026-10-19) — the design of london-itinerary-
 * preview.html / ProposalPreviewPage.tsx, laid out for paper: a photo hero
 * with the title, then the Plan section (the shape, getting there, where
 * you stay, what it costs), the Days section and — only when data.visa
 * exists, the same gate the screen uses — the Decisions section. A PDF has
 * no tabs, so each tab is its own section, starting on a new page.
 * Same real data fields as the screen version (buildProposalTemplateData()'s
 * output) — nothing here is hardcoded.
 * ===========================================================================*/
import type { ReactNode } from "react";
import { Document, Page, View, Text, StyleSheet, Svg, Path, Link, Image } from "@react-pdf/renderer";
import { registerProposalFonts } from "../../lib/proposalFonts";
import { inr } from "../../services/api";

registerProposalFonts();

// The template's tokens (proposal-preview.css's .pv-page).
const INK = "#3A352E";
const IVORY = "#FAF6EB";
const GOLD = "#C0982A";
const MUTED = "#7A7263";
const LINE = "#EDEDED";
const PANEL = "#F8F9FA";
const PILL = "#E9EDF1";
const PAD = 40;

const s = StyleSheet.create({
  page: { fontFamily: "Proposal Sans", fontSize: 10, color: INK, backgroundColor: "#FFFFFF", paddingTop: PAD, paddingBottom: 48, paddingHorizontal: PAD },
  sectionTitle: { fontFamily: "Proposal Serif", fontWeight: 400, fontSize: 17, marginTop: 26, marginBottom: 10 },
  eyebrow: { fontFamily: "Proposal Sans", fontWeight: 600, fontSize: 7, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED },
  defRow: { flexDirection: "row", paddingVertical: 7, borderBottomWidth: 0.75, borderBottomColor: LINE, fontSize: 9.5 },
  defLabel: { width: 90, color: MUTED },
  defValue: { flex: 1, fontWeight: 500 },
  panel: { backgroundColor: PANEL, borderRadius: 7, padding: 12 },
  name: { fontWeight: 600, fontSize: 10 },
  detail: { fontSize: 8.5, color: MUTED, marginTop: 3, lineHeight: 1.4 },
  price: { fontFamily: "Proposal Serif", fontSize: 11 },
  dayHead: { fontWeight: 600, fontSize: 10 },
  dayBody: { fontSize: 9, color: MUTED, marginTop: 2, lineHeight: 1.5 },
  footnote: { marginTop: 28, paddingTop: 10, borderTopWidth: 0.75, borderTopColor: LINE, fontSize: 8, color: MUTED },
});

function Star() {
  return (
    <Svg width={6} height={6} viewBox="0 0 24 24">
      <Path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L6 21l1.6-7L2.2 9.2l7.1-.6z" fill="#FFC42E" />
    </Svg>
  );
}

// The template's dark "Our choice" chip (status chips use the same shape).
function Chip({ label, star }: { label: string; star?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#262626", borderRadius: 20, paddingVertical: 2.5, paddingHorizontal: 7 }}>
      {star ? <Star /> : null}
      <Text style={{ fontWeight: 600, fontSize: 6.5, letterSpacing: 0.5, color: "#FFC42E" }}>{label.toUpperCase()}</Text>
    </View>
  );
}

// Static echo of the screen's Plan / Days / Decisions tab bar — the active
// one sits on the template's grey pill.
function TabRow({ active, hasVisa }: { active: "Plan" | "Days" | "Decisions"; hasVisa: boolean }) {
  const tabs: Array<"Plan" | "Days" | "Decisions"> = hasVisa ? ["Plan", "Days", "Decisions"] : ["Plan", "Days"];
  return (
    <View style={{ flexDirection: "row", gap: 4, marginBottom: 4 }}>
      {tabs.map((t) => (
        <View key={t} style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t === active ? PILL : "transparent" }}>
          <Text style={{ fontSize: 9, fontWeight: t === active ? 600 : 400, color: t === active ? INK : MUTED }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function SectionTitle({ children, first }: { children: string; first?: boolean }) {
  return <Text style={[s.sectionTitle, first ? { marginTop: 14 } : {}]}>{children}</Text>;
}

// Hero — the template's photo header: destination photo (or the first stay
// photo) under a dark scrim, wordmark, "Made for", title, dates, summary.
function Hero({ data, heroImage }: { data: any; heroImage: string | null }) {
  const photo = data.coverPhoto && data.coverPhoto.url ? data.coverPhoto : null;
  const pax = data.pax || 0;
  const subtitle = [data.dateRange, data.nights ? `${data.nights} night${data.nights === 1 ? "" : "s"}` : null, data.paxLabel || (pax ? `${pax} traveller${pax === 1 ? "" : "s"}` : null)]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={{ marginHorizontal: -PAD, marginTop: -PAD, height: 250, backgroundColor: "#2B2620", position: "relative" }}>
      {heroImage ? (
        <>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's own Image; no alt prop exists on it */}
          <Image src={heroImage} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          {/* react-pdf has no CSS gradients: a full scrim plus a darker lower band. */}
          <View style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(23,19,16,0.45)" }} />
          <View style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "55%", backgroundColor: "rgba(23,19,16,0.3)" }} />
        </>
      ) : null}
      <View style={{ position: "relative", height: "100%", paddingHorizontal: PAD, paddingTop: 26, paddingBottom: 28, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={{ fontFamily: "Proposal Serif", fontSize: 14, color: IVORY }}>TripAgent</Text>
          <Text style={{ fontSize: 8.5, color: "rgba(250,246,235,0.75)" }}>{data.memberName ? `Made for ${data.memberName}` : "Your proposal"}</Text>
        </View>
        <View>
          <Text style={{ fontFamily: "Proposal Serif", fontWeight: 300, fontSize: 30, color: IVORY }}>
            {data.destination ? `${data.destination}, curated for you` : "Your itinerary"}
          </Text>
          {subtitle ? <Text style={{ color: GOLD, fontSize: 9.5, fontWeight: 600, marginTop: 7 }}>{subtitle}</Text> : null}
          {data.cities?.length ? (
            <Text style={{ fontSize: 9.5, lineHeight: 1.55, color: "rgba(250,246,235,0.85)", marginTop: 10, maxWidth: 420 }}>
              A route through {data.cities.join(", ")} — {data.stays?.length || 0} stay{data.stays?.length === 1 ? "" : "s"} and {data.flights?.length || 0} flight
              {data.flights?.length === 1 ? "" : "s"} arranged so far.
            </Text>
          ) : null}
        </View>
      </View>
      {photo && photo.credit && heroImage === photo.url ? (
        // Photo attribution (Google Places photo terms).
        photo.creditUrl ? (
          <Link src={photo.creditUrl} style={{ position: "absolute", right: PAD, bottom: 8, fontSize: 6, color: "rgba(250,246,235,0.75)", textDecoration: "none" }}>
            {"Photo: " + photo.credit}
          </Link>
        ) : (
          <Text style={{ position: "absolute", right: PAD, bottom: 8, fontSize: 6, color: "rgba(250,246,235,0.75)" }}>{"Photo: " + photo.credit}</Text>
        )
      ) : null}
    </View>
  );
}

function DefRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.defRow}>
      <Text style={s.defLabel}>{label}</Text>
      <Text style={s.defValue}>{value}</Text>
    </View>
  );
}

// FlightRow — the template's flight card: name + chip, times either side
// of the flight numbers, duration and cabin. A leg with no flight chosen
// yet shows its real status instead of a made-up time.
// `heading` (the section title, on the first row) stays on the same page as the card.
function FlightRow({ f, heading }: { f: any; heading?: ReactNode }) {
  if (!f.depTime) {
    return (
      <View wrap={false}>
        {heading}
        <View style={[s.panel, { marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
          <Text style={s.name}>
            {f.depCity || f.title}
            {f.arrCity ? ` – ${f.arrCity}` : ""}
          </Text>
          <Chip label={f.nextStep || "Not yet selected"} />
        </View>
      </View>
    );
  }
  const nos = (f.segments || []).map((seg: any) => seg.flightNo).filter(Boolean).join(" · ");
  return (
    <View wrap={false} style={{ marginBottom: 12 }}>
      {heading}
      {f.depCity && f.arrCity ? (
        <View style={{ marginBottom: 7 }}>
          <Text style={s.name}>{`${f.depCity} → ${f.arrCity}`}</Text>
          {f.date ? <Text style={[s.eyebrow, { marginTop: 2 }]}>{f.date}</Text> : null}
        </View>
      ) : null}
      <View style={s.panel}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={s.name}>{f.title}</Text>
          <Chip label="Our choice" star />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 7 }}>
          <View>
            <Text style={{ fontFamily: "Proposal Serif", fontSize: 16 }}>{f.depTime}</Text>
            {f.depCity ? <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 2 }}>{f.depCity}</Text> : null}
          </View>
          <View style={{ alignItems: "center", flex: 1 }}>
            {nos ? <Text style={{ fontSize: 7.5, letterSpacing: 0.3, color: MUTED }}>{nos}</Text> : null}
            <View style={{ borderTopWidth: 0.75, borderTopColor: "#DCDCDC", width: 64, marginVertical: 4 }} />
            <Text style={{ fontSize: 7.5, color: MUTED }}>{[f.duration, f.cabin].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: "Proposal Serif", fontSize: 16 }}>{f.arrivalTime || ""}</Text>
            {f.arrCity ? <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 2 }}>{f.arrCity}</Text> : null}
            {f.arrivalDate && f.arrivalDate !== "Same day" ? <Text style={{ fontSize: 7, color: MUTED, marginTop: 1 }}>Arrives {f.arrivalDate}</Text> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const STAY_STATUS_META: Record<string, string> = {
  on_hold: "On hold",
  booked: "Confirmed",
  price_changed: "Price updated",
};

// StayGroup — the template's "Where you stay" group: the chosen hotel as a
// stacked photo card, alternatives listed beside it.
function StayGroup({ st, heading }: { st: any; heading?: ReactNode }) {
  const alts: any[] = st.alternatives || [];
  const statusLabel = STAY_STATUS_META[st.status];
  const photoH = alts.length ? 110 : 150;
  const choice = <Chip label={st.isOriginalChoice === false ? "Selected" : "Our choice"} star />;
  const media = st.image ? (
    <View style={{ height: photoH, backgroundColor: "#ECE7DA", position: "relative" }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's own Image; no alt prop exists on it */}
      <Image src={st.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <View style={{ position: "absolute", top: 9, left: 9 }}>{choice}</View>
      {st.imageSource === "pexels" ? (
        <View style={{ position: "absolute", left: 9, bottom: 9, backgroundColor: "rgba(23,19,16,0.74)", borderRadius: 3, paddingVertical: 3, paddingHorizontal: 6 }}>
          <Text style={{ fontWeight: 600, fontSize: 6.5, letterSpacing: 0.5, color: IVORY }}>REPRESENTATIVE IMAGE</Text>
        </View>
      ) : null}
    </View>
  ) : null;
  const card = (
    <View style={{ backgroundColor: PANEL, borderRadius: 7, overflow: "hidden" }}>
      {media && st.url ? <Link src={st.url}>{media}</Link> : media}
      <View style={{ padding: 11 }}>
        {media ? null : <View style={{ flexDirection: "row", marginBottom: 7 }}>{choice}</View>}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {st.url ? (
            <Link src={st.url} style={{ textDecoration: "none", color: INK }}>
              <Text style={s.name}>{st.name}</Text>
            </Link>
          ) : (
            <Text style={s.name}>{st.name}</Text>
          )}
          {statusLabel ? <Chip label={statusLabel} /> : null}
        </View>
        {st.roomAndBoard ? <Text style={s.detail}>{st.roomAndBoard}</Text> : null}
        <Text style={{ fontFamily: "Proposal Serif", fontSize: 14, marginTop: 7 }}>{inr(st.price)}</Text>
        {st.officialWebsiteUrl || st.mapsUrl ? (
          <View style={{ flexDirection: "row", gap: 12, marginTop: 7 }}>
            {st.officialWebsiteUrl ? (
              <Link src={st.officialWebsiteUrl} style={{ fontSize: 8, color: INK }}>
                Official website
              </Link>
            ) : null}
            {st.mapsUrl ? (
              <Link src={st.mapsUrl} style={{ fontSize: 8, color: MUTED }}>
                View on map
              </Link>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
  return (
    <View wrap={false} style={{ marginBottom: 16 }}>
      {heading}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 7 }}>
        <Text style={s.name}>{st.city}</Text>
        {st.dateRange ? <Text style={{ fontSize: 8.5, color: MUTED }}>{st.dateRange}</Text> : null}
      </View>
      {alts.length ? (
        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>{card}</View>
          <View style={{ flex: 1 }}>
            <Text style={[s.eyebrow, { marginBottom: 7 }]}>Alternatives</Text>
            {alts.map((a: any, k: number) => (
              <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: k ? 0.75 : 0, borderTopColor: LINE }}>
                {a.image ? (
                  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's own Image; no alt prop exists on it
                  <Image src={a.image} style={{ width: 36, height: 36, borderRadius: 5, objectFit: "cover" }} />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{a.name}</Text>
                  {a.detail ? <Text style={s.detail}>{a.detail}</Text> : null}
                </View>
                <Text style={s.price}>{inr(a.price)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        card
      )}
    </View>
  );
}

function Footnote() {
  const prepared = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  return <Text style={s.footnote}>{`Prepared ${prepared}. Nothing is booked, held or paid unless noted above.`}</Text>;
}

// PlanPage — the hero and the screen's "Plan" tab.
function PlanPage({ data, hasVisa }: { data: any; hasVisa: boolean }) {
  const heroImage = (data.coverPhoto && data.coverPhoto.url) || data.stays?.find((st: any) => st.image)?.image || null;
  return (
    <Page size="A4" style={s.page}>
      <Hero data={data} heroImage={heroImage} />
      <View style={{ marginTop: 20 }}>
        <TabRow active="Plan" hasVisa={hasVisa} />
      </View>

      <SectionTitle first>The shape</SectionTitle>
      <View>
        <DefRow label="Dates" value={`${data.dateRange || ""}${data.nights ? ` · ${data.nights} nights` : ""}`} />
        <DefRow label="Travellers" value={`${data.paxLabel || data.pax || 1}${data.flights?.[0]?.cabin ? ` · ${data.flights[0].cabin} cabin` : ""}`} />
        {data.cities?.length ? <DefRow label="Route" value={data.cities.join(" → ")} /> : null}
      </View>

      {data.flights?.length ? (
        <View>
          {data.flights.map((f: any, i: number) => (
            <FlightRow key={i} f={f} heading={i === 0 ? <SectionTitle>Getting there</SectionTitle> : undefined} />
          ))}
        </View>
      ) : null}

      {data.stays?.length ? (
        <View>
          {data.stays.map((st: any, i: number) => (
            <StayGroup key={i} st={st} heading={i === 0 ? <SectionTitle>Where you stay</SectionTitle> : undefined} />
          ))}
        </View>
      ) : null}

      {data.costLines?.length ? (
        <View wrap={false}>
          <SectionTitle>What it costs</SectionTitle>
          {data.costLines.map((ln: any, i: number) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: 0.75, borderBottomColor: LINE, fontSize: 9.5 }}>
              <Text>{ln.label || ln.type}</Text>
              <Text>{inr(ln.sell)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 10 }}>
            <Text style={{ fontWeight: 600, fontSize: 14 }}>Trip total</Text>
            <Text style={{ fontWeight: 600, fontSize: 14 }}>{inr(data.grandTotal)}</Text>
          </View>
        </View>
      ) : null}
    </Page>
  );
}

// DaysPage — the screen's "Days" tab: one card per stay/home block of the
// real calendar, with the flight captions under the day they fall on.
function DaysPage({ data, hasVisa }: { data: any; hasVisa: boolean }) {
  const days = data.calendarDays || [];
  const blocks = data.calendarBlocks || [];
  const captions = data.calendarCaptions || {};
  return (
    <Page size="A4" style={s.page}>
      <TabRow active="Days" hasVisa={hasVisa} />
      <SectionTitle first>{days.length ? `${days.length} days, at a glance` : "Your days"}</SectionTitle>
      {blocks.map((b: any, i: number) => {
        const first = days[b.startIdx];
        const last = days[b.startIdx + b.span - 1];
        const when = first ? (b.span > 1 && last ? `${first.dow} ${first.dom} – ${last.dow} ${last.dom}` : `${first.dow} ${first.dom}`) : "";
        const notes = Array.from({ length: b.span }, (_, k) => captions[b.startIdx + k]).filter(Boolean);
        return (
          <View key={i} wrap={false} style={[s.panel, { marginBottom: 10, padding: 13 }]}>
            <Text style={s.eyebrow}>{b.span > 1 ? `Days ${b.startIdx + 1}–${b.startIdx + b.span}` : `Day ${b.startIdx + 1}`}</Text>
            <Text style={[s.dayHead, { marginTop: 3, fontSize: 11 }]}>{[when, b.isHome ? b.label : b.label.charAt(0) + b.label.slice(1).toLowerCase()].filter(Boolean).join(" · ")}</Text>
            {b.sub ? <Text style={s.dayBody}>{b.sub}</Text> : null}
            {notes.map((n: string, k: number) => (
              <Text key={k} style={s.dayBody}>{`Flight · ${n}`}</Text>
            ))}
          </View>
        );
      })}
      {hasVisa ? null : <Footnote />}
    </Page>
  );
}

// DecisionsPage — the screen's "Decisions" tab: only rendered when
// data.visa exists (same condition ProposalPreviewPage.tsx uses).
function DecisionsPage({ data, hasVisa }: { data: any; hasVisa: boolean }) {
  return (
    <Page size="A4" style={s.page}>
      <TabRow active="Decisions" hasVisa={hasVisa} />
      <SectionTitle first>Before money moves</SectionTitle>
      <View style={{ backgroundColor: IVORY, borderRadius: 7, padding: 13 }}>
        <Text style={{ fontWeight: 600, fontSize: 10, marginBottom: 3 }}>{data.visa?.title || "Visa"}</Text>
        <Text style={{ fontSize: 9.5, lineHeight: 1.55 }}>{data.visa?.decisionNote || data.visa?.sub}</Text>
        {data.visa?.submittedNote ? <Text style={[s.dayBody, { marginTop: 5 }]}>{data.visa.submittedNote}</Text> : null}
      </View>

      {data.visa?.passportNote ? (
        <View>
          <SectionTitle>Passports</SectionTitle>
          <Text style={{ fontSize: 9.5, lineHeight: 1.55 }}>{data.visa.passportNote}</Text>
        </View>
      ) : null}

      {data.concierge ? (
        <View wrap={false}>
          <SectionTitle>Your concierge</SectionTitle>
          <View style={[s.panel, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
            <View>
              <Text style={s.name}>{data.concierge.name}</Text>
              <Text style={[s.eyebrow, { marginTop: 3 }]}>24 hours</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              {data.concierge.phone ? <Text style={{ fontSize: 9.5 }}>{data.concierge.phone}</Text> : null}
              {data.concierge.email ? <Text style={[s.detail, { marginTop: 2 }]}>{data.concierge.email}</Text> : null}
            </View>
          </View>
        </View>
      ) : null}
      <Footnote />
    </Page>
  );
}

// Nominal page count — Plan, Days, +Decisions only when data.visa exists.
// Long proposals wrap onto more physical pages; viewers read the real count
// from the rendered PDF.
export function pageCountFor(data: any): number {
  return data?.visa ? 3 : 2;
}
export const PAGE_COUNT = 3; // kept for callers still importing the old static constant; prefer pageCountFor(data).

export function ProposalDocument({ data }: { data: any }) {
  const hasVisa = !!data.visa;
  return (
    <Document>
      <PlanPage data={data} hasVisa={hasVisa} />
      <DaysPage data={data} hasVisa={hasVisa} />
      {hasVisa ? <DecisionsPage data={data} hasVisa={hasVisa} /> : null}
    </Document>
  );
}
