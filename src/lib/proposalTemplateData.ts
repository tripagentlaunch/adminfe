/* =============================================================================
 * TripAgent — src/lib/proposalTemplateData.ts
 * Proposal PDF (2026-09-08, direct request, template = Switzerland-Iyer-
 * Itinerary.pdf) — maps the app's existing itinerary/pricing/advisor data
 * into the flat shape ProposalDocument.tsx renders. Deliberately the
 * mirror of cartFromItinerary(): a one-way adapter, no new persisted
 * state, so the PDF is always a live reflection of the itinerary as it
 * stands right now.
 *
 * Everything here is DERIVED, never invented — see the discussion this
 * session: hotel prose descriptions and a whole-itinerary "held until /
 * cancellable to" banner have no real data source anywhere in the app
 * and are intentionally left out rather than fabricated. Passport
 * validity and visa decision dates turned out to already exist as real
 * fields (visa.chips / visa.nextStep / visa.meta) — no model change
 * needed for those after all.
 * ===========================================================================*/

import type { HotelEnrichment } from "./useHotelWebsites";

// Stay-block tones (2026-09-08) — same dark-ink → olive → sage sequence
// the sample template cycles through for consecutive stays; a plain
// cream tile (no tone) marks a day with no active stay (departure/"Home").
const INK_TONE = "#171310";
const OLIVE_TONE = "#4B4636";
const SAGE_TONE = "#6B6350";

function fmtDayHeader(iso: string) {
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return { dow: "", dom: "" };
    return {
      dow: dt.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase(),
      dom: String(dt.getDate()),
    };
  } catch {
    return { dow: "", dom: "" };
  }
}

export function buildProposalTemplateData(itinerary: any, pricing: any, member: any, advisor: any, hotelEnrichment?: Record<string, HotelEnrichment>) {
  const data = itinerary || {};
  const days: any[] = data.days || [];

  function dayIsoLabel(iso: string) {
    try {
      const dt = new Date(iso);
      if (isNaN(dt.getTime())) return "";
      return dt.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase();
    } catch {
      return "";
    }
  }

  // Title is authored as "Hotel Name, City" throughout mock + search-added
  // items (see itineraryFromCart.ts) — the city after the last comma is
  // more reliable than parsing free-text `sub`, which doesn't always lead
  // with the city name.
  const cityFromTitle = (title: string) => (title || "").split(",").pop()?.trim() || "";

  // boardWord — "Breakfast included" → "breakfast", matching the
  // template's own plain lowercase style (also used by enrichedLabel()
  // below for the cost-breakdown page). Was only applied on the cost
  // page; the Stays page built its own un-cleaned version straight from
  // `detailRest`, so the two pages showed different text for the same
  // real field — fixed by sharing this one helper.
  const boardWord = (detailRest: string | undefined) => detailRest?.split("·")?.[2]?.trim().replace(/ included$/i, "").toLowerCase();

  // isVerifiedWebsite (2026-09-11 hotel-enrichment fix) — the single gate
  // BOTH hotelUrl() and the PDF's explicit "Visit official website" button
  // (ProposalDocument.tsx) must agree on: never claim a site is official
  // without backend verification. `status` comes back undefined until
  // supabase/migrations/20260911190000_hotel_enrichment.sql is applied —
  // treated as "trust a stored website" (the exact legacy behavior, from
  // before this status column existed) rather than downgrading every
  // already-set website to unverified the moment this code ships ahead of
  // that migration. Once `status` starts coming back for real, only a
  // literal "verified" counts — "pending"/"unavailable"/"failed"/null all
  // correctly withhold the official-website claim.
  const isVerifiedWebsite = (rec: HotelEnrichment | undefined) =>
    !!rec && !!rec.website && (rec.status === undefined || rec.status === null ? true : rec.status === "verified");

  // hotelUrl (2026-09-10, corrected 2026-09-11, real-website fallback added
  // 2026-09-11) — the URL this hotel's name/image link to in the PDF
  // (ProposalDocument.tsx's <Link>) and in-app preview (ProposalPreview.tsx's
  // overlay).
  //
  // Prefers the hotel's own real, official website — an advisor-entered
  // hotel_snapshots.website (see HotelDesk.tsx's HotelWebsiteEditor) passed
  // in via `hotelEnrichment`, keyed by hotelKey. Neither TripSure nor an
  // automated lookup (Google Places, ruled out as unreliable for
  // independent/regional properties) can supply this reliably, so it's
  // manual-only and not every hotel will have one yet.
  //
  // Falls back to our own public, unauthenticated /hotel/{hotelKey} page
  // for any hotel an advisor hasn't gotten to — that page now lives on
  // tripagent-site-main (the actual customer-facing site), NOT here — a
  // customer clicking a hotel link in their proposal must land on our
  // public site, not this internal admin tool's own origin.
  // TRIPAGENT-FE's own /hotel/[hotelKey] page (PublicHotelView.tsx) was the
  // wrong-place first build of this; this constant is the fix — previously
  // used window.location.origin (this admin panel's own URL, e.g.
  // localhost:3000), which is exactly the bug this replaces. Reads
  // NEXT_PUBLIC_SITE_BASE_URL for local dev (tripagent-site-main/app's own
  // Vite dev server, http://localhost:5173) and falls back to the real
  // production domain (confirmed live: CORS-allowlisted by name in
  // tripagent-site-main/backend/main.py) otherwise. null (no link) for any
  // stay with no real hotelKey (an AI-drafted/mock stay never searched
  // against TripSure) rather than linking to a page that 404s.
  const SITE_BASE_URL = process.env.NEXT_PUBLIC_SITE_BASE_URL || "https://tripagent-site-orpin.vercel.app";
  // FASTAPI_BASE (2026-09-15) — same fallback pattern api.ts's own private
  // FASTAPI_BASE constant uses, duplicated here (not imported — api.ts
  // isn't meant to be a general grab-bag of constants) so the image-proxy
  // URL below can be built without dragging in the whole services layer.
  const FASTAPI_BASE = process.env.NEXT_PUBLIC_FASTAPI_BASE || "http://127.0.0.1:8787";
  const hotelUrl = (hotelKey: string | undefined) => {
    if (!hotelKey) return null;
    const rec = hotelEnrichment && hotelEnrichment[hotelKey];
    if (isVerifiedWebsite(rec)) return rec!.website;
    return `${SITE_BASE_URL}/hotel/${encodeURIComponent(hotelKey)}`;
  };

  // officialWebsiteUrl (2026-09-11) — feeds ProposalDocument.tsx's
  // explicit, labeled "Visit official website" button (spec: a customer
  // shouldn't have to guess that a hotel's NAME happens to be a hyperlink).
  // Deliberately narrower than hotelUrl() above: null whenever hotelUrl()
  // would have fallen back to our OWN internal page, since that page is
  // real but isn't "the hotel's official website" — only a genuinely
  // verified real site earns that specific label.
  const officialWebsiteUrl = (hotelKey: string | undefined) => {
    if (!hotelKey) return null;
    const rec = hotelEnrichment && hotelEnrichment[hotelKey];
    return isVerifiedWebsite(rec) ? rec!.website : null;
  };

  // hotelMapsUrl (2026-09-11, corrected 2026-09-15) — a SECONDARY link
  // alongside hotelUrl above, to the actual property's real location, not
  // just our own snapshot page. TripSure has no public hotel website of
  // its own to link to (confirmed against its integration guide — a pure
  // server-to-server API), but it does return a real name/address/lat/lng
  // for a "searched" hotel (itinerary_service.py's _search_real_hotel/
  // _real_hotel_item, and the same fields threaded through the
  // Search-cart path — see mapTripSureHotel's own note).
  //
  // BUG (found 2026-09-15, real "Bombay Backpackers DXB Airport"
  // reproduction) — the original version below led with a bare
  // `query=<lat>,<lng>` whenever coordinates existed, on the reasoning
  // that a coordinate points at the exact building rather than a
  // name/city text guess. Confirmed live that's wrong: Google Maps' own
  // search-action URL renders a bare "lat,lng" query as an ANONYMOUS pin
  // (no name, no label — literally "25°04'44.4"N 55°08'08.0"E" and
  // nothing else), not a real result for the property at all — worse
  // than a text search, not better. A real hotel always has a real name
  // by the time it reaches this function (hotelKey is required below,
  // same as hotelUrl), so leading with name (+ address, falling back to
  // city) as the query TEXT instead is what actually produces a proper,
  // labeled Google Maps result for this specific place — real words,
  // never fabricated, same as before. Coordinates now only matter as the
  // last-resort fallback for the — practically unreachable — case where
  // even the name is somehow missing, and that fallback is now a real
  // Maps link too (was a plain web search before, an inconsistency
  // fixed in passing since it's the exact same "does this link actually
  // open a map" bug class).
  const hotelMapsUrl = (
    hotelKey: string | undefined,
    name: string,
    address: string | null | undefined,
    city: string,
    lat: number | null | undefined,
    lng: number | null | undefined
  ) => {
    if (!hotelKey) return null;
    const label = [name, address || city].filter(Boolean).join(", ");
    if (label) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
    if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    return null;
  };

  const stays = days
    .flatMap((day: any) => (day.items || []).filter((it: any) => it.type === "hotel").map((it: any) => ({ ...it, _dayIso: day._iso })))
    .map((it: any) => {
      const city = cityFromTitle(it.title);
      // Image preference order (spec section 3, superseded 2026-09-15 by
      // the Pexels-priority agreement fix below): (1) the backend's own
      // live decision for this hotelKey (enrichmentRec — the cached
      // hotel_snapshots image, or a preferred Pexels exterior when one's
      // available); (2) the supplier/TripSure image already on this
      // itinerary item — set at search time by itinerary_service.py's
      // _real_hotel_item or HotelDesk.tsx's mapTripSureHotel — used only
      // while enrichment hasn't resolved yet or found nothing; (3) none —
      // ProposalDocument.tsx's PhotoPlaceholder already covers that
      // honestly, no fabricated photo.
      const enrichmentRec = it.hotelKey && hotelEnrichment ? hotelEnrichment[it.hotelKey] : undefined;
      // imageSource (2026-09-15, agreement fix — direct request) — trusts
      // the BACKEND's own live decision (enrichmentRec.imageSource, from
      // useHotelWebsites.ts -> GET .../public/{hotelKey}, i.e.
      // hotel_router.py's get_hotel_public) as authoritative whenever it's
      // available, rather than assuming `it.image`'s mere presence means
      // "tripsure". get_hotel_public applies the SAME Pexels-exterior-
      // preferred priority the image proxy below independently re-applies
      // when actually fetching bytes (both call
      // pexels_service.get_city_stock_photo with the same city, same
      // 24h cache), so this is what actually keeps the Proposal PDF and
      // the public hotel page (PublicHotelView.tsx, same hotelKey) in
      // agreement on BOTH which photo is shown AND whether the
      // "Representative image" label is shown — previously this branch
      // only consulted enrichmentRec when `it.image` was falsy, so a
      // hotel with a captured `it.image` kept showing an unlabeled
      // "tripsure" caption here even once the backend started preferring
      // (and the image proxy started actually serving) a Pexels exterior
      // for that same hotelKey — a real mislabel, not just a missed
      // upgrade, since the photo bytes and the label disagreed on the
      // same page.
      //
      // Falls back to `it.image`-implies-"tripsure" only when enrichment
      // hasn't resolved yet (useHotelWebsites.ts's fetch is async; starts
      // as `{}`) or genuinely found nothing for this hotelKey (network
      // hiccup, or a hotel_snapshots row that predates that key) — best-
      // effort real-photo caption rather than a blank PhotoPlaceholder
      // for a hotel this item already knows has a real photo. null only
      // when there's truly no photo anywhere, the one case
      // PhotoPlaceholder still covers honestly.
      const imageSource: "tripsure" | "pexels" | null = (enrichmentRec && enrichmentRec.imageSource) || (it.image ? "tripsure" : null);
      return {
        city,
        name: it.title,
        roomAndBoard: [it.roomType, boardWord(it.detailRest)].filter(Boolean).join(" · "),
        dateRange: it.sub?.match(/In (.+?), out (.+)$/) ? it.sub.replace(/^.*In /, "").replace(", out", " – ") : "",
        price: it.price || 0,
        status: it.status,
        // Routed through OUR OWN backend (2026-09-15 fix, real "Bombay
        // Backpackers DXB Airport" reproduction), not TripSure's raw CDN
        // URL directly: the PDF embeds this image via a real fetch() for
        // its bytes, which is subject to CORS — and not every TripSure
        // image host sets Access-Control-Allow-Origin (confirmed live:
        // gommts3.mmtcdn.com silently fails this way; q-xx.bstatic.com and
        // i.travelapi.com don't). GET /hotels/public/{hotelKey}/image
        // re-fetches hotel_snapshots.image server-side, where CORS never
        // applies, and hands back the same real bytes regardless of which
        // upstream host TripSure used — see hotel_router.py's own note.
        // Still null (PhotoPlaceholder, never a broken image) when there's
        // genuinely no photo OR stock fallback available anywhere, or no
        // hotelKey to proxy by.
        image: imageSource && it.hotelKey ? `${FASTAPI_BASE}/hotels/public/${encodeURIComponent(it.hotelKey)}/image` : null,
        imageSource,
        url: hotelUrl(it.hotelKey),
        mapsUrl: hotelMapsUrl(it.hotelKey, it.title, it.address, city, it.lat, it.lng),
        officialWebsiteUrl: officialWebsiteUrl(it.hotelKey),
      };
    });

  // arrivalTime — the actual landing time at the FINAL segment's
  // destination, parsed from its own route string (e.g. "DXB T3 08:15 →
  // ZRH 12:25" → "12:25"). `it.time` on a flight item is its own
  // DEPARTURE time (real, already a plain field) — real for the
  // template's "13:40" return-departure caption, but "Arrive HH:MM" on
  // the first day needs the LANDING time instead, which only exists
  // buried in the last segment's route text.
  function lastSegmentArrival(segments: any[]): string | null {
    const last = (segments || []).filter((s: any) => s.route).pop();
    if (!last) return null;
    const arrivalHalf = String(last.route).split("→").pop() || "";
    const m = arrivalHalf.match(/(\d{1,2}:\d{2})/);
    return m ? m[1] : null;
  }

  // arrivalDateLabel — best-effort derived from real fields (departure
  // date + time + total duration), NOT a fabricated guess: adds the
  // flight's own real duration to its own real departure timestamp. Can
  // be a few hours off true local arrival time (layover/timezone effects
  // aren't modelled), but the DATE it lands on is what matters here, and
  // that's accurate for any flight under ~24h layover-inclusive duration
  // — true for every flight this app prices today.
  function addDurationDate(dayIso: string, timeStr: string, durationStr: string | undefined): string | null {
    const [h, m] = (timeStr || "").split(":").map(Number);
    if (isNaN(h)) return null;
    const dur = (durationStr || "").match(/(\d+)h(?:\s*(\d+)m)?/);
    if (!dur) return null;
    const dt = new Date(`${dayIso}T00:00:00`);
    dt.setHours(h, m || 0, 0, 0);
    dt.setMinutes(dt.getMinutes() + parseInt(dur[1], 10) * 60 + (dur[2] ? parseInt(dur[2], 10) : 0));
    return dt.toISOString().slice(0, 10);
  }

  const flights = days
    .flatMap((day: any) => (day.items || []).filter((it: any) => it.type === "flight").map((it: any) => ({ ...it, _dayIso: day._iso, _route: day.route })))
    .map((it: any) => {
      const [depCity, arrCity] = String(it._route || "").split(" → ").map((s: string) => s.trim());
      const arrivalIso = it.time ? addDurationDate(it._dayIso, it.time, it.duration) : null;
      return {
        date: dayIsoLabel(it._dayIso),
        _dayIso: it._dayIso,
        depTime: it.time,
        depCity,
        arrCity,
        // "Same day" only claimed when actually derivable; otherwise the
        // real arrival date, or nothing if we can't compute one (no
        // confirmed departure time yet — see `status` below).
        arrivalDate: arrivalIso ? (arrivalIso === it._dayIso ? "Same day" : dayIsoLabel(arrivalIso)) : null,
        arrivalTime: lastSegmentArrival(it.segments),
        duration: it.duration,
        cabin: it.cabin,
        segments: it.segments || [],
        title: it.title,
        // status/nextStep — real fields, not derived: a flight can be
        // genuinely not-yet-selected (see mockItinerary.ts's return leg:
        // `time: null`, `nextStep: "4 options"`) rather than booked with
        // real times. The page must show THAT honestly instead of
        // rendering blank time/flight-number fields, which just looked
        // broken.
        status: it.status,
        nextStep: it.nextStep,
      };
    });

  // calendar — a real, gapless run of calendar days from the itinerary's
  // committed bound (falls back to the first/last day actually present),
  // with STAYS resolved into spanning blocks (a hotel's nights cover
  // several consecutive columns, same as one continuous booking) rather
  // than one tile per day. This replaces an earlier, sparser version
  // that only listed days already present in `itinerary.days` — which
  // silently dropped any date that fell inside a multi-night stay but
  // had no item of its own recorded that day (there's often only ONE
  // item, on the check-in day, for a 3-night stay).
  function parseNights(duration: string | undefined): number {
    const m = (duration || "").match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  }
  function addDaysIso(iso: string, n: number) {
    const d = new Date(iso);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  const hotelStays = days
    .flatMap((day: any) => (day.items || []).filter((it: any) => it.type === "hotel").map((it: any) => ({ ...it, _dayIso: day._iso })))
    .filter((it: any) => it._dayIso)
    .map((it: any) => ({
      checkIn: it._dayIso,
      checkOut: addDaysIso(it._dayIso, parseNights(it.duration)),
      city: cityFromTitle(it.title),
      name: it.title,
      nights: parseNights(it.duration),
    }));

  const rangeStart = data.startIso || days.map((d: any) => d._iso).filter(Boolean).sort()[0];
  // rangeEnd is INCLUSIVE — the trip's departure/"Home" day itself, same
  // as itinerary.endIso (see itineraryFromCart.ts's boundFromDateRange)
  // or, absent that, the day right after the last stay's last night.
  const rangeEnd =
    data.endIso ||
    hotelStays.map((s: any) => s.checkOut).sort().pop() ||
    days.map((d: any) => d._iso).filter(Boolean).sort().pop();

  const calendarDays: { iso: string; dow: string; dom: string }[] = [];
  if (rangeStart && rangeEnd) {
    let cursor = rangeStart;
    while (cursor <= rangeEnd) {
      calendarDays.push({ iso: cursor, ...fmtDayHeader(cursor) });
      cursor = addDaysIso(cursor, 1);
    }
  }

  const STAY_TONES = [INK_TONE, OLIVE_TONE, SAGE_TONE];
  const calendarBlocks: { startIdx: number; span: number; label: string; sub: string; tone: string; isHome?: boolean }[] = [];
  {
    let i = 0;
    let staySeq = 0;
    while (i < calendarDays.length) {
      const iso = calendarDays[i].iso;
      const stay = hotelStays.find((s: any) => iso >= s.checkIn && iso < s.checkOut);
      if (stay) {
        let span = 0;
        while (i + span < calendarDays.length && calendarDays[i + span].iso >= stay.checkIn && calendarDays[i + span].iso < stay.checkOut) span++;
        calendarBlocks.push({ startIdx: i, span, label: stay.city.toUpperCase(), sub: `${stay.name.split(",")[0]} · ${stay.nights} night${stay.nights === 1 ? "" : "s"}`, tone: STAY_TONES[staySeq % STAY_TONES.length] });
        staySeq++;
        i += span;
      } else {
        calendarBlocks.push({ startIdx: i, span: 1, label: "Home", sub: "", tone: "", isHome: true });
        i++;
      }
    }
  }

  // Real arrival/departure captions only — no invented mid-trip transit
  // text (the sample's "Funicular from lakeshore" style captions are
  // curated narrative with no source in this data model).
  const firstFlight = flights[0];
  const lastFlight = flights[flights.length - 1];
  const calendarCaptions: Record<number, string> = {};
  if (firstFlight?.arrivalTime) {
    const idx = calendarDays.findIndex((d) => d.iso === firstFlight._dayIso);
    if (idx >= 0) calendarCaptions[idx] = `Arrive ${firstFlight.arrivalTime}`;
  }
  if (lastFlight && lastFlight !== firstFlight && lastFlight.depTime) {
    const idx = calendarDays.findIndex((d) => d.iso === lastFlight._dayIso);
    if (idx >= 0) calendarCaptions[idx] = lastFlight.depTime;
  }

  // Enriched cost-line labels (2026-09-08, direct feedback) — the real
  // pricing.lines response only carries a generic label/type per line
  // (see QuoteBuilder.tsx's own `ln.label || ln.type` fallback); the
  // template wants each line to read like "Widder Hotel · two nights,
  // breakfast", which only the itinerary's OWN item details have. Prices
  // stay 100% real (ln.sell, the actual quoted amount) — only the label
  // text is rebuilt from the itinerary.
  //
  // Matching lines back to items BY ARRAY POSITION (an earlier version
  // of this) assumed pricing.lines comes back in the exact same order as
  // the cart cartFromItinerary() built — real for an ordering the
  // backend happens to preserve today, but not a contract this code can
  // rely on (it could group by type, add non-item lines, etc., silently
  // pairing the wrong label with the wrong price). Matching by TYPE via
  // a per-type queue is safe under a much weaker assumption — that
  // same-type lines stay in their own relative order — and degrades to
  // the API's own generic label if a type has more lines than real items
  // (defensive only; should not happen for a cart this function itself
  // produced).
  const itemQueuesByType: Record<string, any[]> = {};
  for (const day of days) {
    for (const it of day.items || []) {
      (itemQueuesByType[it.type] ||= []).push({ ...it, _route: day.route });
    }
  }
  if (data.visa) (itemQueuesByType["visa"] ||= []).push({ type: "visa", ...data.visa });

  const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const numberWord = (n: number) => (n >= 0 && n <= 10 ? NUMBER_WORDS[n] : String(n));

  function enrichedLabel(item: any, fallback: string): string {
    if (!item) return fallback;
    if (item.type === "flight") {
      const airline = (item.title || "").split(" · ")[0];
      const cabin = item.cabin ? item.cabin.toLowerCase() : "";
      return [airline, cabin].filter(Boolean).join(" ") + (item._route ? `, ${item._route}` : "");
    }
    if (item.type === "hotel") {
      const hotelName = (item.title || "").split(",")[0];
      const nights = parseNights(item.duration);
      const board = boardWord(item.detailRest);
      return `${hotelName} · ${numberWord(nights)} night${nights === 1 ? "" : "s"}${board ? `, ${board}` : ""}`;
    }
    if (item.type === "visa") {
      const applicants = data.pax || 1;
      return `${item.title || "Visa"} · ${numberWord(applicants)} applicant${applicants === 1 ? "" : "s"}`;
    }
    return fallback;
  }

  // Fallback when the live pricing call has nothing (2026-09-08, direct
  // feedback) — a real, non-mock condition: the real price() call fails
  // for any itinerary whose member is a mock/test record (not a real
  // DB row — see the "Failed to create quote: invalid input syntax for
  // type uuid" error confirmed earlier this session), so `pricing` stays
  // null for those, and the section must not just come up blank. Falls
  // back to the itinerary's OWN real per-item prices (the same values
  // already summed into itinerary.totals.grand by
  // addCartItemToItinerary) — still 100% real data, just not the live
  // quoted (GST/markup-adjusted) sell price. Every itinerary in this app
  // has these regardless of whether pricing ever resolves, so this
  // never comes up empty for a real entry.
  function fallbackLinesFromItinerary() {
    const order = ["flight", "hotel", "visa"];
    const lines: { label: string; sell: number }[] = [];
    for (const type of order) {
      for (const item of itemQueuesByType[type] || []) {
        lines.push({ label: enrichedLabel(item, item.title || type), sell: item.price || 0 });
      }
    }
    return lines;
  }

  const enrichedCostLines = pricing?.lines?.length
    ? pricing.lines.map((ln: any) => {
        const lnType = String(ln.type || "").toLowerCase();
        return { ...ln, label: enrichedLabel((itemQueuesByType[lnType] || []).shift(), ln.label || ln.type) };
      })
    : fallbackLinesFromItinerary();

  const computedTotal = enrichedCostLines.reduce((sum: number, ln: any) => sum + (ln.sell || 0), 0);

  // Passport validity — derived from a real visa chip (e.g. "Passports
  // valid 2031"), not invented. Omitted entirely if no such chip exists.
  const visa = data.visa;
  const passportChip = (visa?.chips || []).map((c: any) => (typeof c === "string" ? c : c.label)).find((label: string) => /valid/i.test(label || ""));

  return {
    destination: data.destination,
    cities: data.cities || [],
    dateRange: data.dateRange,
    nights: data.nights,
    pax: data.pax || 1,
    memberName: member?.name || "",
    // pricing.grandTotal when the live quote resolved; otherwise the sum
    // of the SAME fallback lines actually shown above, not a separate
    // number — keeps the displayed TOTAL always consistent with what's
    // itemized above it.
    grandTotal: pricing?.grandTotal ?? computedTotal,
    calendarDays,
    calendarBlocks,
    calendarCaptions,
    costLines: enrichedCostLines,
    stays,
    flights,
    visa: visa
      ? {
          title: visa.title,
          sub: visa.sub,
          submittedNote: visa.meta,
          decisionNote: visa.nextStep,
          passportNote: passportChip,
        }
      : null,
    concierge: advisor
      ? {
          name: advisor.name || advisor.full_name,
          phone: advisor.phone,
          email: advisor.email,
        }
      : null,
  };
}
