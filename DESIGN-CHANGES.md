# Design change log

A running log of design/UI changes made in this repo, kept in a format meant
to be handed straight to the backend developer — each entry says plainly
what's real (already wired to Supabase/FastAPI) vs. what still needs their
attention, so nothing has to be reverse-engineered from the diff.

New entries go at the **top**. Use this template:

```md
## YYYY-MM-DD — Short title

**What changed:** one or two sentences, plain language.
**Files touched:** path list.
**Data/API status:**
- Real (already wired): ...
- Needs backend attention: ... — what's missing/expected, or "none"
**Env vars added/changed:** ... or "none"
**Backend action needed:** explicit ask, or "None — uses existing endpoints/no backend dependency"
```

---

## 2026-09-09 — New "Pipeline" tab: every enquiry's real stage, one action per row

**What changed:** direct request — a new tab beside Console and Proposal Composer that tracks every enquiry across its real lifecycle stage (New / Building Itinerary / Sent to Proposal / Accepted / Revision Requested / Rejected). "Stage" has no backend concept at all (confirmed via BACKEND-HANDOFF.md) — it's derived entirely from state this app already has: `itinerariesByEnquiry[id]` existing, `proposalQueue` membership, and a proposal's `outcome` field. Built as a real sortable/filterable table (stage tag, name, destination, pax, updated, action), not a kanban board, since every transition already happens elsewhere via a real action.

Each row gets exactly one action button, using only navigation that already existed: New/Building → "Start/Continue itinerary" into Console (which auto-resumes chooser vs. builder on its own off `itinerariesByEnquiry`); Sent/Rejected → "Open proposal" into Proposal Composer; Accepted → "Review & book" into Proposal Composer, where QuoteBuilder's real (already-wired) "Create Order" action lives; Revision Requested → "Revise itinerary" back into Console. A per-row outcome Dropdown existed briefly during iteration but was removed — outcome isn't advisor-set, so a single navigation button is the row's only control.

Also seeded representative demo data across all 6 stages in code (`mockEnquiries.ts` + a seed effect in `WorkbenchDataProvider.tsx`), including giving every seeded `proposalQueue` entry a matching `itinerariesByEnquiry` entry — a sent proposal always has a real itinerary behind it, so without this "Revise itinerary" landed on the empty AI/scratch chooser instead of resuming the actual itinerary.

Two real bugs fixed along the way: (1) row-click routed off `proposalEntry` presence, not the row's actual stage, so Revision Requested rows silently opened Proposal Composer instead of Console; (2) two CSS specificity ties against shared `.taw-recon-table` rules silently lost regardless of source order (row hover color, header font size) — fixed by scoping through `.taw-pipeline-tablewrap`. The table header is also a genuinely separate fixed row above SleekScroll's own scroll area (not a sticky row scrolled past inside it), so the custom scrollbar's travel only ever spans the row list, never the header.

**Files touched:** `src/app/(authenticated)/console/pipeline/page.tsx` (new), `src/app/(authenticated)/console/layout.tsx`, `src/components/WorkbenchDataProvider.tsx`, `src/lib/workbenchContext.tsx`, `src/lib/mockEnquiries.ts`, `src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): stage is derived from real session state every other tab reads/writes — clicking any row shows the same data in Console/Proposal Composer, not a display-only overlay.
- Needs backend attention: there's still no real channel for a client's response to a sent proposal to arrive automatically — `outcome` only changes via this session's seed data for now. See BACKEND-HANDOFF.md.
**Env vars added/changed:** none.
**Backend action needed:** None new — same enquiry-lifecycle gap already tracked in BACKEND-HANDOFF.md.

---

## 2026-09-08 — Proposal PDF builder: cover page, react-pdf pipeline, live pricing shared with Quote Builder

**What changed:** direct request, template = a sample PDF the user supplied (`Switzerland-Iyer-Itinerary.pdf`) — Proposal Composer's right column is now a real PDF builder instead of the "not yet built" placeholder: a live `<PDFViewer>` preview plus "Web link" (stubbed — explicitly out of scope, but enabled and explains itself via `toast()` rather than sitting disabled) and "Export PDF" (real — downloads an actual file via `@react-pdf/renderer`'s `pdf().toBlob()`). Only the cover page is built so far (title, date range, cities, contour-art motif, traveller name, nights/stays count, grand total); the remaining 3 pages (day grid + cost breakdown, stays, flights/visa/concierge) are next.

**Architecture decision:** `@react-pdf/renderer` over plain print-CSS or a hosted doc-generation service — its `<PDFViewer>` renders the exact same component tree used for export, so the in-panel preview and the downloaded file can never drift apart, and it needs no server/headless-browser piece. Fonts (Fraunces serif + Inter sans — the closest open match to the sample's typography, per direct confirmation to match exactly rather than approximate with the app's own IBM Plex) are downloaded once into `public/fonts/` and registered via `Font.register`; colors reuse the app's existing `tokens.css` values (`--ink`/`--ivory`/`--gold`/`--muted`) since they already read close to the sample's palette.

**Data policy — derive or honestly omit, never fabricate:** every field is pulled from real itinerary/pricing/advisor data (`proposalTemplateData.ts`'s `buildProposalTemplateData()`, the mirror of `cartFromItinerary()`). Two sample-PDF fields have no real source anywhere in the app and are intentionally left out rather than invented: hotel prose descriptions (curated marketing copy) and a whole-itinerary "held until / cancellable to" banner (no hold-deadline concept exists on itineraries or quotes). Passport validity and visa decision dates turned out to need no model change at all — they already exist as real fields (`visa.chips` / `visa.nextStep` / `visa.meta`); the mock Switzerland itinerary is in fact the same scenario as the sample PDF almost verbatim.

**Pricing now has one source of truth.** Extracted Quote Builder's price-fetching effect into `useQuotePricing()` (`src/lib/useQuotePricing.ts`); Proposal Composer's page now owns the one real `price()` call and passes `pricing`/`quoteId`/`loading`/`err`/`inclusive` down as **controlled props** to `QuoteBuilder` (previously all internal state). This was necessary, not cosmetic — the PDF's cost breakdown must reflect the exact same live quote Quote Builder displays, not a second independent call that could race or price against a different `inclusive` setting.

**Two real bugs caught during my own build-verification, both fixed:**
1. The contour-art decorative motif rendered blue instead of gold — react-pdf's SVG stroke doesn't parse `rgba()`; switched to a plain hex `stroke` + numeric `strokeOpacity`.
2. The same art painted over the title text — react-pdf paints in document order regardless of `position: absolute` (unlike a browser's stacking contexts), so the art `View` had to move to be the *first* child, not wherever it sat positionally.

**Follow-up polish (direct requests):** action buttons reordered (Web link, then Export PDF) and right-aligned; Export restyled to match the Search Flights button (`taw-btn--brown`), Web link restyled to the gold `taw-btn--primary` Export previously used; added a real `download` icon to `Icon.tsx` (didn't exist before); both buttons unified to `8px 12px` padding and `14px` text/icon sizing so they render the same height.

**Files touched:** `src/lib/proposalFonts.ts` (new), `src/lib/useQuotePricing.ts` (new), `src/lib/proposalTemplateData.ts` (new), `src/components/proposal/ContourArt.tsx` (new), `src/components/proposal/ProposalDocument.tsx` (new), `src/components/panels/QuoteBuilder.tsx` (refactored to controlled pricing props), `src/components/ui/Icon.tsx` (added `download`), `src/app/(authenticated)/console/proposal-composer/page.tsx`, `src/styles/advisor-workbench.css`, `public/fonts/*.ttf` (new, downloaded from Google Fonts).
**Data/API status:**
- Real (already wired): the PDF's cost breakdown reads the same live `price()` → `quote-price` response Quote Builder shows; every other field is read from real itinerary/visa/advisor state, no mock-only fields introduced.
- Needs backend attention: none — no new endpoint or schema required. (If the business later wants a real "held until / cancellable to" deadline or curated per-hotel description copy, that's a real product/data decision for later, not a wiring gap.)
**Env vars added/changed:** none.
**Backend action needed:** None — uses existing endpoints/no backend dependency.

---

## 2026-09-04 — Real Quote Builder wired into Proposal Composer, accordion-paired with Queue

**What changed:** direct request — "Quote Builder can be below Queue, EXACTLY LIKE how traveller profile was below Queue in Console." Rebuilt Proposal Composer's left column as a real two-section accordion (Queue / Quote Builder), structurally identical to `QueueProfileAccordion.tsx`'s Queue/Traveller Profile pair: same `.taw-acc-stack`/`.taw-acc`/`.taw-acc-h`/`.taw-acc-toggle`/`.taw-acc-body` classes, same mutual-exclusion toggle (only one section open at a time, either's chevron flips to the other), same auto-collapse-into-the-other-section on selection (there: picking an enquiry opens Traveller Profile; here: picking a queue entry opens Quote Builder via a new `selectAndOpenQuote()`).

Bigger finding underneath this: **`QuoteBuilder.tsx` was never actually unfinished** — it's a complete component already wired to the real pricing engine (`price(cart)` → the real `quote-price` edge function, returning a real `quote_id`) and real order creation (`createOrder()` → `order-create`), matching the "Search Desks → Itinerary Cart → Quote Builder" flow confirmed live on the reference site (tripagent-admin.vercel.app). It was only *unreachable* — no route rendered it (see BACKEND-HANDOFF.md's dead-code note on it and `CartPanel.tsx`). This was a wiring gap, not a build-from-scratch one.

Two things made the wiring non-trivial:
1. **Shape mismatch.** `QuoteBuilder` expects a flat `cart: [{type, baseNet, international, ...}]` array from the old Search→Cart flow; Console's itinerary is a different, day-bucketed shape (`price` not `baseNet`, no `international` flag). Added `cartFromItinerary(data)` to `itineraryFromCart.ts` — the mirror of the existing `addCartItemToItinerary()` — to flatten a sent itinerary's items + visa back into the cart shape. Also started carrying `international` through onto itinerary items at Search-add time (previously dropped), since GST/TCS math depends on it; AI-mock items predate the flag and default to `false` — honest, not a new gap.
2. **Double chrome.** `QuoteBuilder` always rendered its own `<Card title="Quote Builder">` wrapper — redundant once mounted inside an accordion section that already provides that header. Added a `bare` prop (mirrors how `Member360` has no `Card` of its own inside `QueueProfileAccordion`) that returns just the content; every other call site (none currently reachable) is unaffected since it simply doesn't pass the prop.

Also fixed a real bug caught by first-pass testing: Quote Builder's body wasn't actually gated behind the section being "open" — it rendered its full content (including firing a real pricing API call) regardless of which accordion section was expanded, so both Queue and Quote Builder showed full content simultaneously. Fixed to mirror `showProfilePlaceholder`'s exact logic: show a placeholder unless this section is both open AND an entry is selected.

Verified live end-to-end: sent Kabir Shah's AI itinerary to Proposal → landed with Queue open, Quote Builder correctly collapsed to "Expand this section to price the selected itinerary" (not full content) → clicked the queue row → Queue auto-collapsed to its header, Quote Builder expanded and fired a **real** pricing call, surfacing a real, honest backend error (`Failed to create quote: invalid input syntax for type uuid: "mock-mem-3"`) — proof the wiring hits the actual endpoint rather than any mock, failing exactly where expected since mock members aren't real DB rows. Confirmed the chevron toggle flips both directions correctly.

**Files touched:** `src/app/(authenticated)/console/proposal-composer/page.tsx`, `src/components/panels/QuoteBuilder.tsx`, `src/lib/itineraryFromCart.ts`.
**Data/API status:**
- Real (already wired): `price(cart)` → `quote-price` edge function (real pricing engine); `createOrder()` → `order-create` (real order creation) — both were already real in `QuoteBuilder.tsx`, just newly reachable.
- Needs backend attention: pricing a mock enquiry's itinerary will always fail with the UUID error above until the itinerary is tied to a real member row — expected, not a frontend bug. See BACKEND-HANDOFF.md Tier 1 items (real enquiry data, real itinerary model) for the actual fix.
**Env vars added/changed:** none.
**Backend action needed:** None new — confirms the existing `quote-price`/`order-create` endpoints are live and reachable; the remaining gap is data (real members/itineraries), already tracked in BACKEND-HANDOFF.md.

---

## 2026-09-04 — Proposal Composer's Queue: collapse toggle, breach coloring, flush edges, height cap

**What changed:** three follow-up fixes to the previous entry below, caught by a direct side-by-side comparison against Console's real Queue ("theyre clearly different" / "should not take up more height than the height of the screen" / "theres also left right padding … whereas Console's queue does not have it"):

1. **Missing collapse/expand toggle.** Console's Queue is a collapsible accordion section — a chevron button at the header's right edge (`.taw-acc-toggle`, from `QueueProfileAccordion.tsx`). The Card here had no such control. Added the identical toggle via `Card`'s `actions` slot, with local `open` state (defaults true) collapsing the row list.
2. **Hours badge never showed the red "breach" color.** The earlier reasoning ("no SLA to breach") was technically defensible but produced a real, visible inconsistency: every mock enquiry in Console happens to be well past any reasonable threshold, so Console's queue reads as uniformly red, while this one read as uniformly gray. Now applies the same `.is-breach` class once a proposal has sat 24h+ unactioned — same underlying idea (something that's sat too long deserves the same red flag), not a fabricated identical SLA.
3. **Left/right padding where Console's queue is edge-to-edge.** Console's Queue body is the Card's `flush` (zero-padding) variant — row padding lives on `.taw-enq-item` itself, not the container, so hover/selected fill and the custom scrollbar both reach the true edges. This Card was missing `flush`. Added it — `Empty`'s own built-in padding (`.taw-empty{padding:16px 12px}`) keeps the empty state looking correct regardless.
4. **The Queue card had no height ceiling at all** — with enough entries it would just grow past the viewport and the WHOLE PAGE would scroll, instead of the row list's own internal scrollbar taking over. Root cause: `.taw-cols-2` (this page's grid) never got the `flex:1;min-height:0` treatment `.taw-cols-3` (Console's own grid) already has — traced directly by comparing the two grid classes. Added the identical rule (plus `.taw-cols-2>*{min-height:0}` on the grid items, same reason `.taw-cols-3>*` needs it) — this also benefits `taw-cols-2`'s two other call sites (`TrendingDealsPanel.tsx`, `CommsTemplatePreview.tsx`), not just this page.

Verified live: confirmed via direct DOM inspection that `.taw-cols-2` computes `flex:"1 1 0%"`/`min-height:"0px"`, the Queue card's body computes `padding:"0px"` with class `flush`, and `document.documentElement.scrollHeight` no longer exceeds `clientHeight` (the page itself is not scrollable) — screenshotted both the populated (1 entry, chevron visible, flush rows) and empty states, both correctly filling the row's full height instead of shrinking to content.

**Files touched:** `src/app/(authenticated)/console/proposal-composer/page.tsx`, `src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): none — presentation-only change.
- Needs backend attention: none.
**Env vars added/changed:** none.
**Backend action needed:** None — uses existing endpoints/no backend dependency.

---

## 2026-09-04 — Proposal Composer's Queue now matches Console's Queue row-for-row

**What changed:** direct request — "the Queue in proposal composer should be EXACTLY like the queue in Console, only the entries differ." Previously it reused only three of Console's `EnquiryInbox` classes (`.taw-enq-item/-top/-name/-meta/-depart`) and was missing the rest of the pattern: no `SleekScroll` wrapper (so it'd double-scroll with the card body once the list overflowed instead of Console's custom-scrollbar-only behavior), no pax count next to the name, and no top-right hours badge. Added all three, plus the inbox icon on the Card header to match Console's Queue header. The one deliberate difference: the hours badge shows plain elapsed time since sent, never in Console's SLA-breach red state — a sent proposal has no SLA to breach, so that state genuinely doesn't apply, but the badge's position/style/format ("Nh") is identical.

Also gave the Queue card the same `min-height:0` flex-chain fix already applied to the Search and Itinerary Builder cards this session, so only the row list scrolls internally — not the whole card — matching how Console's Queue (inside its accordion box) already behaves.

Verified live: generated Priya Kapoor's AI itinerary and sent it to Proposal — the Queue row reads "Priya Kapoor · 1 pax" with a "0h" badge top-right, "Switzerland · 12 – 20 Oct" meta line, "Sent just now" tertiary line — pixel-identical layout/spacing to Console's own Queue row for the same enquiry, side-by-side screenshot comparison confirmed.

**Files touched:** `src/app/(authenticated)/console/proposal-composer/page.tsx`, `src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): none — presentation-only change.
- Needs backend attention: none.
**Env vars added/changed:** none.
**Backend action needed:** None — uses existing endpoints/no backend dependency.

---

## 2026-09-04 — Attention banner collapsible; only the day list scrolls, not the whole Itinerary Builder

**What changed:** Two related fixes to the Itinerary Builder's layout, direct request:

1. **"N items need attention" banner is now collapsible.** Its header is
   a real `<button>` now (was a bare div) with a chevron that rotates on
   toggle; clicking it shows/hides the alert list below. Defaults open
   so nothing changes for anyone who's never touched it.
2. **Only the day/visa list scrolls — not the whole card.** Previously
   the Itinerary Builder's entire body (summary, alerts, tabs, AND the
   day list) scrolled together as one region once content overflowed,
   so scrolling to see more days also scrolled the summary/totals out of
   view. Wrapped just `.taw-itin-days` in the same `SleekScroll`
   component already used for Search results, and gave the Itinerary
   Builder card the same `min-height:0` flex-chain treatment the Search
   card already has (`.taw-itin-card .taw-card-b` → `.taw-itin` →
   `.taw-itin-days-scroll`) — so the summary/alerts/tabs size to their
   own content and stay fixed, and only the actually-overflowing day
   list gets a scrollbar (the app's own custom sleek-scroll thumb, not
   the browser's native one).

Verified live on Arjun Mehta's AI itinerary: clicking the attention
banner's header collapses the alert list to just the header row (day
list below reflows to fill the freed space); confirmed via direct DOM
inspection that `.taw-itin-days-scroll`'s inner content has
`scrollHeight` (648px) exceeding its `clientHeight` (299px) with
`overflow-y: auto`, and that scrolling it to `scrollTop: 300` leaves the
summary header's own position on screen completely unchanged (before/after
`getBoundingClientRect().top` identical, page `scrollY` stays 0) —
confirmed visually too, scrolling down to Day 2 while the summary/totals/
tabs stay put above it.

**Files touched:** `src/components/panels/ItineraryView.tsx`,
`src/components/panels/WorkbenchTab.tsx`, `src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): none — presentation-only change.
- Needs backend attention: none.
**Env vars added/changed:** none.
**Backend action needed:** None — uses existing endpoints/no backend dependency.

---

## 2026-09-04 — Items outside the itinerary's committed date range get their own flagged section

**What changed:** Search's "Add" (and a manual day-date edit) could
silently place a day before or after the itinerary's own agreed date
range — e.g. a hotel dated 25 Sept quietly joining the day list of an
18–22 Nov trip as if it always belonged. New rule, direct request:

- Every itinerary now carries its own committed date bound
  (`startIso`/`endIso`), seeded at creation time — for "Generate AI
  Itinerary" it's the mock data's own day span; for "Start from scratch"
  (or Search's "Add" auto-seeding a blank itinerary before the AI/scratch
  chooser was ever used) it's parsed from the enquiry's own
  `ask.dateRange` (best-effort "D – D Mon" parse, same mock-data-scope
  caveat as this session's other date/city lookups — see
  `boundFromDateRange`'s own docblock).
- A day landing outside that bound renders in its own section: the real
  date as its label (not "Day N"), an amber "Outside itinerary dates"
  pill, a left-edge accent matching the item-level attention color, and
  auto-opens (same as any other attention condition) to a prompt
  explaining why, with an "Include as Day #" control (pre-filled with the
  only chronologically-correct slot — 1 if it's before the bound, one
  past the last in-bound day if after; the advisor can still edit the
  number, though the day's actual position in the list always stays
  chronological — see the control's own docblock on why a real override
  isn't safe here).
- Confirming "Include in itinerary" extends the bound (and recomputes the
  header's `dateRange`/`nights`) to cover it — it's genuinely part of the
  trip now, not an exception — and the day picks up its real "Day N"
  label and normal styling on the next render, with every other day
  renumbering to match automatically (day order was always driven by
  `_iso` via `resortDays`; extending the bound is the only state change
  needed for the renumbering to fall out correctly).

Verified live: started Priya Kapoor's itinerary from scratch (header
correctly read "18 – 22 Nov · 4 nights", seeded from her enquiry's ask,
with no days yet) → searched Goa hotels (defaults to a 25 Sept check-in,
outside that range) → Add → the day rendered as "Fri, 25 Sept" with the
"Outside itinerary dates" pill and the explanatory prompt, pre-filled
"Include as Day 1" → clicked Include → header updated to "25 Sept – 22
Nov · 58 nights", the day became "Day 1 · Fri, 25 Sept" with normal
styling, and a confirmation toast appeared.

**Files touched:** `src/lib/itineraryFromCart.ts`,
`src/components/WorkbenchDataProvider.tsx`, `src/lib/workbenchContext.tsx`,
`src/components/panels/WorkbenchTab.tsx`,
`src/components/panels/ItineraryView.tsx`, `src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): none — local-state feature, no backend dependency.
- Needs backend attention: none.
**Env vars added/changed:** none.
**Backend action needed:** None — uses existing endpoints/no backend dependency.

---

## 2026-09-04 — Divider spacing: reverted tabs→list gap, increased day-content→divider gap

**What changed:** Two follow-up spacing corrections to the same divider-based day list from earlier today:

1. **Reverted** the `margin-top:12px` just added on `.taw-itin-days` (the
   gap between the All/Flights/Hotels/Visa tabs and the day/visa list
   below) — direct follow-up feedback that this read as unwanted extra
   space, so it's back to relying solely on `.taw-itin`'s existing 10px
   gap between sections.
2. **Increased** the gap between each day's own content and the divider
   lines separating it from its neighbors — the opposite end of the
   spacing, inside each day rather than above the whole list. A collapsed
   day IS just its header row, so `.taw-itin-day-h`'s vertical padding
   directly controls its gap to the dividers above/below it (10px→16px);
   an expanded day's bottom gap to the next divider is controlled by its
   last item's `.taw-itin-item-detail` bottom padding (12px→20px, same
   for the visa block's `.taw-itin-visa-detail` override).

Verified live on Priya Kapoor's AI itinerary: collapsed Day 1 now sits
with clear breathing room between the dividers above and below it, and
Day 9's expanded content (return-flight item + Remove button) has real
space before the panel's own edge; confirmed the tabs→list gap is back
to its original tight spacing.

**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): none — presentation-only change.
- Needs backend attention: none.
**Env vars added/changed:** none.
**Backend action needed:** None — uses existing endpoints/no backend dependency.

---

## 2026-09-04 — Editing a day's date now really moves it (was cosmetic-only), plus two styling tweaks

**What changed:** Three related fixes/tweaks, the first a real correctness bug surfaced by a direct question ("if it's date-driven, the date should be modifiable, right?"):

1. **Day-date edit now actually re-buckets the day.** Day-bucketing (both
   Search's "Add" and the alert jump-list) matches by a day's real `_iso`
   field, not its displayed `date` string — but the day header's
   click-to-edit date field only ever patched the display string,
   leaving `_iso` untouched. An advisor correcting a day's date silently
   left it sorted and matched by the OLD date underneath the new label —
   a real, undetectable-until-you-look-for-it inconsistency. Fixed by:
   switching that one field from free text to a real `<input type="date">`
   (day-bucketing shouldn't accept arbitrary unparseable text), and
   wiring its commit to a new `updateDayDate()` that updates `_iso`
   AND `date` together, then re-sorts/relabels every day exactly the
   way a Search-added day already does. Extracted that resort+relabel
   logic into a shared `resortDays()` in `itineraryFromCart.ts` (was
   inlined in `findOrCreateDay`) so both paths use the identical rule
   instead of two copies that could drift. `EditableText` gained an
   optional `editValue`/`type` prop pair for this (the day date is the
   only field where the displayed text and the value being edited are
   different strings) — every other use (room type, cabin) is unaffected.
2. **Day totals bigger, item prices lighter.** `.taw-itin-day-total`
   12.5px→15px (still 600 weight); `.taw-itin-item-price` stays 12.5px
   but drops to 500 weight — so a day's own total reads as the more
   prominent number against the items under it, at a glance.
3. **More space between the category tabs and the day/visa list.** Added
   `margin-top:12px` on `.taw-itin-days`, on top of `.taw-itin`'s shared
   10px gap, so the All/Flights/Hotels/Visa tabs read as clearly separate
   from the list they filter.

Verified live: edited Arjun Mehta's Day 1 (12 Oct, Mumbai → Zurich flight)
to 18 Oct via the new native date picker — the day correctly moved to
Day 3 (between the 17 Oct Lucerne day and the 20 Oct return-flight day)
and every day relabeled Day 1–4 in the right order; confirmed the day
total now visibly outsizes the item price below it, and the extra gap
under the tabs, in the same screenshot.

**Files touched:** `src/components/panels/ItineraryView.tsx`,
`src/lib/itineraryFromCart.ts`, `src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): none — presentation + local-state correctness fix.
- Needs backend attention: none.
**Env vars added/changed:** none.
**Backend action needed:** None — uses existing endpoints/no backend dependency.

---

## 2026-09-04 — Hotels' search results scroll internally, matching Flights

**What changed:** Flights' result list scrolls inside a fixed-height
region via the shared `SleekScroll` component (custom thumb, native
scrollbar hidden) — the Search card grows to fill the column's full
height while results are showing (reported via `onExpandChange`), and
only the innermost results list actually scrolls, not the whole page.
Hotels' results had neither: no `SleekScroll` wrapper, and no
`onExpandChange` wired up, so a real result list just grew the whole
card — and the page under it — taller instead of scrolling in place.

Wrapped `HotelResults`' offer list in `SleekScroll` (`taw-results-scroll`,
same as Flights) and gave its outer container the same `taw-results-panel`
class Flights uses, so it joins the same flex-height chain
(`taw-fdesk` → `taw-results-view` → `taw-results-panel` →
`taw-results-scroll`) that lets the innermost list flex-fill and scroll
instead of growing unbounded. Also wired `HotelDesk`'s own
`showResults` state up through a new `onExpandChange` prop — without it
the Search card stays sized to its form's content (`.taw-card--fit`) even
with a full result list behind it, giving `SleekScroll` nothing bounded
to scroll within. `SearchDesksPanel` now passes its `setExpanded` to
`HotelDesk` the same way it already did for `FlightDesk`. Visa wasn't
touched — out of scope for this ask, and its result list is normally a
single row.

Verified live: searched Goa hotels for Priya Kapoor (10 results) — the
Search card grows to the column's full height, the custom sleek
scrollbar thumb appears on the list, and scrolling it reveals offers
further down (e.g. "Sapphire Suites Goa") while the Queue and Itinerary
Builder columns, and the filter strip/summary pill above the list, stay
fixed in place — confirmed via direct DOM inspection that the scrollable
element's `scrollHeight` (2655px) exceeds its `clientHeight` (450px) with
`overflow-y: auto`, and that `window.scrollY` stays 0 while it scrolls.

**Files touched:** `src/components/panels/HotelDesk.tsx`,
`src/components/panels/SearchDesksPanel.tsx`.
**Data/API status:**
- Real (already wired): none — presentation-only change.
- Needs backend attention: none.
**Env vars added/changed:** none.
**Backend action needed:** None — uses existing endpoints/no backend dependency.

---

## 2026-09-04 — Removed dead per-item action buttons from the Itinerary Builder

**What changed:** Every attention-tier item in the Itinerary Builder (held
flight, awaiting-confirmation hotel, price-changed hotel, unselected
return leg) rendered a row of curated action buttons from the mock data —
Issue ticket, Extend hold, Swap, Chase supplier, Find backup, Accept new
rate, Swap hotel, Choose flight, "4 in search" — none of which had an
`onClick` at all; they were pure decoration. On top of being unwired, none
of them belong on this screen: the Enquiries console is for composing an
end-to-end itinerary proposal to answer a client's enquiry, not for
booking ops — issuing a ticket, chasing a supplier, or confirming a rate
change all happen later, in Orders, once a proposal is approved. The
"Swap"-style ones were also just redundant even if wired: replacing a
pick is already Remove this item, then Add the replacement via the
always-visible Search panel — one real path instead of three fake ones
pointing at the same outcome.

Deleted the `actions` field from every item in `mockItinerary.ts` and the
render block that mapped over it in `ItineraryView.tsx`. Remove is now the
one and only per-item action, alongside the existing inline room-type/
cabin edit.

Verified live: generated the AI itinerary for Arjun Mehta (Switzerland) —
the held flight, the awaiting-supplier hotel, and the price-changed hotel
all expand with their full detail/chips as before, with only a Remove
button where the curated action rows used to be; confirmed via search
that "Issue ticket", "Chase supplier", and "Accept new rate" no longer
appear anywhere in the itinerary.

**Files touched:** `src/lib/mockItinerary.ts`,
`src/components/panels/ItineraryView.tsx`.
**Data/API status:**
- Real (already wired): none — the deleted buttons were never wired to begin with.
- Needs backend attention: none.
**Env vars added/changed:** none.
**Backend action needed:** None — uses existing endpoints/no backend dependency.

---

## 2026-09-04 — Hotels/Visas search results now replace the form, and Hotels' filter bar matches Flights

**What changed:** Two consistency fixes across the Search desks, both making
Hotels/Visas match a pattern Flights already established:

1. Flights' Search results REPLACE the form (mutually exclusive views, with
   a back-chevron to return) — Hotels and Visas instead kept the form
   sitting there and dumped results below it. Both now use the same
   `showResults`/`backToSearch()` toggle as FlightDesk, with the same
   back-chevron + a one-line summary pill (city/dates for Hotels,
   nationality → destination/category for Visas) in place of the form
   while results are showing.
2. Hotels' filter/sort row was still the older boxed `.taw-shopbar` design
   (segmented star buttons, a raw `<select>` for board, a labeled native
   `<select>` for sort) — replaced with the same `.taw-filter-strip` of
   styled `Dropdown` pills + a `Refundable` toggle chip that Flights uses,
   so all three desks share one filter-bar language. Stars and Board are
   now `Dropdown`s (matching Flights' Stops/Carrier treatment) instead of
   segmented buttons/native selects; the separate "Showing X of Y stays"
   count line was dropped too, since Flights doesn't show an equivalent.

Verified live: selecting Priya Kapoor → Hotels → Search shows results
replacing the form with a "Goa · 25 Sept – 29 Sept" pill and back-chevron;
the Stars dropdown opens as a styled popup (not a native select) and
filtering to "5★" correctly narrows the list to the one 5-star property.

**Files touched:** `src/components/panels/HotelDesk.tsx`,
`src/components/panels/VisaDesk.tsx`.
**Data/API status:**
- Real (already wired): none — presentation-only change.
- Needs backend attention: none.
**Env vars added/changed:** none.
**Backend action needed:** None — uses existing endpoints/no backend dependency.

---

## 2026-09-04 — Search desks now default to the selected enquiry's own trip (flow-testing hurdle #6)

**What changed:** Flights/Hotels/Visas under Search always opened on hardcoded
placeholder defaults (FROM DEL / TO DXB, Hotel city "Dubai", Visa destination
"UAE") no matter which enquiry was selected — so building, say, Priya
Kapoor's Goa itinerary meant retyping BOM → GOI and "Goa" by hand before
Search did anything useful. Found while dogfooding the Queue → Search →
Itinerary flow per the standing "iterate until satisfactory" plan.

The selected enquiry (already held by `WorkbenchTab`) is now threaded down
through `SearchDesksPanel` into each desk, and each desk's `useState`
initializer reads `enquiry.ask` to seed its defaults: FlightDesk parses an
airport code out of `ask.from` ("Mumbai (BOM)" → BOM) and looks up
`ask.destinations[0]` against a small city→code table (covers exactly the
mock enquiries' cities — Delhi/Mumbai/Singapore/Goa/Dubai — same "match the
mock data" scope as the rest of this pass, not a real airport directory);
HotelDesk seeds `city` straight from `ask.destinations[0]`; VisaDesk seeds
`destination` from it only when that city is one of the desk's supported
visa destinations (falls back to "UAE" otherwise — e.g. Goa is domestic and
needs no visa). The existing `key={selEnqId}` remount (added for the
pax/cabin hurdle) is what makes these initializers re-run per enquiry
rather than sticking to whichever was selected first.

Verified live: selecting Kabir Shah (Mumbai → Singapore, Business) shows
FROM BOM / TO SIN / Cabin Business on the Flights desk; selecting Priya
Kapoor (Mumbai → Goa, Economy) shows FROM BOM / TO GOI / Economy on
Flights and City "Goa" on Hotels.

**Files touched:** `src/components/panels/WorkbenchTab.tsx`,
`src/components/panels/SearchDesksPanel.tsx`,
`src/components/panels/FlightDesk.tsx`,
`src/components/panels/HotelDesk.tsx`, `src/components/panels/VisaDesk.tsx`.
**Data/API status:**
- Real (already wired): none — this only changes local form-state defaults.
- Needs backend attention: none.
**Env vars added/changed:** none.
**Backend action needed:** None — uses existing endpoints/no backend dependency.

---

## 2026-09-03 — Primary button fill fixed for accessibility (contrast)

**What changed:** `.taw-btn--primary` (the app's gold CTA — "Issue
ticket", "Search Flights", "Generate AI Itinerary", etc.) used a
top-to-bottom gradient from `--gold` down to the darker `--gold-deep`.
Computed against the button's dark `--ink` text, the gradient's
lighter top cleared ~6.8:1, but its darker bottom only reached
~4.74:1 — a razor-thin margin over WCAG AA's 4.5:1 floor for text this
size (12px bold doesn't qualify as "large text", so the stricter
threshold applies), thin enough that real subpixel/antialiasing
rendering could plausibly drop it below the floor.

First pass flattened the fill to a solid color, which fixed contrast
but lost the button's dimensional look — reverted per direct request,
back to a gradient. Landed on: `--gold` at top fading to a lighter
gold-ivory tone (`#E4D19B`) at the bottom (hover: `#C8A23A` →
`#EDDCAE`), replacing the old `--gold-deep` dark end rather than the
light end — same gradient direction and general look as the original,
just with the problematic dark stop swapped for a lighter one.
Contrast now holds ~6.83:1–~10:1 (base) and ~7.64:1–~11:1 (hover)
across the whole gradient — every point clear of AA, most of it clear
of AAA too, vs. the original's one thin edge.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Fixed visa card's expanded content having no padding

**What changed:** The visa card's expanded content (sub, meta, chips,
note) was rendered as bare children of `.taw-itin-item` instead of
being wrapped in `.taw-itin-item-detail` — the class every other
item's expanded content uses for its padding. Result: the visa
detail text/chips sat flush against the card's own left/right edges
and directly under the header divider, with zero spacing. Wrapped it
in `.taw-itin-item-detail` like every other item, plus a
`.taw-itin-visa-detail` override for left padding — the shared
39px left padding is calibrated to sit under a normal item row's
title (after its grip/icon/time columns), which the visa header
doesn't have (just a chevron + icon), so reusing it verbatim would
misalign; visa now uses the card's standard 12px edge padding instead.
Verified live: computed padding `0px 12px 12px`.
**Files touched:** `src/components/panels/ItineraryView.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS/markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Flight detail chips recolored to lightest ivory

**What changed:** `.taw-itin-chip` (the Fare J / 2 seats / baggage /
change-fee row) changed from the warm `var(--bone)` fill to a lightest-
ivory fill with a slightly darker ivory outline — staying in the ivory
family rather than the neutral grey used for the segments box and
Traveller Profile's dates card. First pass (`#FDFCF6` / `--ivory`) was
darkened once more per immediate follow-up, to `#F3F2EC` / `#ECE8DD`.
Verified live: computed `rgb(243,242,236)` fill / `rgb(236,232,221)`
border.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Flight segments box recolored to match Traveller Profile's dates card

**What changed:** `.taw-itin-segs` (the EK 501/EK 87 segment box inside
an expanded flight item) changed from the warm `var(--bone)` tan fill
to the same neutral `#FAFAFA` fill / `#F8F8F8` border treatment as
`.taw-m360-dates` in Traveller Profile, for one consistent "flat info
card" style instead of two different ones. Verified live: computed
`rgb(250,250,250)` / `rgb(248,248,248)`.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Mock data reconciled to the solo-trip scope (flow-testing hurdle #1)

**What changed:** First hurdle in the "iteratively test Queue → Search →
Itinerary → Proposal until it's clean" pass — the mock data itself
conflicted with the scope decision that TripAgent only accepts solo
trips booked by the cardholder who is also the traveller:
- `mockEnquiries.ts`'s enquiry #2 was a 3-person family trip (2 adults
  + a 7-year-old) to Goa, `groupType: "Family"`, budget ₹3.5L, asking
  for "adjoining rooms." Rewritten solo: one traveller (Priya Kapoor),
  `groupType: "Solo"`, budget scaled to ₹1.2L, "adjoining rooms"
  dropped (a multi-room ask) while keeping "ground floor or elevator
  access" — the hotel-accessibility mismatch this enquiry exists to
  test still works fine solo, framed as a real personal need ("can't
  do stairs with my knee") instead of a family constraint.
- `mockItinerary.ts`'s Switzerland AI-draft was a 2-adult honeymoon —
  `pax: 2`, `purpose: "Honeymoon"`, every flight/hotel occupancy
  detail (seats, baggage, room "2 adults" lines) reflected two
  travellers. Changed to `pax: 1`, `purpose: "Leisure"`, 1 seat/1
  checked bag/1 named seat on the flight, "1 adult" on every hotel
  line, "1 applicant" on the visa, and the unused `meta.travelers`
  field ("Rohan · Neha Iyer" — dead data, never actually rendered)
  changed to a generic "1 traveller" since this mock is shared across
  whichever enquiry clicks "Generate AI Itinerary," not tied to one
  name.
- All three Search desks (`FlightDesk`/`HotelDesk`/`VisaDesk`)
  defaulted their pax/rooms fields to 2 regardless of the scope
  decision — changed to default 1 everywhere.
- Fixed a grammar bug this surfaced: the itinerary summary line hard-
  coded "adults"/"nights" as plural regardless of count ("1 adults");
  now pluralizes correctly off the actual number, in both
  `ItineraryView.tsx` and `ItinerarySummaryContent.tsx` (the same line
  was duplicated in both).
Verified live: Priya Kapoor's Traveller Profile now reads "Solo trip
to Goa," tags "VACATION · SOLO," "1 adult," "Cap ₹1.2L," hard
constraint "Ground floor or elevator access" (no "adjoining rooms");
all three Search desks default to pax/rooms 1; the generated
Switzerland itinerary reads "8 nights · 1 adult · Leisure" and every
flight/hotel/visa line shows single-traveller counts.
**Files touched:** `src/lib/mockEnquiries.ts`, `src/lib/mockItinerary.ts`,
`src/components/panels/FlightDesk.tsx`,
`src/components/panels/HotelDesk.tsx`,
`src/components/panels/VisaDesk.tsx`,
`src/components/panels/ItineraryView.tsx`,
`src/components/panels/ItinerarySummaryContent.tsx`.
**Data/API status:** n/a — mock/demo data and form defaults only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Fixed Search-added days sorting to the end regardless of date (flow-testing hurdle #2)

**What changed:** Second hurdle from dogfooding the full flow — added
a flight to an enquiry whose AI itinerary already existed (mixing
Search-added and AI-mock data, an untested path), and the new day
landed at the END of the day list even though its date (25 Sept) was
chronologically BEFORE every existing day (Oct dates). Root cause:
`itineraryFromCart.ts`'s day-bucketing sorts by each day's `_iso`
field, but `mockItinerary.ts`'s days never had one (only a
human-readable `date: "Thu 12 Oct"` string) — so they sorted as empty
string, before any real date, regardless of what that date actually
was. Added the correct `_iso` (e.g. `"2026-10-12"`) to all 4 mock
days, so old and newly-added days now sort correctly against each
other on a real, consistent basis.
Verified live: adding a 25 Sept flight to an itinerary whose earliest
existing day was 12 Oct correctly inserted it as the new "Day 1"
(route "DEL → DXB"), pushing the rest down to Day 2–5 in order.
**Files touched:** `src/lib/mockItinerary.ts`.
**Data/API status:** n/a — mock data only.
**Env vars added/changed:** none.
**Backend action needed:** None — but flagging that a real AI-
generation endpoint would need to supply a real ISO date per day, not
just a display string, for this same sort logic to keep working.

---

## 2026-09-03 — Fixed Search Desks never picking up the selected member's preferences (flow-testing hurdle #3)

**What changed:** Third hurdle from dogfooding — Kabir Shah's Cabin
dropdown showed "Economy" instead of his actual "Business" preference.
Two compounding bugs:
1. `FlightDesk.tsx`'s `CABIN_OPTIONS` uses lowercase/snake_case keys
   (`"business"`), but `member.preferences.cabin` is stored capitalized
   ("Business") for human display elsewhere (Traveller Profile) — no
   option matched, so the Cabin Dropdown's trigger rendered blank.
   Added `normalizeCabin()` to reconcile the two at the point of use.
2. The deeper bug: `SearchDesksPanel`/`FlightDesk`/`HotelDesk`/
   `VisaDesk` never remount when the selected enquiry changes, so their
   `useState(() => ...member.preferences...)` initializers only ever
   run ONCE, capturing whichever member happened to be selected first
   — every enquiry picked after that silently got the wrong (or
   default) pax/cabin regardless of how correct the normalizing logic
   was. Fixed by adding `key={selEnqId}` to `SearchDesksPanel` in
   `WorkbenchTab.tsx`, forcing a real remount (and a clean slate —
   leftover search results from a different traveller no longer linger
   across an enquiry switch either, which is correct behavior, not
   just a side effect).
Verified live: selecting Kabir Shah first now correctly shows Cabin
"Business" / Pax 1; switching to Priya Kapoor afterward correctly
updates to Cabin "Economy" — previously the SECOND selection (or any
selection after the first) would have silently kept the first
member's stale defaults.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/components/panels/WorkbenchTab.tsx`.
**Data/API status:** n/a — client-side form defaulting only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Added item/visa removal + fixed newly-added items defaulting collapsed (flow-testing hurdles #4–5)

**What changed:** Two hurdles found while dogfooding "iterate until
the itinerary is satisfactory":
- **#4 — no way to undo a wrongly-added item at all.** Every other
  operation (edit, reorder, add) had a counterpart; removal didn't
  exist, which genuinely blocks the goal — an advisor can't iterate
  toward "satisfactory" if a mistaken add is permanent. Added
  `removeItem(dayId, itemId)` (drops the day entirely if it ends up
  empty, rather than leaving a dead day-shell behind) and
  `removeVisa()`, both rolling the removed item's price back out of
  `totals.grand`/`held`. A "Remove" button (`.taw-btn--danger`) now
  appears in every item's and the visa's action row.
- **#5 — surfaced while testing #4**: a newly Search-added item
  defaulted to COLLAPSED regardless of tier, hiding its own new Remove
  button (among everything else) from discovery. Root cause: `openItems`
  was a lazily-seeded map computed ONCE at mount from whatever items
  existed then — an item added later via Search never got an entry, so
  it silently fell back to "closed" instead of the established
  "attention starts open" rule. Reworked so the map only holds EXPLICIT
  user toggles; any item without one falls back to `tierOf(item.status)
  === "attention"` computed fresh every render — correct for items
  present at mount AND items added mid-session. Also fixed the toggle
  handler itself, which read the raw (often-undefined) map value
  instead of the effective open state — would have required two clicks
  to collapse an untouched attention item instead of one.
Fixed the identical bug one level up too, found immediately after:
`openDays` had the exact same lazily-seeded-once-at-mount flaw as
`openItems` — a day CREATED later by a Search add never got an entry
either, so it silently rendered collapsed regardless of containing an
attention item, hiding everything inside it (including the item-level
fix above). Same treatment: only explicit day toggles are stored now,
falling back to `dayHasAttention()` computed fresh for any day without
one; the day toggle handler fixed the same "reads stale raw value
instead of effective state" bug too.
Same bug existed a THIRD time for the visa slot specifically —
`visaOpen` was a plain boolean fixed at mount from `data.visa` (null on
a blank/scratch itinerary), so adding a visa via Search later never
reopened it either. Same fix: `visaOpenOverride` is `null` until an
explicit toggle, falling back to the current tier until then.
Verified live: adding a flight now auto-expands it immediately
(showing its new Remove button without an extra click) AND its day
auto-expands too; clicking Remove deletes the item, drops the now-empty
day, and zeroes the totals — no dead day-shell left behind; removing
one of two items in the same day correctly leaves the day and its
other item intact; adding a visa to a blank itinerary auto-expands it
with its Remove button visible, and Remove correctly clears it back to
the empty state.
**Files touched:** `src/components/panels/ItineraryView.tsx`.
**Data/API status:** n/a — client-side state only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Search → Itinerary Builder, direct (no cart)

**What changed:** Real architecture change, not a display tweak — the
Itinerary Builder used to be entirely disconnected from Search: its
data was local `useState` cloned once from static mock data, and
Search's "Add" wrote into a separate `cart` array in `WorkbenchTab`
that nothing ever read (built as a holding pen for a "Finalize
overlay" that never got built). Direct scope call: "Cart is not
necessary at all for this flow" — so this connects them without one.

- **Itinerary data moved from `ItineraryView`-local state into
  `WorkbenchContext`**, keyed per enquiry (`itinerariesByEnquiry`,
  same pattern as `proposalQueue`) — Search's "Add" and the Itinerary
  Builder's own edits (day/item updates, drag-reorder) now read/write
  the exact same object, not two disconnected copies.
- **`SearchDesksPanel`'s `onAdd` calls `addSearchItemToItinerary`
  directly** — an "Add" in Flights/Hotels/Visa becomes a real
  itinerary item immediately. It auto-seeds a blank itinerary for the
  enquiry if none exists yet, so this works even before the advisor
  has clicked through the AI/scratch chooser at all.
- **New `src/lib/itineraryFromCart.ts`** — `blankItinerary()` (a real
  empty state: no mock destination/days, `visa: null`) and
  `addCartItemToItinerary(data, cartItem)`, which converts whatever a
  Search desk's Add button already builds
  (`flightCartItem`/`hotelCartItem`/`visaCartItem`) into the
  itinerary's item shape. Flights/hotels land in the day matching
  their date (a new day is created and inserted in date order if none
  exists yet); visa replaces the trip's single `visa` slot (one visa
  per trip in this model, not per-day). Freshly added items get
  `status: "on_hold"` and a plain "Added from Search" meta line —
  honestly less curated than the AI mock data, since nothing's
  confirmed yet.
- **`WorkbenchTab`'s chooser logic simplified**: shows only while the
  selected enquiry has no itinerary data yet; the moment it has any —
  via the chooser OR a Search add arriving first — renders the real
  `ItineraryView`. The old separate "scratch" placeholder is gone
  entirely; a blank itinerary is now a real state, not a stand-in.
- **Removed the dead `cart` state and `ta:add-to-cart` listener** from
  `WorkbenchTab.tsx` — it was explicitly built as a holding pen for
  exactly this handoff; once the real handoff exists, keeping the old
  one around is stale, not future-proofing.
- Fixed a real bug this surfaced: `ItinerarySummaryContent.tsx`
  assumed `data.visa` always exists (unguarded `data.visa.title`),
  which crashed the Summary window the moment an itinerary was built
  purely from Search adds with no visa. Guarded, matching the same
  null-check already added to `ItineraryView.tsx` for this.

Verified live end-to-end: selecting an enquiry with no itinerary shows
the chooser; searching Flights and clicking Add (without touching the
chooser) immediately shows a real Itinerary Builder ("New itinerary",
₹23,795 total, "1 item need attention", Day 1 with the added flight,
expanded, "Added from Search"); adding a same-date Hotel bucketed it
into the same Day 1 and updated totals to ₹46,099; Send to Proposal →
Summary window → Continue → Proposal Composer all completed correctly
with this real data, no crash, no mock data anywhere in the chain.
**Files touched:** `src/lib/itineraryFromCart.ts` (new),
`src/lib/workbenchContext.tsx`, `src/components/WorkbenchDataProvider.tsx`,
`src/components/panels/ItineraryView.tsx`,
`src/components/panels/WorkbenchTab.tsx`,
`src/components/panels/HotelDesk.tsx`,
`src/components/panels/ItinerarySummaryContent.tsx`.
**Data/API status:** Session-local only (same as the rest of
`WorkbenchContext`) — lost on a full page reload.
**Env vars added/changed:** none.
**Backend action needed:** None yet — same flag as the earlier
handoff work: real persistence (a draft/proposal record per enquiry)
is the eventual dependency once this moves past session state.

---

## 2026-09-03 — Mock fallback data for Hotels and Visa search (matching Flights)

**What changed:** Hotels and Visa search had no local fallback at all —
on a failed live API call (every time in local dev, no backend
reachable), Hotels showed a bare error banner and Visa the same;
Flights already had `mockFlightSearch.ts` for exactly this case. Added
the same fallback contract to both, sourced from real captured
searches on the deployed reference site
(https://tripagent-admin.vercel.app) rather than guessed data:
- **`src/lib/mockHotelSearch.ts`** — `buildMockHotelOffers({city,
  checkIn, checkOut, rooms, pax})`. 10 properties (1×3★/7×4★/2×5★,
  captured price bands ₹5.8k/₹12–14k/₹22–26k per night) with the city
  substituted into every property name, hash-seeded per search so the
  same query stays stable but different cities/dates visibly differ.
  Returns offers already shaped like `HotelDesk.tsx`'s own
  `mapTripSureHotel()` output.
- **`src/lib/mockVisaSearch.ts`** — `buildMockVisaOffer({nationality,
  destination, pax})` covering all 7 destinations in VisaDesk's own
  dropdown. UAE and Schengen profiles (visa type, processing days,
  document checklist, fee) are the two real captured results; UK/USA/
  Singapore/Thailand/Bali are filled in from realistic public
  Indian-passport visa-requirement info. Deliberately omits
  `visa_duration`/`entries_allowed` — VisaDesk.tsx's own comment notes
  those are OneVasco-only fields absent on the real local-fallback
  path, so the mock doesn't invent fields that path never actually has.
- Wired into `HotelDesk.tsx`/`VisaDesk.tsx`'s existing `.catch()`
  handlers with the same toast pattern FlightDesk already uses
  ("Live API unreachable — showing demo … data — N offers loaded").
Verified live: Dubai hotel search returns 10 offers matching the
reference site's shape (e.g. "The Grand Budget Dubai · ★★★ · INTL ·
NON-REF · ₹22,304 net cost" vs. the captured ₹17,373 — same property,
different night count); switching city to Zurich correctly re-names
every property; UAE visa search returns "e-Visa (tourist 30/60 day) ·
3 days · 2 applicants · ₹13,400" (captured reference: ₹13,000, within
the deliberate ±3% variance); switching to Schengen returns a
distinct result.
**Files touched:** `src/lib/mockHotelSearch.ts` (new),
`src/lib/mockVisaSearch.ts` (new),
`src/components/panels/HotelDesk.tsx`,
`src/components/panels/VisaDesk.tsx`.
**Data/API status:** Fallback-only mock data, same contract as
Flights — the real API call always runs first.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Proposal Composer's Queue is now always visible

**What changed:** Direct correction — the previous version swapped the
whole two-column layout for a single full-width `ConsolePlaceholder`
whenever `proposalQueue` was empty, so the Queue itself disappeared
along with everything else. Console's own Queue (`EnquiryInbox.tsx`)
never does this — it stays present and shows its own inline empty
state. Proposal Composer now matches: the `.taw-cols-2` Queue+content
layout always renders, with each side showing its own `Empty` state
independently when there's nothing to show (Queue: "Nothing waiting
here yet"; composer: the original "Not yet built" copy, now scoped to
"once one exists" in the Queue rather than being the entire page).
Verified live: a fresh session shows both empty states side by side
inside the two-column layout (not one collapsed placeholder); sending
an itinerary still populates the Queue and composer correctly.
**Files touched:**
`src/app/(authenticated)/console/proposal-composer/page.tsx`.
**Data/API status:** n/a — markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Hotels/Visa search buttons match Flights' dark-brown style

**What changed:** "Search Hotels" and "Check Visa Requirement" used
the standard gold `.taw-btn--primary`, while "Search Flights" had its
own distinct dark-brown `.taw-btn--brown` treatment — inconsistent
across the three search desks. Added `taw-btn--brown` to both so all
three now share one look. Verified live: both compute to the same
`linear-gradient(rgb(107,66,38) 0%, rgb(62,39,20) 100%)` as Search
Flights.
**Files touched:** `src/components/panels/HotelDesk.tsx`,
`src/components/panels/VisaDesk.tsx`.
**Data/API status:** n/a — markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Proposal Composer gets its own Queue

**What changed:** Follow-up to the handoff work — Proposal Composer's
single-itinerary preview became a real two-column Queue + content
layout (`.taw-cols-2`, same grid class other Console screens use).
The single `itinerary`/`setItinerary` WorkbenchContext field was
upgraded to a real per-enquiry queue (`proposalQueue`, an array of
`{enquiryId, member, data, sentAt}`, upserted by `enquiryId` so
re-sending the same enquiry replaces its entry instead of
duplicating it) plus `selectedProposalEnqId`/`selectProposal`. The
queue is naturally already scoped to exactly what was asked — "only
those that have an itinerary that needs to be composed" — since
entries only ever get added by the "Send to Proposal" action; nothing
else populates it. `ItineraryView` now takes `enquiryId`/`member` props
(passed down from `WorkbenchTab`) so it can tag its entry correctly.
Queue rows reuse the exact `.taw-enq-item`/`-top`/`-name`/`-meta`/
`-depart` markup Console's own Queue uses, so it reads as the same
pattern, not a new one — plus a relative "Sent Xm/h/d ago" timestamp.
Verified live: sending Priya's itinerary then Arjun's (via real in-app
tab navigation, not a page reload) produced two distinct queue
entries, not one overwriting the other; clicking between them updates
the right-hand summary and the active-row highlight correctly.
**Files touched:** `src/lib/workbenchContext.tsx`,
`src/components/WorkbenchDataProvider.tsx`,
`src/components/panels/ItineraryView.tsx`,
`src/components/panels/WorkbenchTab.tsx`,
`src/app/(authenticated)/console/proposal-composer/page.tsx`.
**Data/API status:** Session-local only (same as the rest of
`WorkbenchContext`) — the queue is lost on a full page reload, not
just on navigation between tabs.
**Env vars added/changed:** none.
**Backend action needed:** None yet — same flag as the original
handoff: this will need real persistence (draft/proposal records)
once it's more than session-local state.

---

## 2026-09-03 — Itinerary Builder → Proposal Composer handoff, via a real Summary window

**What changed:** There was no way to get from a built itinerary to
Proposal Composer — confirmed by code investigation before building
anything: Proposal Composer was a static placeholder unaware of
`WorkbenchContext`, no button/link anywhere made the transition, and
the itinerary/cart state were both local-only, disconnected from each
other and from routing. This builds the path end-to-end, and brings
back the "Summary" step that was removed from this screen earlier
(per `WorkbenchTab.tsx`'s own docblock, planned since then as a
"Finalize-triggered overlay" but left unbuilt):
- A **"Send to Proposal"** button in the Itinerary Builder's summary
  header opens a **Summary window** (modal) — a condensed, read-only
  recap of the whole trip (totals + the confirmed/held/unresolved bar,
  an "N days still need attention" flag, and a one-line-per-day/visa
  list with status dots) built as a new shared component
  (`ItinerarySummaryContent.tsx`) so the modal and Proposal Composer's
  page render identically instead of drifting apart.
- The modal's own **"Continue to Proposal Composer"** action is what
  actually performs the handoff — writes the itinerary into
  `WorkbenchContext` (new `itinerary`/`setItinerary` field, following
  the exact same pattern `selEnqId`/`member` already use) and
  navigates. Opening the modal itself has no side effects — "Send to
  Proposal" is reversible until that confirm click.
- `console/proposal-composer/page.tsx` now reads `itinerary` from
  context: shows the real summary (via the same shared component,
  with an honest "the real compose/preview/send UI isn't built yet"
  note) once something's been sent, falls back to the original
  placeholder (with an updated hint) when nothing has.
- Modal chrome reuses the existing `.taw-modal-overlay`/`-panel`/
  `-title`/`-actions` classes from `InviteCustomerForm.tsx` rather
  than inventing new modal styling, with a new `--wide` variant since
  an itinerary recap needs more room than a short confirm dialog.
Verified live end-to-end: Send to Proposal → modal shows the correct
recap → Continue → lands on `/console/proposal-composer` with the
"Proposal Composer" tab active and the same data rendered, labeled
"received from Itinerary Builder"; a fresh session visiting that route
directly still shows the (updated) empty-state placeholder.
**Files touched:** `src/components/panels/ItinerarySummaryContent.tsx`
(new), `src/components/panels/ItinerarySummaryModal.tsx` (new),
`src/components/panels/ItineraryView.tsx`, `src/lib/workbenchContext.tsx`,
`src/components/WorkbenchDataProvider.tsx`,
`src/app/(authenticated)/console/proposal-composer/page.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** Session-local only (React state in
`WorkbenchContext`, same as everything else there) — no persistence,
lost on refresh. Still the same mock itinerary data underneath.
**Env vars added/changed:** none.
**Backend action needed:** None yet — flagging that a real handoff
will eventually need this to persist (a draft/proposal record), not
just live in memory for the session.

---

## 2026-09-03 — Removed dividers inside a day container

**What changed:** Follow-up to the day-as-divider restructure — there
were still two levels of internal divider left over from the old
boxed-card design: one between a day's header and its items
(`.taw-itin-day-items`), and one between consecutive items within a
day (`.taw-itin-item`). Both removed, per direct request that dividers
belong ONLY between `.taw-itin-day` containers, not inside one. The
day-to-day divider from the prior change is untouched. Verified live:
Day 1's flight detail now flows directly into the Widder Hotel row
with no line between them, and the visa card flows directly into
Day 1's header the same way — the only rule line anywhere in the list
is between Day 1 and Day 3.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Primary button border desaturated to match the new fill

**What changed:** Follow-up to the gradient desaturation — the
button's border (`border-color`, base and hover) moved off
`var(--gold-deep)` to `#A8916D`, a lighter, less-saturated brown in
the same family as the new sand-gold fill, so the border reads as a
soft edge instead of a harder, more saturated outline than the fill
it surrounds. Verified live: computed `rgb(168,145,109)`.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Itinerary Builder: days are dividers, not nested cards

**What changed:** Each day was its own bordered/rounded/backgrounded
card, nested inside the Itinerary Builder's own card, nested inside
its items' own row/detail padding — "too many rounds of padding" per
direct feedback. `.taw-itin-day` now just gets a `border-bottom`
divider (no border/radius/background of its own), flowing in the
ambient white background the outer card already provides — the
`has-attention` white-background override from an earlier fix is now
unnecessary and removed along with it, since there's no longer a
per-day background to fight the page's ivory. The visa block and the
day list are wrapped in a new `.taw-itin-days` container with its own
zero gap (dividers ARE the spacing now), while `.taw-itin` itself
keeps its 10px gap for the sections above the list (summary/alerts/
tabs), which still need real separation before the divided list
starts. Verified live: `.taw-itin-day` computes to `border-bottom:1px
solid`, `border-radius:0`, transparent background — Day 1 and Day 9
now sit as one continuous divided list instead of two separate boxes.
**Files touched:** `src/components/panels/ItineraryView.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS/markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Itinerary Builder: minimum whitespace below the last day/visa card

**What changed:** Added `padding-bottom` to the outer `.taw-itin`
container (24px, then tripled to 72px per immediate follow-up), so
there's always minimum breathing room below whichever day or visa
card happens to render last — regardless of which All/Flights/Hotels/
Visa tab is active (which changes what's last) or whether that last
card is expanded or collapsed. Put on the container itself rather
than a `:last-child` rule so it holds in every case without needing
to track which element that actually is.
Verified live: confirmed both with Day 9 auto-expanded (its default
attention-tier state) and manually collapsed; final computed value
`72px`.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Itinerary Builder: added an "All" tab before Flights

**What changed:** Added a fourth tab, "All", first in the switcher
(All / Flights / Hotels / Visa). It shows the visa card plus every
day with ALL its items unfiltered — the original combined view from
before the tabs existed — with day subtotals correctly reverting to
the full combined amount (e.g. Day 1 back to ₹3,12,400, not the
₹2,24,800 flight-only figure the Flights tab shows). Flights stays the
default active tab; only the tab set changed. Verified live: Day 1
under "All" shows both the Emirates flight and Widder Hotel together
with the combined subtotal.
**Files touched:** `src/components/panels/ItineraryView.tsx`.
**Data/API status:** n/a — same mock data.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Itinerary Builder: day headers no longer ivory-tinted

**What changed:** `.taw-itin-day-h.has-attention` (a day header
containing an attention-tier item) was tinted with `var(--warn-bg)`
(`#F1E7DA`) — close enough to the page's own ivory background
(`#FAF6EB`) that the header text lost contrast. Changed to
`var(--card)`, the same white every other day header already uses.
Verified live: computed background now `rgb(255,254,251)` (`#FFFEFB`).
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Itinerary Builder: drag-reorder moved from days to items (correction)

**What changed:** Direct correction to item #6's drag-reorder — days
were the wrong level to make draggable (they're calendar-ordered, a
day can't just move to a different date by dragging), and the request
was for it to instead be items within a day. Removed the day-level
grip/drag entirely (day headers are no longer draggable at all) and
added a grip handle to each item row instead, reordering within that
item's own day only — dragging an item onto a DIFFERENT day's item is
a no-op, since moving between days is a date change, not a reorder.
The bucket-colored attention accent bar moved from the item row itself
to a new wrapper (`.taw-itin-item-row-wrap`) that now holds the grip
+ row together, so the accent still sits at the card's true left edge.
Verified live: day headers have no grip and aren't `draggable`; each
item row has its own `draggable` grip (2 found on the Flights tab);
dragging Day 1's flight onto Day 9's flight (different days) leaves
the order unchanged, confirming the cross-day guard works. Same-day
multi-item reordering wasn't visually testable with the current mock
data — under the new Flights/Hotels/Visa tabs (added earlier this
session) a day never surfaces two items of the same category at once
— but the reorder function mirrors the exact splice logic already
verified for the (now-removed) day-level version, just scoped by
`dayId` match.
**Files touched:** `src/components/panels/ItineraryView.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — same mock data.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Itinerary Builder: Flights/Hotels/Visa tabs

**What changed:** Added a Flights/Hotels/Visa tab switcher below the
alert banner in the generated itinerary, reusing the exact
`.taw-leg-switch`/`.taw-leg-tab` pattern from flight search's
round-trip leg switcher (same "exactly one of a few mutually-exclusive
views" shape). The day list and visa block filter to match the active
tab — a day with both a flight and a hotel shows only the matching
item under each tab, and days with nothing in the active category
(e.g. Day 9's return flight under "Hotels") are hidden entirely. Each
day's subtotal now derives from whatever's actually visible in it,
not a static combined-day number, so it stays correct per tab.
Clicking an alert in the (tab-independent) banner also switches to
that alert's own category before jumping/expanding, so e.g. a hotel
price-change alert clicked from the Flights tab correctly lands on
Hotels. The totals/financial-rollup bar at the top stays whole-trip,
not per-tab, per the request (only the list below the red card was
asked to be tabbed).
Verified live: Flights tab shows only the Emirates flight (day
subtotal ₹2,24,800, not the combined ₹3,12,400); Hotels tab shows
Widder/Bürgenstock/Riffelalp across Days 1/3/6, flight and Day 9
hidden; Visa tab shows only the visa card; clicking the Zermatt alert
from the Flights tab switches to Hotels and expands Day 6.
**Files touched:** `src/components/panels/ItineraryView.tsx`,
`src/lib/mockItinerary.ts`.
**Data/API status:** n/a — same mock data, category filtering is
client-side.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Removed "Back" control from the generated itinerary view

**What changed:** The AI-generated itinerary view no longer has a
"Back" link above it (returning to the ai/scratch chooser). Once
generated, the itinerary is now the working view for that enquiry;
switching enquiries in the Queue resets `buildMode` naturally. The
from-scratch placeholder's own Back link is unchanged.
**Files touched:** `src/components/panels/WorkbenchTab.tsx`.
**Data/API status:** n/a — markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Itinerary Builder: financial rollup made visible (item #7, last of the itinerary-hierarchy plan)

**What changed:** Last item in the "stop looking like a PDF" plan.
Two problems with the old total/confirmed/held display: (1) three
numbers with no visible relationship — the advisor had to do the
arithmetic themselves to see the split; (2) the grand total (₹6,42,300)
silently excluded the not-yet-selected return flight's cost entirely,
reading as a settled number when a real, currently-unknown amount
(at least ₹1,98,400 more) is still outstanding.
- Added a proportional horizontal bar (confirmed = green, held = amber,
  unresolved = a diagonal-striped pattern, not a solid fill, since it's
  a known floor on an unpriced item rather than a real committed cost)
  under the totals row.
- The grand total now renders as a range whenever anything's
  unresolved — "₹6,42,300–₹8,40,700+" — plus a new fourth "unresolved"
  figure alongside total/confirmed/held.
- Day 9's subtotal (previously the placeholder "1 missing") now shows
  "from ₹1,98,400", extending the exact same range logic down to the
  day level instead of a bare missing-data flag.
Verified live: bar segments compute to 49.8%/26.6%/23.6%
(confirmed/held/unresolved of the 8,40,700 low-end total, matching
418700/223600/198400 exactly); Day 9 shows "from ₹1,98,400" as its
day-total.
**Files touched:** `src/components/panels/ItineraryView.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — same mock data, computed client-side from
existing `priceIsFrom` flags.
**Env vars added/changed:** none.
**Backend action needed:** None — but a real AI-generation endpoint
would need to supply consistent, reconcilable totals/confirmed/held
numbers per item for this rollup to mean anything beyond mock data.

---

## 2026-09-03 — Itinerary Builder: inline editing + day drag-reorder (item #6 of the itinerary-hierarchy plan)

**What changed:** Item #4 (single CTA per row) turned out to already be
satisfied — the mock data was built with one `primary: true` action per
row from the start, and existing `.taw-btn`/`--primary` styling already
renders it as the only filled button against outlined secondaries; no
code change needed there. Moved on to item #6, the one plan item that
overlaps with the previously-deferred real editable builder — confirmed
explicitly with the designer before starting, since it's a real scope
decision, not a display-only tweak like #1/#2/#5.

Implemented:
- The itinerary is now local component state (cloned from the mock on
  mount), not the static import directly — edits need somewhere to go.
- **Inline editing**: day dates, hotel room types, and flight cabins
  render as click-to-edit text (dashed underline + pencil icon on
  hover; click → text input; Enter/blur commits, Escape cancels).
  Prices, statuses, confirmation numbers, and segment detail stay
  read-only — those are supplier-confirmed facts, not advisor-editable,
  and out of scope regardless.
- **Day drag-reorder**: a dedicated grip handle (native HTML5
  drag-and-drop, no library) — only the grip itself is draggable, not
  the whole row, so a plain click still toggles expand/collapse.
- Fixed a real correctness issue this surfaced: the day header was a
  `<button>`, and nesting an `<input>` inside a button (for the
  editable date) is invalid HTML and breaks keyboard/focus behavior.
  Day headers are now `role="button"` divs, manually wired for
  Enter/Space activation — same semantics as a real button.
- `roomType`/`cabin` pulled out of the old flat `detail`/chip strings
  in the mock data into their own fields specifically so they can be
  targeted by inline editing without string-parsing.

Verified live: clicking a day's date swaps in an input (day stays
open — the click doesn't bubble to the header's toggle); committing
with Enter updates the displayed date; dragging Day 1's grip onto
Day 3's position swaps their order in the rendered list; clicking the
flight's "Cabin: Business" field opens an editable input the same way.
**Files touched:** `src/components/panels/ItineraryView.tsx`,
`src/lib/mockItinerary.ts`, `src/components/ui/Icon.tsx` (new `grip`
icon), `src/styles/advisor-workbench.css`.
**Data/API status:** Mock only, session-local — edits live in React
state and are lost on refresh; no save/persist call exists yet.
**Env vars added/changed:** none.
**Backend action needed:** None yet — flagging that persisting these
edits (and day reorder) will need a real save endpoint once this moves
past mock data; item order isn't currently modeled as backend state
anywhere.

---

## 2026-09-03 — Traveller Profile dates card recolored to neutral grey

**What changed:** `.taw-m360-dates` (the "12–16 Oct · Flexible" card in
Traveller Profile) changed from a warm tan fill (`var(--bone)`) + line
border to a near-white grey fill (`#FAFAFA`) with a very slightly
darker outline (`#F8F8F8`), so the date range text and the FLEXIBLE tag
read more clearly against it. Verified live: computed
`rgb(250,250,250)` fill / `rgb(248,248,248)` border.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Itinerary Builder: status pills carry their own next step (item #5 of the itinerary-hierarchy plan)

**What changed:** Three different attention statuses (on hold, in
progress, not selected) share the same amber "warn" bucket — fine when
everything was always expanded with a meta line underneath, but once
rows collapse (item #2), a bare "On hold" pill on a one-line row tells
you nothing about how urgent it actually is. Added an explicit
`nextStep` string per attention item/visa, folded directly into the
pill text: "On hold · 6h 20m left", "Awaiting supplier · no reply 2d",
"Price changed · +₹9,600", "Not selected · 4 options", "In progress ·
decision by 11 Oct". Dropped the now-duplicated wording from the
chips/meta below each pill (e.g. "Requested 01 Sep · no reply 2 days"
→ chip is just "Requested 01 Sep", the "no reply 2d" part lives in the
pill) so the same fact isn't stated twice on one card. Verified live:
collapsing the on-hold Emirates flight still shows "On hold · 6h 20m
left" on its one-line row; Day 6/9's price-changed and not-selected
pills read "Price changed · +₹9,600" and "Not selected · 4 options".
**Files touched:** `src/lib/mockItinerary.ts`,
`src/components/panels/ItineraryView.tsx`.
**Data/API status:** n/a — still the same mock data.
**Env vars added/changed:** none.
**Backend action needed:** None — but flagging that a real AI-generation
endpoint would need to supply this `nextStep` string per item (not
something the frontend can derive on its own for every status).

---

## 2026-09-03 — Traveller Profile hero: tighter avatar-to-name spacing

**What changed:** `.taw-m360-hero` gap (avatar → name/meta stack) reduced
from 15px to 10px. Verified live: computed gap now `10px`.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Itinerary Builder: every row is now a plain toggle (item #2 of the itinerary-hierarchy plan)

**What changed:** Item #1 built the compact-row skeleton, but only
"done" (booked) rows could actually collapse — attention rows (on
hold, price changed, etc.) were permanently pinned open with no click
handler, no hover affordance, and no way to tell they were interactive.
Now every item row is a plain, symmetric open/close toggle:
- Tier only decides the STARTING state (attention starts open, done
  starts closed) — after that, click to collapse a handled attention
  item back to one line, or open a booked item to check its
  confirmation number. Same interaction everywhere.
- Every row now has `cursor:pointer`, a hover background, and
  `aria-expanded`.
- A collapsed attention row keeps a status-colored left accent bar
  (amber/blue/red, matching its status pill's bucket) so it still
  reads as urgent at a glance even collapsed — the status pill alone
  wasn't enough once a row shrinks to one line.
Verified live: clicking the on-hold Emirates flight collapses it to a
single line (accent bar still visible) sitting flush against the
already-compact booked hotel row below it; clicking again re-expands
the full segment/chip/action detail.
**Files touched:** `src/components/panels/ItineraryView.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — still the same mock data from item #1.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Itinerary Builder: real content on the AI path (item #1 of the itinerary-hierarchy plan)

**What changed:** First implementation step from the "the itinerary
mockup reads like a printed PDF, not a working tool" design discussion.
Picking "Generate AI Itinerary" in the builder chooser now renders a
real (though still mock-data-backed) itinerary instead of a placeholder
message, built around a two-tier visual hierarchy:
- **Attention tier** (on hold, price changed, awaiting supplier, not
  selected) — full card: detail/segments, chips, meta, action buttons.
  Auto-expanded.
- **Done tier** (booked) — collapses to a single compact line (icon ·
  time · title · status pill · price); click to reveal detail, no
  action buttons since there's nothing to do.
- **Days** collapse to one summary line by default, auto-expanding only
  when they contain an attention-tier item — so a 9-day trip with 2
  live issues shows 2 open days, not 9.
- The alert banner is now a **clickable jump-list** (not a static
  paragraph) — each alert opens and scrolls to the day/section it's
  about.
- Visa follows the same attention/done tiering as any other item.

New status vocabulary (`on_hold`/`booked`/`awaiting_supplier`/
`price_changed`/`not_selected`/`in_progress`) maps onto the app's
existing 5-bucket status-pill palette (warn/info/danger/success —
already used by Orders) rather than inventing new colors; `tierOf()` is
the single place status maps to visual tier, so new statuses don't need
render-code changes. Data is a static mock (`mockItinerary.ts`, shaped
from the designer's Switzerland/honeymoon reference) — there's no real
AI-generation call yet, and "Start from scratch" is untouched.
Deliberately out of scope for this pass (later items in the same plan):
inline editing, drag-reorder, single-CTA-per-row cleanup, financial
rollup visualization. Verified live: attention items render expanded
with full detail; the booked hotel row collapses to one line and
expands on click; alert clicks correctly re-open a manually-collapsed
day (confirmed via direct DOM check after the click, since this
browser's smooth-scroll animation didn't complete within the
automated-test window — the state/target logic itself is correct).
**Files touched:** `src/components/panels/ItineraryView.tsx` (new),
`src/lib/mockItinerary.ts` (new),
`src/components/panels/WorkbenchTab.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** Mock only — no backend call. Real AI-generation
endpoint still needs to exist before this can show a real trip.
**Env vars added/changed:** none.
**Backend action needed:** None yet — flagging that an AI-itinerary-
generation endpoint (enquiry → structured day/item list matching this
shape) is the real dependency once this moves past mock data.

---

## 2026-09-03 — Fixed squashed filter strip (regression from the Search-scroll fix)

**What changed:** The flight filter strip's dropdown pills got squashed
down to ~14px tall (well below their real ~32px content height) —
introduced by the same-day Search-scroll fix. Root cause: once the
strip's `overflow-x:auto` (added to hide its native horizontal
scrollbar) sat inside the new flex-column ancestor chain
(`.taw-results-panel` etc.), the CSS spec's overflow-x/y coupling
implicitly flipped its `overflow-y` to `auto` too — which switches a
flex item's default `min-height:auto` (content-based) to `0`, letting
the flex layout squeeze it far below its actual content height. Fixed
with `flex:none` on `.taw-filter-strip`, taking it out of the flex
sizing calculation entirely so it's sized by content again. Verified
live: dropdown pill height back to 32px (was 14px), strip 42px; the
Search-card-never-scrolls-itself fix from earlier today still holds.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Scrollbar color changed to medium-light grey

**What changed:** The shared `SleekScroll` thumb color (`.taw-sleek-
scroll-thumb`, used everywhere — Queue, flight search results) changed
from the sand-gold-ivory tone to a neutral light grey (`#D4D4D4`,
after a first pass at `#BDBDBD` was asked to go lighter). Still a
single shared rule, so every current usage stays in sync automatically.
Verified live: `rgb(212, 212, 212)`.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Search window no longer has its own scrollbar

**What changed:** The Search card's body (`.taw-card-b`) had its own
native `overflow-y:auto`, same as every other card — but once flight
results grew past the card's grid-track height, that outer scrollbar
ALSO kicked in around the whole Search window, on top of the results
list's own inner `SleekScroll` scrollbar. Fixed with a proper
`min-height:0` flex chain (the same pattern used for the app-shell
height cap) from the Search card body down through `.taw-search-stack`
→ `.taw-fdesk` → `.taw-results-view` → `.taw-results-panel` to
`.taw-results-scroll`, so only the actual offers list — the one piece
that truly overflows — scrolls; the search header, leg switcher, and
filter strip stay fixed in place above it. Also dropped the results
scroll region's old fixed `max-height:560px`, since it now properly
fills whatever height the card actually has instead of an arbitrary
constant. Verified live: `.taw-card-b` no longer has its own scroll
(`scrollHeight === clientHeight`) while the inner results content does
(1821px in a 477px view), the outer page stays non-scrollable, and
scrolling the results leaves the header/filter strip in place.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/components/panels/SearchDesksPanel.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — markup/CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — One shared scrollbar style for every SleekScroll usage

**What changed:** The custom scrollbar (`SleekScroll`) had a Queue-only
color override (`.taw-enq-scroll .taw-sleek-scroll-thumb`) while every
other usage fell back to a neutral grey default — so Queue and the
flight search results scrollbars looked different. Removed the
override and made the sand-gold-ivory tone (`#D9CDAE`) the single
default for `.taw-sleek-scroll-thumb`, so every current and future
SleekScroll instance shares the same color, width (6px thumb / 8px
track), and always-reserved-space behavior. Verified live: Queue and
search-results thumbs both compute to `rgb(217, 205, 174)` at 6px.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Filter strip scrollbar hidden; search results get the sleek scrollbar

**What changed:** The flight filter strip's horizontal native scrollbar is
now hidden (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`)
— it still scrolls sideways, just without a visible bar. The flight
search results list now uses the same custom `SleekScroll` component
built earlier for Queue, replacing its old native `overflow:auto`
scrollbar, so its scrollbar behaves consistently (constant-width thumb,
reserved track) with the rest of the app. Verified live: filter strip
reports `scrollbar-width:none` while still scrollable (560px content in
a 330px viewport), and the results list renders a 6px `SleekScroll`
thumb inside an 8px track.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — markup/CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-03 — Button hover no longer shifts; scrollbar/border colors softened

**What changed:** Four small polish fixes to Console:
1. Removed the `translateY` hover/active transform from `.taw-btn` and
   `.taw-btn--primary` — buttons no longer shift vertically on hover
   (confirmed live: `getBoundingClientRect().top` identical before/after
   hover, `transform:none`). Scrollbar thumb width was also re-verified
   to stay a constant 6px through a scroll interaction — it already did,
   no change needed there.
2. Queue scrollbar thumb lightened from a medium brown (`#C4A077`) to a
   lighter, desaturated sand-gold-ivory tone (`#D9CDAE`) per request for
   something more subtle.
3. Secondary button (`.taw-btn`, e.g. "Start from scratch") hover border
   changed from `var(--ink)` (near-black) to `#DDD6C4` — a slightly
   darker shade of its own `--bone` (`#F1EAD8`) hover fill, so the
   border reads as a shade of the fill rather than a hard black outline.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Console header icons match sidebar icon size (20px)

**What changed:** Queue/Traveller Profile/Itinerary Builder/Search header
icons were a mix of 16px and 18px; the sidebar's own nav icons
(`ShellChrome.tsx`) are 20px. Bumped all four to 20px for consistency.
Scoped to just these four Console card/accordion headers, not every
`Icon` usage app-wide. Verified live: all four now report `width="20"`,
matching the sidebar's own icon size exactly.
**Files touched:** `src/components/panels/QueueProfileAccordion.tsx`,
`src/components/panels/WorkbenchTab.tsx`,
`src/components/panels/SearchDesksPanel.tsx`.
**Data/API status:** n/a — markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Avatar sized to content height + 4px

**What changed:** Avatar (was 40px, a guessed shrink from the earlier
"make it smaller" request) resized to match the actual measured height
of the name+meta content block beside it, plus 4px — 78px (content
measured live at 74.39px). Radius/initials font-size scaled up to match
(16px/24px). `.taw-m360-hero`'s existing `align-items:center` centers
both on the same vertical midpoint — confirmed live: avatar 78px tall,
content 74.39px, both share the exact same center Y coordinate.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Search header icon sized down

**What changed:** All four header icons (Queue/Traveller Profile/
Itinerary Builder/Search) were already exactly 20px and perfectly
centered with their titles, verified live — the perceived size
difference was the magnifying-glass glyph's own visual weight, not an
actual box-size mismatch. Per the fallback instruction, sized Search's
icon down to 18px. Confirmed still perfectly centered afterward.
**Files touched:** `src/components/panels/SearchDesksPanel.tsx`.
**Data/API status:** n/a — markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Traveller Profile hero: tier chip, tags moved, smaller avatar/name

**What changed:**
1. "INFINIA" (member tier) moved from the outer accordion header's plain
   eyebrow text (`.sub`, `QueueProfileAccordion.tsx`) into Member360's own
   hero row as a proper chip (`.taw-chip--tier`) — in the exact slot the
   trip-purpose chip used to occupy.
2. The trip-purpose chip ("Business") moved below the description, now
   alongside a new group-type tag ("Solo", from `ask.groupType`) in their
   own row.
3. That tag row is horizontally scrollable — new `.taw-tags-scroll`
   modifier (`flex-wrap:nowrap;overflow-x:auto`, chips `flex:none` so they
   don't shrink to fit instead of scrolling).
4. Avatar 56px → 40px (radius 14px → 10px, initials 22px → 15px). Name
   16px/500 (went through 15px/700 → 16px/500 per two follow-up
   corrections with exact numbers). Meta line 12px → 14px.
Verified live for all of the above via computed styles and a screenshot.
**Files touched:** `src/components/panels/Member360.tsx`,
`src/components/panels/QueueProfileAccordion.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS/markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Itinerary Builder: two-button start (AI vs. scratch), placeholder only

**What changed:** Itinerary Builder used to show either the mock
`ai_draft` read-only (flight/hotel cards with reasoning/mismatch flags)
or a generic "not built yet" message once an enquiry was selected. That
entire read-only draft display is REMOVED. Once an enquiry is selected,
it now shows a two-button chooser instead: **Generate AI Itinerary**
(primary) and **Start from scratch** (secondary) — per direct scope call,
both currently lead to a PLACEHOLDER only (a stand-in message naming
which path was picked, with a "Back" link to the chooser) — no API call,
no actual editing yet. The real editable itinerary builder (what each
path should actually produce, what's editable, whether an AI-generation
endpoint is real or mocked) is an explicitly separate, later build — this
was scoped down to just the entry-point buttons + placeholder on request.
Resets to the chooser whenever a different enquiry is selected (verified
live — switching from Arjun Mehta's placeholder to Priya Kapoor showed
the chooser again, not a stale placeholder). The old "no enquiry
selected" empty state is unchanged in spirit, just reworded to match the
new flow.
**Files touched:** `src/components/panels/WorkbenchTab.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): n/a — this entry point has no data dependency of
  its own; enquiry selection itself is unchanged.
- Needs backend attention: N/A yet — deliberately deferred. No
  AI-itinerary-generation endpoint exists anywhere in this codebase;
  whoever picks this up next will need to decide its shape (see the
  understanding/plan discussed before implementing this pass) before the
  "Generate AI Itinerary" button can do anything real.
**Env vars added/changed:** none.
**Backend action needed:** None yet — flagged above for whoever builds
the real editable itinerary + AI-generation call next.

---

## 2026-09-02 — Custom scrollbar for Queue (native scrollbars couldn't guarantee this)

**What changed:** The medium-brown/reserved-space Queue scrollbar from an
earlier entry looked right in computed styles but, per direct report,
wasn't actually VISIBLE at rest — only while actively scrolling. Root
cause: several browsers' overlay-scrollbar implementations (macOS's in
particular) fade the thumb out when scrolling stops, and this is a
browser/OS-level policy that `::-webkit-scrollbar` styling can't reliably
override everywhere — no further native-CSS tweak could guarantee "always
visible while overflowing, whether or not the user is scrolling" across
browsers. Built a small custom scrollbar component instead
(`src/components/ui/SleekScroll.tsx`): the native scrollbar is hidden
entirely, and a real DOM thumb is rendered in its place, positioned from
actual `scrollTop`/`scrollHeight`/`clientHeight` via a scroll+resize
listener plus a no-deps `useLayoutEffect` (so it re-measures on every
render, catching content changes — e.g. enquiries added/removed — that a
`ResizeObserver` on the scroll container wouldn't, since that only
observes the container's own box size, not its scrollable content size).
Visibility is now under our own control, not the browser's: shown exactly
when `scrollHeight > clientHeight`, regardless of interaction. The track
column is a fixed 8px width, ALWAYS present, so the reserved-space
requirement holds whether or not the thumb is currently rendered — no
reflow when overflow starts/stops.

Found and fixed a real bug while building it: an unconditional `setState`
inside the no-deps `useLayoutEffect` retriggered a render every time
(even when nothing had changed), which retriggered the effect again —
"Maximum update depth exceeded." Fixed by comparing against current state
and returning the SAME object reference when nothing changed, so React's
bailout optimization stops the loop.

Reusable (not Queue-specific) — `.taw-enq-scroll` is the one place the
thumb is recolored medium-brown (`--cognac`); other future usages default
to a neutral tone. Verified live: Queue's list (745px of content in a
341px visible area) shows a persistent brown thumb with no interaction at
all, screenshotted to confirm.
**Files touched:** `src/components/ui/SleekScroll.tsx` (new),
`src/components/ui/index.ts`, `src/components/panels/EnquiryInbox.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — UI only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Dropdown menu polish: no icons in Sort's list, wider Departure-time with distinct icons, borders/shadow fixed for portaled popups

**What changed:**
1. Sort dropdown's OPEN list no longer repeats the sort icon on every row
   (new `hideOptionIcons` prop on the shared `Dropdown` component) — the
   closed trigger still always shows it (every `SORT_OPTIONS` entry
   shares the same icon, so `Dropdown`'s "show the current option's icon"
   behavior does that part for free).
2. Departure time dropdown widened (`.taw-filter-dd--wide`, min-width
   118px) and given a DISTINCT icon per option instead of a repeated
   clock — new `sunrise`/`sun`/`sunset`/`moon` icons alongside the
   existing `clock` (Any time). Padding corrected to match every other
   filter-strip dropdown exactly (`6px 10px` — an earlier pass had
   accidentally left it at a mismatched `7px 10px` with an extra
   `padding-left:12px` override).
3. **Real bug found**: after the dropdown popup started rendering via a
   React portal to `document.body` (an earlier entry, to escape ancestor
   `overflow:hidden` clipping), its box-shadow silently stopped working —
   `var(--whisper)` is a CSS custom property scoped to `.taw`'s own rule
   block, and a portaled element sits OUTSIDE `.taw`'s DOM subtree, so
   the variable no longer resolved there. Fixed by using the underlying
   global `:root` token (`var(--shadow-sm)`, now `var(--shadow)` per the
   follow-up below) directly instead of the `.taw`-scoped alias.
4. Per direct request, all dropdown-menu popups (every `Dropdown`
   instance AND `AutosuggestInput`'s from/to typeahead, since they share
   `.taw-typeahead-list`) now have a `#F8F8F8` border on the left/right/
   bottom edges (none on top — flush against the trigger) — reversing an
   earlier pass that had removed all three over a since-resolved concern
   about apparent 1-2px width mismatch. Shadow bumped from `--shadow-sm`
   to the slightly more prominent `--shadow` per a same-day follow-up.
Verified live: Sort's list has zero icons, Departure-time's trigger/list
show the four distinct icons plus clock, all four filter-strip dropdowns
report identical `6px 10px` padding, and the popup's box-shadow now
actually computes to a real value (was `none` before the `--shadow-sm`
fix).
**Files touched:** `src/components/ui/Dropdown.tsx`,
`src/components/ui/Icon.tsx`, `src/components/panels/FlightDesk.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — UI only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Flight results filter strip rebuilt; real technical-stop vs. connection distinction

**What changed:** Built after a plan-for-review. FlightDesk's results
filter bar (previously a mixed row of segmented buttons, a toggle, two
native selects, a spacer, and a labeled select) is now ONE horizontally-
scrollable strip of dropdowns + a chip, in order: **Sort** (leading sort
icon, always visible regardless of which option is picked — every
`SORT_OPTIONS` entry carries the same icon, so `Dropdown`'s "show the
current option's icon" behavior does this for free) → **Departure time**
→ **Carrier** → **Stops**, then the **Refundable** chip (was an isolated
toggle button; selected state now also swaps its shield icon for an X, so
it reads as "click to remove" rather than just a color change).

The Stops dropdown replaces a bare stop-COUNT filter ("All"/"Non-stop"/
"≤1 stop") with the actual airline distinction requested: a **direct**
flight can still touch down at an intermediate airport for a technical/
fuel stop WITHOUT a plane change (same flight number) — genuinely
different from a **connecting** flight, which requires changing planes
because there's no direct routing. New options: Non-stop, Direct
(technical stop), Connecting, Overnight layover, Multiple connections.
Added `classifyStopType()` (`mockFlightSearch.ts`) — derives this from
`segments`: same flight number across every segment = direct; different
flight numbers = a real connection, further split into overnight (6h+
layover) or multi (2+ plane changes). Works on real API offers too, not
just mock ones — it only reads `segments`/`stops`, already part of the
real shape (the captured real dataset's Qatar Airways offer, e.g.,
already has two DIFFERENT flight numbers across its segments — a genuine
connection this classifier now actually recognizes).

`buildMockFlightOffers()` rebuilt to generate a real mix of all 5 stop
types (cycling every offer through nonstop/direct/connecting/overnight/
multi) instead of a flat 0-or-1 stop count — needed for the new filter to
have anything meaningful to filter BY in local dev. Verified live: an
8-offer result set split 2/2/2/1/1 across the five types, and selecting
each Stops option correctly narrowed to just that bucket.

Also removed the "Showing X of Y offers" line per direct request.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/lib/mockFlightSearch.ts`, `src/components/ui/Icon.tsx` (new `sort`
and `x` icons), `src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): the stops classification reads real-shaped
  fields (`segments[].flightNo`, arrival/departure times) — no schema
  change needed for it to work against real API responses.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Queue scrollbar: medium brown, space always reserved

**What changed:** Queue's own scrollbar (`.taw-enq`) split out from the
shared taupe/`--line-2` scrollbar every other scrollable area
(`.taw-acc-body`, `.taw-card-b`) uses, into its own dedicated style per
direct request:
1. **Medium brown** — `var(--cognac)` (#9C6B3F, already an existing
   design token), not the neutral taupe used elsewhere.
2. **Space always reserved on the right**, whether or not the list is
   actually overflowing right now — `scrollbar-gutter:stable`, so Queue's
   own width never shifts by a few px the moment a row gets added/removed
   and it starts/stops needing to scroll.
Verified live via computed styles: `scrollbar-gutter: stable`,
`scrollbarColor: rgb(156, 107, 63)` (= `--cognac`).
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — App shell capped at viewport height; every panel scrolls internally

**What changed:** A real, global layout fix, built after a plan-for-review
and an explicit scope confirmation (global, not just Console): no route
should ever need the whole page/window scrolled — every screen's own
content scrolls internally instead.
1. **The shared shell** (`.taw`, used by every route's own layout.tsx)
   changed from `min-height:100vh` (a FLOOR — content could still grow
   taller and the page would scroll past it) to `height:100vh;
   overflow:hidden` (an actual CAP). This is what makes "no window ever
   needs full-page scroll" true everywhere, not just here.
2. **`.taw-main`** gets `min-height:0` (so it can actually shrink within
   the now-bounded shell instead of forcing it taller) plus its own
   `overflow-y:auto` as a general fallback — any route whose content
   doesn't fit scrolls there (under the fixed top chrome), not the whole
   window.
3. **Traveller Profile** (`QueueProfileAccordion.tsx`) now ALWAYS renders
   a body — previously only when it was the open accordion section.
   When it's collapsed OR open-but-no-member-selected, it shows a
   placeholder (plain user icon + short description) instead of nothing;
   per direct confirmation, collapsed and empty share this same
   placeholder for now. A new `.taw-acc--profile` min-height (214px,
   measured from the actual rendered placeholder) means it never
   shrinks to just its header row.
4. **Queue and Traveller Profile now correctly split whatever height the
   column actually has** — whichever is open gets the rest via
   `.taw-acc.is-open{flex:1;min-height:0}`, the collapsed one is pinned
   to its natural/min-height. Found and fixed a real CSS Grid gotcha
   along the way: grid items ALSO default to `min-height:auto` (=
   content size), same as flex items — this was silently overriding
   `align-items:stretch` on the whole `.taw-cols-3` row (a column
   measured 922px tall inside a 607px track!) until `.taw-cols-3>*
   {min-height:0}` was added.
5. **Queue's list (`.taw-enq`) and every card body (`.taw-card-b`,
   `.taw-acc-body`)** now actually scroll internally when their content
   is taller than their allotted space, with a new sleek thin/themed
   scrollbar (Firefox `scrollbar-width/-color`, WebKit
   `::-webkit-scrollbar*`) replacing both the OS default AND the
   earlier `scrollbar-width:none` on `.taw-enq` (which hid the
   scrollbar entirely — functional but invisible, silently clipping a
   long Queue with no visible indication more existed).
6. **Search's card** (`SearchDesksPanel.tsx`'s animated full-height
   state) needed the same treatment — `.taw-card` didn't have a flex
   context at all, so a long results list had nowhere to go but
   overflow past the card's own bounds. `.taw-card{display:flex;
   flex-direction:column}` + `.taw-card-b{flex:1;min-height:0;
   overflow-y:auto}` fixes this per direct request ("even search window
   will take up the whole height but is capped, and search results will
   be scrollable within the window itself").
Verified live end to end: `document.documentElement.scrollHeight` exactly
equals `window.innerHeight` (720px both, no page scroll) in every state
tested — default Queue/Profile view, and after a full flight search with
8 results (Search card capped at 606.9px matching Itinerary Builder
exactly, its results area independently scrollable at 570px of visible
space against 913px of content).
**Files touched:** `src/components/panels/QueueProfileAccordion.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — layout/CSS only, no data changes.
**Env vars added/changed:** none.
**Backend action needed:** None. Worth a broader pass later across other
routes (Orders board, Journeys, etc.) to confirm none of them relied on
whole-page scroll for content that doesn't yet have its own internal
scroll region — `.taw-main`'s new `overflow-y:auto` fallback should catch
most cases reasonably, but wasn't individually audited per-route this
pass.

---

## 2026-09-02 — Date chips: paged not scrolled, default selection, one-way pill

**What changed:** Three follow-up corrections on the round-trip/date-chip
feature above:
1. Date chips no longer scroll (`overflow-x:auto` removed) — now show a
   fixed `CHIP_WINDOW_SIZE` (5) window with `</>` paging buttons
   (`.taw-icon-btn`, same style as the back button) flanking the row,
   disabled at each end. Verified live: clicking next advanced the
   visible window (20–24 Sept → 21–25 Sept) with no scrolling.
2. A chip is now selected by default instead of "all dates merged" —
   the actual searched date for whichever leg is active (departure date
   for outbound, return date for return), via a new
   `defaultChipDateFor(leg)` helper, applied both on initial search and
   on every leg switch. Verified live: after a round-trip search for
   24 Sept, the "24 Sept" chip was pre-selected.
3. One-way searches now render the SAME pill container as round-trip
   (for visual consistency) but as a single inert tab reading
   "DEL → DXB · 24 Sept" (route and date joined with a middle dot) —
   the second tab simply isn't rendered, since there's nothing to switch
   to. Verified live.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — UI/interaction only, no data changes.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — FlightDesk: real round-trip (departure/return switcher) + date-chip filter

**What changed:** A real feature, not just styling — built after presenting
a plan for review (round-trip data gap, mock-data approach, and filter
mechanics all confirmed before implementing):
1. **One-way vs round-trip is now decided by the Arrival field itself** —
   `form.returnDate` defaults to empty (was auto-filled). If it has a
   value when Search is clicked, that search is treated as round-trip;
   empty = one-way. This is evaluated fresh in `run()` every time, not a
   separate toggle.
2. **Results header simplified**: removed the "New search" text label and
   the `DEL → DXB · date` summary line entirely — just an icon-only back
   button now (`.taw-icon-btn`, 20px chevron, matching the app's other
   header icons instead of the old 12px `.taw-linkbtn` treatment).
3. **Departure/Return switcher** (`.taw-leg-switch`/`.taw-leg-tab`, a
   segmented pill, same row as the back button) — only rendered for a
   round trip. This is REAL, not cosmetic: `run()` now fetches the
   outbound leg (origin→dest, departure date ± nearby-dates window) AND,
   for a round trip, the return leg SEPARATELY (dest→origin, return date
   ± its own window) via a new `fetchLeg()`, and keeps them as two
   distinct arrays in `res` (`res.outbound` / `res.return`) rather than
   merging — switching tabs swaps which array is shown.
4. **New mock-data generator** (`buildMockFlightOffers` in
   `mockFlightSearch.ts`) replaces the single static
   `MOCK_FLIGHT_SEARCH_RESPONSE` for the search-fallback path (still used
   only when the real API call fails, same contract as before). It
   deterministically varies airline mix/price/times from a hash of
   route+date, so different dates AND different legs actually show
   different flights — verified live: switching Departure→Return leg
   changed both the visible date-chip range (20-26 Sep → 1-7 Oct) and the
   actual offers (Qatar Airways QR 622 → Thai Airways TG 809), not the
   same data relabeled.
5. **Date-chip row** (`.taw-date-chips`/`.taw-date-chip`) — only shown
   when "Include nearby dates" was checked (`res.nearbyDates`), listing
   the dates actually fetched for the CURRENTLY ACTIVE leg. Clicking one
   filters that leg's already-fetched offers down to just that day,
   entirely client-side (every date in the window was already fetched —
   no new request); clicking the active chip again clears back to "all
   dates merged." Verified live: 49 offers → 7 after picking one chip.
Styled in the app's own warm palette (bone/champagne/gold-deep), not the
reference screenshot's indigo/blue.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/lib/mockFlightSearch.ts`, `src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): both legs still attempt the real API first via
  `fetchOffersForDate`/`fetchLeg` — mock generation only fires on
  failure, same fallback contract as everything else in this desk.
- Needs backend attention: a round-trip search now fires up to 14 real
  flight-search calls in one click (7 dates × 2 legs, when nearby-dates
  is also checked) — flag this to whoever owns flight-search capacity/
  cost, same note as the earlier nearby-dates entry.
**Env vars added/changed:** none.
**Backend action needed:** None required to keep working (mock fallback
covers local dev), but flag the up-to-14-calls-per-click behavior above.

---

## 2026-09-02 — Traveller Profile hero: meta 12px, avatar refit to 2 lines

**What changed:** `.taw-m360-meta` (gender · DOB · company) 14px → 12px.
It was previously wrapping to 2 lines at this column's width, which broke
the "avatar matches content height" contract from an earlier entry —
added `white-space:nowrap` + ellipsis so it's guaranteed to stay on one
line (name + meta = exactly 2 lines total, as intended). Avatar resized
to match that new, shorter 2-line block: 78px → 49px (radius 16px → 10px,
initials 24px → 16px), measured live at 48.79px content height —
verified both share the same vertical center (299.99 vs 299.99).
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Dropdown popup no longer clipped by ancestor overflow

**What changed:** The Cabin/desk-picker `Dropdown` popup was getting cut
off partway down whenever its ancestor had `overflow:hidden` — most
visibly the Search card, which needs that for its own rounded corners
(the Search card being fit-content-sized now, per the entry below, made
this much more likely to actually happen in practice). Rewrote
`Dropdown.tsx` to render the popup via a React portal to
`document.body` instead of as a normal in-place child — the popup's
position is now computed in JS from the trigger's `getBoundingClientRect()`
(`position:fixed`, recomputed on open/scroll/resize) rather than relying
on a CSS-positioned ancestor, since a portaled element has no meaningful
DOM-relative parent to anchor against. Outside-click-to-close now checks
both the trigger root AND the portaled popup (previously only the root),
since the popup is no longer a DOM descendant of it. Verified live for
both usages of this shared component: Cabin's popup now extends past the
Search card's edge without being clipped, and the header desk-picker
(Flights/Hotels/Visas) still matches its trigger's exact position/width.
**Files touched:** `src/components/ui/Dropdown.tsx`.
**Data/API status:** n/a — UI only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Search card: fit-content by default, animated grow for results

**What changed:** Several related requests, all landed together:
0. Button text bumped to 14px (was 12px, inherited from the shared
   `.taw-btn`) — scoped to `.taw-btn--brown` specifically, not the shared
   class every other button uses.
1. Inset highlight tuned several more times — `0 1px 0 rgba(.5)` → `0
   0.2px 0 rgba(.25)` → `0 0.2px 0 rgba(.5)` → back to `0 1px 0 rgba(.5)`
   (the 0.2px offset turned out invisible — sub-pixel offsets with 0 blur
   round away to nothing on most displays; 1px is the smallest offset
   that actually renders).
2. The Search card used to always stretch to match the grid row's full
   height (Console's 3-column grid defaults to `align-items:stretch`)
   regardless of how little the form needed — confirmed via computed
   styles it was matching Itinerary Builder's height even when nearly
   empty. Now fit-content by default (new `.taw-card--fit`,
   `align-self:start`), verified live: 351px vs. Itinerary Builder's
   607px in the same state.
3. Removed the idle "Set a route and search to pull live flight
   inventory" illustration (and the empty-state block it lived in)
   entirely — with results now replacing the form instead of sitting
   below it, there's no longer a separate "nothing to show yet" filler
   state; the form itself is what's shown.
4. Results now REPLACE the form (`formView`/`resultsView`, mutually
   exclusive on `showResults = loading || res != null`) rather than
   appearing below it.
5. When results are shown (search fired, still loading or loaded), the
   whole Search card grows smoothly to the row's full height — verified
   live it lands exactly on Itinerary Builder's height (938.79px both) —
   then shrinks back to fit-content on "New search". The transition is a
   FLIP (pin current height → measure the new natural height by briefly
   clearing it → animate between the two pixel values, `height 320ms
   ease`) since `align-self` itself can't be transitioned directly;
   sampled the height at 0/30/80/150/250/400ms mid-transition and
   confirmed a smooth ramp (351→607→939px), not a snap.
6. Added a "New search" link (with the route/date shown alongside it)
   as the way back out of results to the form — verified live it clears
   results and restores the form/collapsed height exactly.
This required lifting a resize callback: `FlightDesk` reports
`showResults` up via a new `onExpandChange` prop; `SearchDesksPanel` owns
the actual card ref/animation (needed a small `containerRef` passthrough
added to the shared `Card` component). Hotels/Visas desks are unaffected
(still always-stretch) — this was scoped to Flights only.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/components/panels/SearchDesksPanel.tsx`, `src/components/ui/Card.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — UI/layout only, no data changes.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Search Flights button: dark brown variant

**What changed:** User asked to make the Search button dark brown, and
whether it already had a gradient/inset shadow — confirmed yes: the
shared `.taw-btn--primary` already has a top-to-bottom linear-gradient
and an inset highlight along the top inner edge (not the bottom). Added
`.taw-btn--brown`, a scoped modifier (not a recolor of `.taw-btn--primary`
itself, which is the shared primary-CTA look used elsewhere) with the
same gradient/inset-highlight/shadow structure in a coffee-brown palette
(`#6B4226` → `#3E2714`), text/spinner switched to `--ivory` for contrast
against the dark fill. Applied only to FlightDesk's Search Flights
button. Verified live: gradient and ivory text render correctly.
Follow-up: the inset top-edge highlight was too subtle against the dark
fill — bumped from `rgba(255,253,247,.15) 0 1px 0 inset` to
`rgba(255,253,247,.5) 0 2px 0 inset`, clearly visible now.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS/markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — area-header: gap→padding rebalance (title-to-tabs tighter, more room above title)

**What changed:** `.area-header`'s gap between "Enquiries" (h1) and the
nested tabs reduced 24px → 16px; the 8px removed was added to the
header's top padding (8px → 16px) instead, per direct request — the
header's total height is unchanged, just redistributed. Verified live:
`gap:16px`, `padding:16px 8px 0px 16px`.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Working area / header background colors

**What changed:** `.taw-main` (the working area beneath the header) set
to explicit `#FAF6EB` (matches the shared `--ivory` token it already
inherited — now explicit rather than incidental) and `.area-header` set
to `#FBF8F0`, then adjusted to `#FDFBF7` per follow-up — a subtly
lighter/warmer shade, creating a faint two-tone split between the header
and the content below it. Verified live: `rgb(250,246,235)` /
`rgb(253,251,247)` respectively.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Cabin field: native select replaced with custom Dropdown

**What changed:** Same issue as the earlier Flights desk-picker — a
native `<select>`'s own open option-list is the browser's unstyleable
system popup in every browser, so Cabin never actually matched the rest
of the app. Swapped it for the same `Dropdown` component (new
`triggerClassName="taw-input taw-select-dropdown"` skin — `.taw-input`
for the box, a new `.taw-select-dropdown` utility for
`justify-content:space-between` so the label sits left and the chevron
right, like a real select, instead of the header-segment context's
centered layout). Verified live: Cabin's trigger is exactly 132.35px
wide — pixel-identical to Pax beside it — height 39.5px matching every
other field, and its popup matches that width exactly with the same
Economy/Premium Economy/Business/First options.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — UI only, same `form.cabin` value/behavior.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — FlightDesk nearby-dates rebuilt again: checkbox + real merge

**What changed:** Replaced the just-built "Compare nearby dates" flow
(price-strip + one-click-to-search from the two entries below) entirely,
per direct request — that was iterating toward the wrong shape. Now:
a plain checkbox ("Include nearby dates (±3 days)") sits right before the
Search button. When checked, `run()` fires ±3 additional real searches
(via a new `fetchOffersForDate()`, factored out of the old single-date
call) and merges every date's actual offers into ONE results list — each
offer tagged with `_searchDate` and shown with a small date chip on its
card (visible only when a merge happened) — instead of a separate
price-only comparison. The lightweight `flight-shop` date_matrix call and
its whole UI (matrix/matrixBusy/loadMatrix, the price-strip) are gone.
When every date's real call fails (no backend reachable from local dev,
as usual), falls back ONCE to the single captured mock dataset rather
than stitching together N identical copies of it — verified live: 9 mock
offers rendered with the box checked, no crash, no duplication.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:**
- Needs backend attention: this now runs UP TO 7 real flight searches
  per click when checked (one per date in the ±3-day window) — worth
  knowing for rate-limiting/cost purposes once a real backend exists.
**Env vars added/changed:** none.
**Backend action needed:** None required, but flag the above (up to 7×
search calls per click) to whoever owns flight-search capacity/cost.

---

## 2026-09-02 — Correction: nearby-dates strip's horizontal scroll reverted

**What changed:** The entry below changed the nearby-dates strip's layout
from a wrapping grid to horizontal-scroll — that was MY OWN UX call while
reworking the click-to-search behavior, not something requested. Flagged
by the user ("why are the dates horizontally scrollable? when did I say
I wanted that?") and reverted back to `.taw-dx-grid` (wraps to fit,
1-2 per row) per their answer. The one-click re-search behavior and the
`.is-selected` highlight (both actually requested/kept) are unaffected —
only the scroll-vs-wrap layout changed back.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS/markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — FlightDesk nearby-dates: one click now searches, not two

**What changed:** UX rework, not just styling. "Check nearby dates" used
to show a price-only calendar (`flight-shop`'s cheap `date_matrix` call) —
picking a date only filled in the date FIELD, so the advisor then had to
notice that and click "Search Flights" again themselves to see that day's
actual flights. That's now one click: picking a date updates `form.date`
AND immediately re-runs a REAL search for it. The lightweight
`date_matrix` price-check itself stays (deliberately NOT replaced with
running N full searches up front, which would be much more expensive) —
it's what makes "is anything nearby actually cheaper" answerable without
paying for a full search per candidate date; a full search only fires for
whichever date the advisor actually picks. `run()` now takes an optional
date override for this; the strip itself changed from a wrapping grid to
a horizontally-scrollable row (7 pills, ±3 days, would otherwise wrap
awkwardly in this narrow column) and stays mounted after a re-search
(previously cleared) with the active date visually marked (`.is-selected`,
distinct from `.is-rec`/cheapest — a date can be both). Relabeled "Check"
→ "Compare nearby dates" to match what it now actually does. Verified
live: clicking a non-selected pill updated the date field (23→20 Sept),
re-ran the search, and marked that pill selected — all in one click.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — uses the same existing `flight-shop`
date_matrix + search endpoints, no new calls.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Hard Constraints: round bullets instead of square boxes

**What changed:** `.taw-m360-constraints li::before` was an outlined
square (checkbox-like); changed to a small filled round dot
(`border-radius:50%`, `background:var(--taupe)`).
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Pax/Cabin were vertically stacked, not actually side-by-side

**What changed:** Pax and Cabin (and the Search button) were rendering in
`.taw-row-3`, but a pre-existing rule — `.taw-search-stack .taw-row-2/3/4
{grid-template-columns:1fr}` — forces every `.taw-row-*` in this narrow
Search panel to a single column, so they'd always actually been stacked
vertically, not a real 3-column row. Rebuilt as a plain flex row (not a
`.taw-row-*` class, so that stacking rule doesn't apply) with a normal
12px gap between Pax and Cabin — NOT the flush/joined treatment used for
From/To and Departure/Arrival. The Search button moved to its own
full-width row below. Verified live: Pax and Cabin now share the same
top edge, equal width (132.35px each), 12px apart.
**Files touched:** `src/components/panels/FlightDesk.tsx`.
**Data/API status:** n/a — markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Switch button icon off-center: inherited padding was the cause

**What changed:** The swap icon inside the Switch button looked shifted
toward the top-left instead of centered. Cause: the button shares the
`.taw-input` class (for a matching height — see the entry below), which
also carries `.taw-input`'s own `padding:10px 12px` — never overridden.
That squeezed the actual centered area down to ~12px, smaller than the
16px icon itself, inside the button's fixed 38×39.5px box, so
`place-items:center` was centering the icon within a shrunken/asymmetric
leftover area rather than the full box. Added `padding:0` to
`.taw-join-btn`. Verified live: the icon's gap from each edge of the
button is now symmetric (11px left/right, 11.75px top/bottom). Also
confirmed, while investigating, that From/To were already exactly equal
width (120.35px each, via their shared `flex:1` wrappers) — no fix needed
there, a separate question raised at the same time.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Switch button height fix + desk-picker fill darkened

**What changed:**
1. The Switch button (From/To) was 1-1.5px shorter than the input fields
   beside it. First attempt: give it the same padding/border/font-size as
   `.taw-input` — still off, because `display:grid` sizes a button off
   its grid item's own intrinsic height (the 16px icon), not the text
   input's line-height-driven height (13.5px font, `line-height:normal` →
   measured 17.5px) the way a real `<input>` does. Made that explicit:
   `height:39.5px` (10+10 padding + 1+1 border + 17.5 line-height).
   Verified live: both now measure exactly 39.5px. Also changed the
   button's fill from `var(--card)`/`var(--bone)` to `#F8F8F8`/`#EFEFEF`
   (resting/hover), matching the light-grey language used elsewhere.
2. The Search header's desk-picker segment fill darkened from `#F8F8F8`
   to `#F2F2F2`, per direct request — the closed selector should read as
   a slightly more present surface than the lighter `#F8F8F8` hover fill
   inside its own popup menu.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS/markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Dropdown selected color + FlightDesk: joined From/To and Departure/Arrival

**What changed:**
1. Dropdown selected state (`.taw-dropdown-item.is-active`) changed from
   the gold accent to a darker neutral — `var(--ink)` at `font-weight:600`
   — for both icon and label.
2. FlightDesk's From/To fields are now one joined control: From has sharp
   right corners, To has sharp left corners, meeting flush with a
   `Switch` button between them (new `swap` icon — two opposing
   horizontal arrows) that swaps origin/destination on click. New
   `.taw-join-row`/`.taw-join-btn`/`.taw-sharp-l`/`.taw-sharp-r` utility
   classes (reusable — not FlightDesk-specific).
3. The single "Date" field is now "Departure" + "Arrival", same joined
   treatment, no Switch button between them. This is a REAL functional
   addition, not just visual — FlightDesk was one-way-only before (no
   return date anywhere in state or search params); confirmed with the
   user before building it. Added `returnDate` to form state (defaults a
   week after the default departure) and wired it into both search paths
   (`fastapiFlightSearch` and the legacy `searchFlights` params) as
   `returnDate`. Arrival's `min` is tied to the Departure date so it can't
   be set earlier.
Verified live: From/To corners (`9px 0 0 9px` / `0 9px 9px 0`), swap
button sharp (`0px`) and functional (click swapped DEL⇄DXB), Departure/
Arrival same corner treatment with no button between them, Arrival's
`min` correctly tracks Departure.
**Files touched:** `src/components/panels/FlightDesk.tsx`,
`src/components/ui/Icon.tsx`, `src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): `originCode`/`destCode`/`date`/`pax`/`cabin` —
  unchanged, already real params.
- Needs backend attention: `returnDate` is a new param on both
  `fastapiFlightSearch` and the legacy `flight-search` edge function —
  neither is confirmed to support round-trip search; if not, this field
  is currently accepted but silently ignored server-side.
**Env vars added/changed:** none.
**Backend action needed:** Confirm/add round-trip support (a `returnDate`
param) on the flight search endpoint(s) — otherwise the new Arrival field
has no real effect on results yet.

---

## 2026-09-02 — Desk-picker popup: removed the border that made it look misaligned

**What changed:** User reported the popup looked 1-2px wider than the
trigger. Measured precisely via `getBoundingClientRect()`: the popup and
trigger boxes were exactly pixel-identical on both edges — not an actual
size/position mismatch. The visual discrepancy was the popup's own
1px `border` (inherited from the shared `.taw-typeahead-list` base rule)
— a hairline border's anti-aliased stroke can visually bleed a fraction
of a pixel past a plain color-fill edge, and the trigger/segment has no
border of its own on those sides to match against. Removed left/right/top
border on `.taw-dropdown-list`; kept the bottom border for a defined
lower edge, and the existing box-shadow still gives the popup its visual
depth.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Header icon alignment, chevron-only rotation, dropdown polish/revert

**What changed:** Four more items on the same area, all verified live:
1. **Header icon vertical alignment**: Itinerary Builder/Search icons sat
   ~1.6px off-center from their title text (Queue/Traveller Profile were
   already exact). Cause: `Card.tsx` wrapped its `icon` prop in an extra
   `<span>{icon}</span>`, which `.taw-acc-h` (Queue/Profile's own header,
   not built via Card) never had. Removed the wrapper — icon renders
   directly, matching how `.taw-acc-h` already did it. All four headers
   now measure exactly 0px vertical-center difference between icon and
   title.
2. **Chevron-only rotation bug**: adding a leading desk-icon to the
   trigger earlier accidentally made IT rotate 180° on open too — the
   rule was `.taw-dropdown-trigger[aria-expanded="true"] svg` (any svg
   child), which was fine when the chevron was the only one. Gave the
   chevron its own `.taw-dropdown-chevron` class and scoped the rotation
   to just that.
3. **Selected row now also hovers**: the selected option previously
   showed no fill ever, even on hover — added
   `.taw-dropdown-item.is-active:hover{background:#F8F8F8}` (same
   specificity as the plain `.is-active` rule, written after it, so it
   wins when both apply).
4. **Reverted the sidebar-matched fill/text** from two entries ago
   (`var(--bone)`/`var(--muted)`) back to the plain `#F8F8F8` fill and
   `var(--ink)` text, per direct request — the segment/trigger no longer
   tries to visually match the sidebar.
**Files touched:** `src/components/ui/Card.tsx`,
`src/components/ui/Dropdown.tsx`, `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — UI only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Desk-picker: trigger icon + selected icon also goes accent

**What changed:** Two follow-up fixes on the same dropdown, per direct
feedback with a screenshot: the closed trigger ("Hotels ⌄") had no
leading icon even though every open-list row did — added one, matching
the currently-selected option's icon. And the selected row's icon stayed
neutral while its label went gold — the first pass deliberately excluded
the icon from the accent color, which was wrong; both now turn
`var(--gold)` together (the icon via `currentColor` inherited from the
row's own color, the label via its own explicit color).
**Files touched:** `src/components/ui/Dropdown.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — UI only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Desk-picker dropdown: icons, states, and sidebar-matched fill

**What changed:** Several polish items on the Search header's desk-picker
dropdown (`Dropdown.tsx`), all verified live:
1. Popup's top corners now sharp (`0px`, flush against the trigger),
   bottom corners stay rounded (`9px`) — added
   `.taw-typeahead-list.taw-dropdown-list` overrides for this since the
   popup shares its base look with AutosuggestInput's from/to typeahead,
   which was left untouched.
2. Every option row (Flights/Hotels/Visas) now has a leading icon —
   `Dropdown`'s `options` take an optional `icon` (an `Icon` name),
   `SearchDesksPanel`'s `DESKS` array now passes `flight`/`hotel`/`visa`.
3. Selected state: no fill at all now — only the label text turns the
   bright gold accent (`var(--gold)`). Scoped to just the label span
   (`.taw-dropdown-item-label`), not the icon, since an SVG's stroke would
   otherwise inherit the accent via `currentColor`.
4. Hover: sharp corners + a plain light-grey fill (`#F8F8F8`), replacing
   the shared `--bone` hover the base `.taw-typeahead-item` uses.
5. The trigger/segment itself — previously a plain `#F8F8F8` fill — now
   uses `var(--bone)` (the sidebar's own background,
   `.ta-shell-nav`/app-shell.css) and `var(--muted)` text (a sidebar nav
   item's resting text color), so it reads as the same "filled control"
   language as the sidebar instead of a bespoke grey.
All of 1-4 are scoped to Dropdown's own popup via a `.taw-dropdown-item`/
`.taw-dropdown-list` compound-selector override — AutosuggestInput's
from/to typeahead is untouched.
**Files touched:** `src/components/ui/Dropdown.tsx`,
`src/components/panels/SearchDesksPanel.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — UI only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Queue and Traveller Profile split into two separate cards

**What changed:** Queue and Traveller Profile were one shared bordered box
(`.taw-acc`) with an internal divider between the two accordion sections.
Split into two independent boxes — each now has its own border/radius/
shadow, like Itinerary Builder or Search — stacked with an 8px gap inside
a new `.taw-acc-stack` wrapper, still occupying the one shared left
column. The "Mode H" toggle interaction (mutual exclusion — opening one
collapses the other; auto-collapse-to-Profile on selecting an enquiry) is
UNCHANGED, verified live: clicking Traveller Profile's toggle still
correctly closes Queue and opens Profile.
**Files touched:** `src/components/panels/QueueProfileAccordion.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — markup/CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Traveller Profile: header polish, passport number, frequent flyer

**What changed:** Follow-up corrections against the same reference:
1. Name font size 24px → 15px.
2. Meta line: "Mr"/"Ms" → bare gender letter "M"/"F"; customer code
   (`CC-4471`) dropped entirely.
3. Header's "Reply" button (never wired to anything) replaced by the
   trip-purpose chip ("BUSINESS"/"VACATION") — that chip previously
   duplicated in the Request section header too; now only shows once, in
   the header row.
4. Documents → Passport now shows the passport NUMBER too, not just the
   expiry year: `P1234567 · Valid to 2031`.
5. Missed on the first pass: the reference's third hard-constraint line
   ("Singapore Airlines · KF 8821 4470 3") was a frequent-flyer number,
   not flight class/stops — added `ask.flight.frequentFlyer` to Arjun's
   mock enquiry and render it in the constraints line
   (`airline · stops · frequentFlyer`, joined only with whatever's
   present).
**Files touched:** `src/components/panels/Member360.tsx`,
`src/lib/mockEnquiries.ts`, `src/styles/advisor-workbench.css`.
**Data/API status:**
- Needs backend attention: `frequentFlyer` joins the existing list of
  mock-only enquiry fields with no real-schema equivalent yet.
**Env vars added/changed:** none.
**Backend action needed:** None beyond what's already tracked in the
original Traveller Profile entry below.

---

## 2026-09-02 — Fixed a real .taw-main gutter bug (not caching, not Console-specific)

**What changed:** After reverting to the standard capped/centered
`.taw-main`, the user asked why large gutters still appeared at a 1535px
screen width. This turned out to be a genuine pre-existing bug in
`.taw-main` itself (every screen that uses it, not just Console) —
`.taw-main` is a flex item of `.taw` (`display:flex;flex-direction:column`),
so its cross-axis size is width; an auto cross-axis margin on a flex item
disables the default stretch behavior (CSS Flexbox §8.3), so without an
explicit `width` the box was shrink-wrapping to its own content's natural
width instead of filling available space — with the leftover space
becoming large invisible margins. Measured live at 1535px: `.taw-main`
was only 1162px wide with ~160px of margin on EACH side, despite its
1480px cap having plenty of room. Added `width:100%` — this forces it to
fill its container first, and `max-width`/`margin:auto` then only clamp
and center it once the container genuinely exceeds 1480px, same as
intended. Verified live at both 1535px (now exactly 1480px wide, 1px
margins) and 1100px (now exactly fills its 1047px container, no cap
binding, no phantom margins).
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Console columns reverted, then re-widened on both sides

**What changed:** Reverted the two prior entries below (28%/50%/22% split
and the full-width `.taw-main--wide` modifier) per direct request — back
to `.taw-main`'s standard 1480px-capped, centered layout, and
`.taw-cols-3` back to `fr` units. Then, per immediate follow-up, widened
both SIDE columns (Queue/Traveller Profile, and Search) rather than just
the left one: `2fr 5fr 2fr` → `3fr 4fr 3fr` (~30%/40%/30%). Itinerary
Builder narrows from ~56% to ~40% but stays the largest single column.
Verified live: 29.5%/39.4%/29.5%.
**Files touched:** `src/styles/advisor-workbench.css`,
`src/app/(authenticated)/console/layout.tsx`.
**Data/API status:** n/a — CSS/markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Console: 3-column row now fills the full available width

**What changed:** Follow-up correction on the previous entry — the 28/50/22
percentage split was already correct and responsive, but the whole
3-column row was still capped by `.taw-main`'s shared 1480px max-width, so
on wider screens it sat centered with large empty gutters on both sides
instead of using the space. `.taw-main` is shared across multiple screens
(Journeys' prose reads better capped, for instance), so rather than
raising/removing that cap globally, added a scoped `.taw-main--wide`
modifier (`max-width:none`) applied only from `console/layout.tsx`.
Follow-up fix (same day): `max-width:none` alone didn't actually work —
the user still saw identical left/right gutters in the Claude Browser
pane itself (no caching involved). Root cause: `.taw-main`'s own
`margin:0 auto` (there to CENTER it while capped) fights `flex:1` once
the cap is gone — in a flex parent, auto margins absorb the container's
free space BEFORE flex-grow gets to, so `margin:0 auto` was silently
reappearing as the exact same gutters, just as invisible margin instead
of a width cap; `.taw-main`'s `flex:1` (defined elsewhere) never actually
got to grow. `.taw-main--wide` now also sets `margin:0`. Verified live at
the Browser pane's own width (1102px): `.taw-main` now measures exactly
1049px — the full width of its parent `.taw` — with zero gutters on
either side (screenshotted).
**Files touched:** `src/app/(authenticated)/console/layout.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS/markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Console columns: wider Queue/Profile stack, explicit percentages

**What changed:** `.taw-cols-3` (Console's 3-column row: Queue/Traveller
Profile | Itinerary Builder | Search) went from `2fr 5fr 2fr` to
`28% 50% 22%` — widening the Queue/Traveller Profile column from its
original ~22% share to 28%, and switching from `fr` units to explicit
percentages so each column's share is self-describing at a glance.
Behavior is unchanged either way — both are proportional/responsive to
the container's width — verified live at two different viewport widths
(1203px and 1456px effective grid width) that all three columns hold
their exact 28%/50%/22% split.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Traveller Profile rebuilt against a specific reference design

**What changed:** Rebuilt `Member360.tsx` (the "Traveller Profile" section
of the Queue/Profile accordion — position unchanged, still the second
accordion section in the left column) against a reference screenshot:
avatar + Name + "Mr · DOB · Company · Customer code" meta line + a Reply
button; a Request section (date + trip-type chip + the enquiry's message);
a Dates card (date range + a flexibility tag — "flexible"/"fixed"/"asap",
new vocabulary for different cases: shiftable, locked-by-circumstance, or
locked-and-urgent); a route/pax/budget-cap chip row; a Hard Constraints
checklist; and a 2-up Documents grid (Passport, Visa — Visa only rendered
when the member actually has visa data).

This needed data that didn't exist before, added to the 3 entries in
`src/lib/mockEnquiries.ts` only (NOT real Supabase data): member `gender`/
`dob`/`company`/`customer_code`/`visa_status`, and enquiry `ask.dateRange`/
`ask.dateFlex`/`ask.budgetCap`. Every new section is conditional on its
own data being present, verified live against the one REAL (non-mock)
enquiry in the dev database ("Bhanumathi S (test)", no `ask`/these member
fields at all) — it degrades to just avatar/name/Request-date/message/
Passport-only, not a broken or blank layout.

Also added `capLabel()` (`src/lib/advisorHelpers.ts`) for the compact
"₹2.4L"/"₹1.5Cr" chip format (existing `inr()` gives the full grouped
figure, right for a line item but too long for a small chip), and threaded
the already-computed `selectedEnquiry` from `WorkbenchTab.tsx` down through
`QueueProfileAccordion` as a new `enquiry` prop — `Member360` previously
only received `member`, with no access to the enquiry's own request data.

Dropped from the old version: the stat-grid (nationality/passport/points),
Preferences/Visas-held/Past-trips tag sections, and the inline "Invite
Customer" modal — a standalone Invite Customer flow already exists at the
shell level (`src/components/InviteCustomerForm.tsx`), so the inline one
was a duplicate, not a loss. "Reply" is new per the reference but is a
UI-only stub — no messaging/thread system exists in this port yet, so it
doesn't send anything.

Verified live for 3 cases: Arjun Mehta (solo, flexible dates, full data),
Priya Kapoor (family — "2 adults, 1 child" pax breakdown, fixed dates, no
visa card since domestic), and Bhanumathi S (test) (real DB row, graceful
degradation).
**Files touched:** `src/components/panels/Member360.tsx`,
`src/components/panels/QueueProfileAccordion.tsx`,
`src/components/panels/WorkbenchTab.tsx`, `src/lib/advisorHelpers.ts`,
`src/lib/mockEnquiries.ts`, `src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): member name/tier/email/phone and the enquiry's
  own `message`/`created_at` — these come from Supabase already.
- Needs backend attention: `gender`, `dob`, `company`, `customer_code`,
  `visa_status` on the member record, and `dateRange`/`dateFlex`/
  `budgetCap` on the enquiry's `ask` — none of these exist on the real
  schema yet; the whole reference design depends on them. "Reply" has no
  backend action at all yet (no messaging/thread system).
**Env vars added/changed:** none.
**Backend action needed:** Add the fields listed above to the member/
enquiry schema (or confirm where equivalent data already lives) so this
isn't mock-only forever; wire up whatever "Reply" should actually do.

---

## 2026-09-02 — Accordion header dividers always present; rows 12px all around

**What changed:**
1. Traveller Profile's own header divider disappeared whenever that
   section was collapsed — it's the LAST section in the accordion, so
   nothing in the DOM ever sat below its header to draw a line there. The
   earlier fix for this same issue on Queue only worked because Queue is
   followed by the shared `.taw-acc-div` node either way. Removed
   `.taw-acc-div` entirely and gave `.taw-acc-h` an unconditional
   `border-bottom` instead — both headers now draw their own divider in
   every open/collapsed combination, verified live for both states.
2. Queue row padding (`.taw-enq-item`) changed from `8px 12px` to a
   uniform `12px` on all sides.
**Files touched:** `src/styles/advisor-workbench.css`,
`src/components/panels/QueueProfileAccordion.tsx`.
**Data/API status:** n/a — CSS/markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Queue row line spacing: 8px between Name/Destination/Departure

**What changed:** `.taw-enq-meta` (destination + bookings) and
`.taw-enq-depart` (departure) margin-top went from 3px/2px to a uniform
8px each, evenly spacing the three stacked lines in a Queue row.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Queue selected-row accent: light grey instead of gold

**What changed:** The selected Queue row's left accent bar (`box-shadow:
inset 3px 0 0 ...`) was `var(--gold)`, reading as a warm gold-brown against
the new grey-fill hover/selected background. Went through `#EEEEEE` →
`#CCCCCC` (too light) → `var(--muted)`/#7A7263 (too dark) → settled on
`#999999`, the midpoint between the two.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — DevInspector: colors shown as hex, not rgb

**What changed:** `getComputedStyle` always normalizes colors to
`rgb()`/`rgba()`, which the dev inspect tool (press "I" to activate,
"L" to lock the tooltip) was showing verbatim — harder to eyeball or
paste into a design tool than hex. Added a `toHex()` formatter and wired
it into the color/background/border rows only (display-only: the
existing design-token match still looks up the raw rgb value against the
token map, so `"#171310 (--ink)"` still resolves correctly). Alpha <1
renders as 8-digit hex (`#1A17121A`). A composite/mixed border (e.g. only
`border-left` set, so `borderColor`/`borderWidth` come back as 4
space-separated values) isn't a single parseable color and is left as-is
— a pre-existing limitation of that row, not something this change
touches. Verified live: hex + token label render correctly for text
color, solid background, and a uniform 1px border.
**Files touched:** `src/components/DevInspector.tsx`.
**Data/API status:** n/a — dev-only tool, no data dependency.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Search desk dropdown: full-size keyboard target, flush popup

**What changed:** Follow-up polish on the custom `Dropdown` component from
the previous entry:
1. The clickable/focusable trigger only used to cover the "Flights" text
   itself (small inner padding), while the visible filled segment box
   around it was purely decorative — so the keyboard focus ring only ever
   hugged the text. Moved the segment's 14px horizontal padding onto the
   trigger button itself, and made the segment/dropdown/trigger all
   stretch to fill each other's full height — the button IS the segment
   box now, so its focus ring and click target cover the whole thing.
2. The popup menu now matches the trigger's exact width (`.taw-dropdown`
   is the popup's positioning root, and is now exactly the trigger's own
   box) and sits flush at its bottom (`top:100%`, no gap) instead of
   floating below with a visible gap and mismatched width.
3. Removed the popup's own outer padding (`.taw-dropdown-list`, a
   higher-specificity override so it isn't silently lost to the shared
   `.taw-typeahead-list` rule defined later in the same file) — only the
   individual option rows keep their own padding now, so hover/active
   fill runs edge-to-edge; added `overflow:hidden` so square item edges
   don't poke past the popup's own rounded corners.
Verified in-browser via `getBoundingClientRect()`: trigger height/edges
exactly match the segment, popup left/right/top exactly match the
trigger's edges, popup padding is 0 while item padding stays `8px 10px`.
**Files touched:** `src/components/ui/Dropdown.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS/markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Queue: padding back on rows, hover/selected match dropdown fill

**What changed:** Reverted the immediately-prior change (container-level
padding + row gap) per follow-up direction: `.taw-enq` (the list
container) is back to 0 padding with no gap, and `.taw-enq-item` rows
carry their own `8px 12px` padding again so the hover/selected fill still
reaches full row width edge-to-edge. Also changed row hover/selected fill
from the warm `--ivory`/`--champagne` tones to the same plain light grey
(`#F8F8F8`) as the Search header's desk-picker segment, for one
consistent filled-state color across the app.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Queue: gap between rows, container-level padding

**What changed:** Added an 8px gap between Queue rows (`.taw-enq`'s flex
gap), and moved padding from the row/body level up to the list container
itself: `.taw-enq` now carries `8px 12px` padding — matching the "Queue"
header's own padding exactly — while individual rows (`.taw-enq-item`) and
the accordion body wrapper stay at 0. Rows are still edge-to-edge with no
divider between them (per the earlier change); the visual inset now comes
from the container, not the rows.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:** n/a — CSS only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Search desk picker: custom dropdown to match from/to typeahead

**What changed:** The "Flights" desk picker in the Search header was a
native `<select>` restyled for its closed state, but a native `<select>`'s
own OPEN option-list is always the browser's unstyleable system popup in
every browser — it could never actually look like the from/to airport
fields' typeahead popup, no matter the CSS on the closed trigger. Added
`Dropdown` (`src/components/ui/Dropdown.tsx`) — a button + a real DOM popup
reusing the exact classes AutosuggestInput's popup uses
(`.taw-typeahead-list`/`.taw-typeahead-item`: card background, 9px radius,
padded rows, bone hover) — and swapped it in for the native select. Same
fixed 3-item list (Flights/Hotels/Visas), no live search, just a matching
look. Verified in-browser: opens with the shared popup styling, selecting
an option updates the trigger and closes the menu, click-outside/Escape
also close it.
**Files touched:** `src/components/ui/Dropdown.tsx` (new),
`src/components/ui/index.ts`, `src/components/panels/SearchDesksPanel.tsx`,
`src/styles/advisor-workbench.css`.
**Data/API status:** n/a — UI component only, no data dependency.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Queue accordion: persistent header divider, edge-to-edge rows

**What changed:**
1. The line separating the "Queue"/"Traveller Profile" header from its
   content (`.taw-acc-div`) previously only appeared when a section was
   *collapsed* — it lives in the DOM between the two sections, so when a
   section is expanded its own body pushes the divider further down,
   leaving the header's title row with no underline. Gave an
   open/expanded header its own `border-bottom` (`.taw-acc-h.is-open`) so
   the line stays directly under the title in both states.
2. Queue entries (`.taw-enq-item`) now go edge-to-edge: removed their own
   10px padding and the border-bottom divider between rows, and added a
   `.taw-acc-body.flush` modifier (applied only to Queue's body, not
   Traveller Profile's) removing the shared 12px body padding that was
   insetting the whole list.
**Files touched:** `src/styles/advisor-workbench.css`,
`src/components/panels/QueueProfileAccordion.tsx`.
**Data/API status:** n/a — CSS/markup only.
**Env vars added/changed:** none.
**Backend action needed:** None.

---

## 2026-09-02 — Queue row type hierarchy + area tabs gap + Search header segment

**What changed:** Three small follow-ups from the Queue row/Search header redesign:
1. Queue rows (`EnquiryInbox.tsx`) weren't visually differentiating Name vs.
   destination/bookings vs. departure — all three sat close in weight/color.
   Sharpened the existing 3-tier text hierarchy (no new colors, just
   existing tokens): Name is now bold (`--ink`, 700/14px), the
   destination+bookings meta line is medium-weight secondary (`--taupe`,
   500/12px), and the departure line is the lightest tertiary (`--muted`,
   400/11px). Also confirmed via computed-style check that Name+PAX were
   never actually misaligned — one enquiry ("Bhanumathi S (test)", a real
   Supabase dev-DB row, not in `mockEnquiries.ts`) simply has no PAX data,
   so nothing renders next to its name; every enquiry that does have PAX
   data renders it correctly inline.
2. `.area-tabs` (Workbench/Copilot/Broadcast top nav) gap: 24px → 8px.
3. Search header's desk-picker segment (`.taw-card-h-segment`): fill
   changed from `--bone` to a plain light grey (`#F8F8F8`), and its own
   corner radius removed — the outer `.taw-card` already clips its
   content to its own border-radius via `overflow:hidden`, so the
   segment's square top-right corner is clipped into the same rounded
   corner for free instead of needing a matching radius on the segment.
**Files touched:** `src/styles/advisor-workbench.css`.
**Data/API status:**
- Real (already wired): n/a — CSS/visual only.
- Needs backend attention: the "Bhanumathi S (test)" enquiry is a real
  seeded row in the dev Supabase database, not frontend mock data — it
  can't be removed from this repo; delete it directly in Supabase (or
  ask backend to) if it should go away.
**Env vars added/changed:** none.
**Backend action needed:** None for the CSS changes. Optional: delete the
"Bhanumathi S (test)" enquiry row from the dev database if it's just test
debris, per above.

---

## 2026-09-01 — Flight search: real captured data as local fallback, plus a live bug fix

**What changed:** Ran a real flight search (DEL→DXB, 2 pax, economy) on the
deployed advisor-panel (https://tripagent-admin.vercel.app, which has a
working backend) and opened every fare-detail sub-tab (fare families, fare
rules, ancillaries, seat map) to capture the actual API response shapes —
not invented data. Added `src/lib/mockFlightSearch.ts` with that captured
data (9 real offers; one full fare-detail fixture reused for whichever
offer the advisor expands). `FlightDesk.tsx`'s `run()` and
`FlightFareDetail`'s `load()` now fall back to this data ONLY when the
real API call fails — the real call always runs first, this isn't a
shortcut around it. Since there's no backend reachable from local dev,
this is what makes the whole Search Desks flow (search → results → fare
detail, every sub-tab) actually browsable here; a toast says "Live API
unreachable — showing demo flight data" so it's never silently mistaken
for a real result.
**Bug found and fixed along the way:** opening "Fare rules" crashed with
"Objects are not valid as a React child" — `fr.provenance` in the real API
shape is an object (`{source, fetched_at, ttl_minutes, live, note}`), but
the code rendered `{fr.source || fr.provenance}` directly. The original
vanilla-JS advisor-panel silently stringified this to "[object Object]"
instead of crashing; React throws instead. This is a real bug that would
hit live API data too, not an artifact of the mock — fixed to read
`fr.provenance.source`/`.note` when it's an object. Fixed the identical
pattern in the fare-family "Source:" line too (`ff.provenance`).
**Files touched:** `src/lib/mockFlightSearch.ts` (new),
`src/components/panels/FlightDesk.tsx`
**Data/API status:** N/A for the mock fallback (dev-only, local fallback
path, never reached when a real backend answers). The provenance-object
fix is a real bug fix that affects the real API path too.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Queue: rows separated by dividers, not individual card containers

**What changed:** `.taw-enq-item` (each enquiry in the Queue list) no
longer renders as its own bordered/background/rounded card — border,
background, and border-radius removed. Rows now sit flush against each
other, separated by a `border-bottom` divider (last row has none, so it
doesn't dangle against the list's own edge). Hover/selected states still
read clearly via background tint (`--ivory` / `--champagne`) and the
existing gold left-edge inset shadow on the active row — nothing about
selection/click behavior changed, purely visual.
**Files touched:** `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure CSS change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — area-header / taw-main padding tightened (24/20px → 12/8px)

**What changed:** `.area-header` (the page-title-plus-tabs block) and
`.taw-main` (the body content below it) — shared by Enquiries and Advisor
Workbench — tightened from `20px 24px` to `8px 12px` (header keeps its
bottom at 0, matching the existing "no redundant gap" pattern). `.area-tabs`'
full-bleed divider trick was updated in lockstep (`margin:0 -12px;
padding:0 12px`, was `-24px/24px`) since it only works when that value
matches `.taw-main`'s horizontal padding exactly — see the CSS docblock.
**Files touched:** `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure CSS change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Sidebar collapse: logo hidden, only the toggle remains

**What changed:** In the collapsed (icon-only rail) state, the TripAgent
shield mark now hides along with the wordmark — only the collapse/expand
toggle button stays visible at the top of the rail. Was previously stacked
above the toggle even when collapsed.
**Fix (same day):** The first attempt used a CSS `display: none` rule,
which didn't work — the shared `Icon` component sets `display:
inline-block` as an inline `style` attribute, which always wins over an
external stylesheet rule (inline style beats any non-`!important`
selector). Fixed by conditionally not rendering the icon at all in JSX
(`{collapsed ? null : <Icon .../>}`) instead of trying to hide it via CSS.
**Files touched:** `src/styles/app-shell.css`, `src/components/ShellChrome.tsx`
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Search header: dropdown inline with a real vertical divider, not its own box

**What changed:** Search's desk-picker `<select>` no longer sits in its
own bordered/background box in the Card header — it's now a plain,
borderless `.taw-select-plain` (transparent, no border/radius, just text
+ the browser's native arrow) separated from the "Search" title by an
actual vertical divider line (`.taw-card-h-divider`, `1px`, `var(--line)`,
stretched to the header's own height) instead of just spacing. Header
otherwise matches the standard Card header pattern already used
elsewhere (icon + title). Confirmed with the designer that "built like
the flight from-to dropdowns" meant visual-styling consistency with the
existing `.taw-select` used elsewhere (e.g. FlightDesk's Cabin,
VisaDesk's Destination/Category) — NOT rebuilding every dropdown as a
custom combobox, since a native `<select>`'s own open option-list can't
be restyled via CSS in any browser regardless. Those other selects
already use `.taw-select` consistently, so no changes were needed there.
**Verified:** confirmed via computed styles — divider renders with
`var(--line)`'s color; the plain select has `background: transparent`
and no border. No console errors.
**Files touched:** `src/components/panels/SearchDesksPanel.tsx`, `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Queue row trimmed to exactly 5 fields (per designer's reference)

**What changed:** `EnquiryInbox.tsx`'s row content rebuilt to show only:
name + pax, bookings required (flight/hotel/visa, joined with "+"),
destination, departure, and hours-since-enquiry — removed the tier chip,
channel chip (web/whatsapp), message preview, and the gold status dot.
Header/Card chrome and padding untouched, only the row content changed.
- **Name · pax**: `e.ask.persons.length` when present (mock enquiries
  only — real Supabase enquiries don't have `ask` yet, so pax is simply
  omitted for those, not shown as 0/undefined).
- **Bookings**: `intent.services` capitalized and joined with " + ".
- **Departure**: mock enquiries only carry a month (`ask.dates.month`),
  not an exact day, so this shows "Departs October" rather than
  fabricating a specific date; falls back to "No dates yet" (matching
  the reference's own empty-state wording) when absent.
- **Hours-since**: raw elapsed hours from `created_at`, no "SLA
  breached"/minutes framing — color still follows the real breach state
  via `enqSla()`'s `cls`.
Deleted now-fully-unused CSS: `.taw-enq-msg`, `.taw-dot`,
`.taw-chip--sla-ok`/`.taw-chip--sla-breach` (confirmed via grep — no
remaining references anywhere in `src/`).
**Verified:** all 4 rows (3 mock + 1 real) render correctly — mock rows
show pax/bookings/month, the real enquiry gracefully shows "No dates
yet" and no pax rather than breaking. No console errors.
**Files touched:** `src/components/panels/EnquiryInbox.tsx`, `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure UI change, same underlying data.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Queue/Traveller Profile accordion: toggle didn't work both ways — fixed

**What changed:** Real bug from the toggle-icon restructure above. Each
toggle unconditionally called `setOpen("queue")`/`setOpen("profile")` —
a no-op when clicking a section's own toggle while it was already open
(state doesn't change if you set it to what it already is), so there was
no way to collapse Queue from Queue's own toggle, or Profile from
Profile's. Since only two mutually-exclusive sections exist, replaced
both with one shared `toggle()` that flips to whichever section isn't
currently open — this correctly handles all four cases (click either
toggle, from either state) with one function.
**Verified:** all four cases confirmed via direct DOM assertions —
clicking Queue's toggle while Queue is open collapses it and opens
Profile; clicking Profile's toggle while Profile is open collapses it
and opens Queue; clicking either toggle while its section is already
closed opens it (unchanged from before). No console errors.
**Files touched:** `src/components/panels/QueueProfileAccordion.tsx`
**Data/API status:** N/A — pure UI logic fix.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Queue/Traveller Profile accordion: toggle-icon-only interaction; sidebar padding corrected to 8px/16px split

**What changed:**
1. **Sidebar right padding correction**: reverted to `8px` collapsed /
   `16px` expanded-only (a prior pass had briefly made it a uniform
   `16px` both states — corrected same day). Spacer width back to `53px`
   to match.
2. **Queue/Traveller Profile accordion (`QueueProfileAccordion.tsx`)** —
   the header row itself (`.taw-acc-h`) is no longer the click target and
   no longer shows a hover state; it's now a plain display row (icon,
   title, sub-label). Only the chevron is interactive, as its own
   `.taw-acc-toggle` button, styled to match the sidebar's own collapse
   toggle (`.ta-shell-collapse`) exactly — bare at rest, `--champagne`
   background on hover, same padding/radius. Clicking a section's toggle
   opens that section and collapses the other, in either direction
   (unchanged functionally — this was already the click behavior, just
   now scoped to the small icon instead of the whole row).
**Verified:** header rows confirmed `cursor: auto` (no longer
interactive-styled); `.taw-acc-h:hover` rule confirmed removed from the
stylesheet; `.taw-acc-toggle:hover` confirmed `background: var(--champagne)`
(matching the sidebar toggle); toggle confirmed `4px` padding/radius,
transparent at rest; clicking Traveller Profile's toggle confirmed it
opens and Queue collapses (and vice versa). No console errors.
**Files touched:** `src/components/panels/QueueProfileAccordion.tsx`,
`src/styles/advisor-workbench.css`, `src/styles/app-shell.css`
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Sidebar: right padding 16px (both states)

**What changed:** `.ta-shell-tab-inner`'s right padding is now `16px`
(was `8px`, uniform) — top/left/bottom stay `8px`. Same in both
collapsed and expanded states. Nav's collapsed `fit-content` width grew
accordingly (`53px → 61px`); the layout-reserving spacer div updated to
match.
**Verified:** confirmed `padding: 8px 16px 8px 8px` in both collapsed and
expanded states, nav width `61px`. No console errors.
**Files touched:** `src/styles/app-shell.css`
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Nested tabs + sidebar: keyboard-focus radius fixed to match selected/active; sidebar transition bug fixed

**What changed:**
1. **Keyboard-focus radius fix** — both `.area-tab` and `.ta-shell-tab`
   matched the app's GLOBAL a11y focus ring (`tokens.css`,
   `[role="tab"]:focus-visible`), which rounds any focused tab to
   `--radius-sm` (10px) — visually diverging from every other state
   (default/hover/active, all `0px`). Added `:focus-visible{border-
   radius:0}` overrides on both, so focus no longer looks different in
   shape from selected/active — the focus box-shadow ring itself (the
   actual a11y indicator) is untouched, still shows.
2. **Sidebar "jumping" instead of animating open — real bug, found and
   fixed**: `.ta-shell-nav`'s `transition` list had lost `width` when the
   rail switched to `fit-content` earlier — only `box-shadow` was still
   listed. Restored `width` to the transition, and per designer's
   "slower and more gradual" ask, moved both `.ta-shell-nav`'s
   transition and `.ta-shell-tab-label`'s fade from `--dur` (200ms) to
   `--dur-slow` (320ms) — the label's fade and the rail's width now
   move in sync instead of finishing at different times. (Live frame-
   sampling in this session's own preview pane still showed an instant
   jump after this fix — but that pane has already shown unreliable
   real-time animation timing twice earlier this session, confirmed both
   times to be a pane artifact rather than a real bug; the CSS itself is
   now correctly declared and should be checked live in an actual
   browser rather than trusted from that pane alone.)
**Verified:** `.area-tab`/`.ta-shell-tab` computed `border-radius`
confirmed `0px` while focused. `.ta-shell-nav`/`.ta-shell-tab-label`
transitions confirmed to include `width`/`opacity`/`max-width`/
`margin-left` at `0.32s` each. No console errors.
**Files touched:** `src/styles/advisor-workbench.css`, `src/styles/app-shell.css`
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Sidebar: bigger gap between nav items, padding reverted to uniform 8px

**What changed:** `.ta-shell-tabs` gap between each nav item increased
4px → 8px. `.ta-shell-tab-inner`'s padding reverted to a plain uniform
`8px` in BOTH collapsed and expanded states — undoes the expanded-only
`12px` right padding from two entries ago, per designer's follow-up call
to keep it simple and consistent both states.
**Verified:** confirmed `gap: 8px` on `.ta-shell-tabs`; confirmed
`padding: 8px` on the icon-group in both collapsed and expanded (toggled
live and re-read computed style); nav's collapsed width still `53px`
(unaffected, since gap lives on the tabs list, not inside each tab). No
console errors.
**Files touched:** `src/styles/app-shell.css`
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Area sub-nav tabs: radius explicitly 0px, padding 8px/12px

**What changed:** `.area-tab` (the underline-style page sub-nav — e.g.
Enquiries' "Console / Proposal Composer", Advisor Workbench's 15 tabs)
now has explicit `border-radius: 0` and `padding: 8px 8px 12px` (top/
right/left 8px, bottom 12px) — both the same in every state (default/
hover/active/disabled), since none of those state rules redeclare either
property. First pass of this entry read the designer's spec backwards
(treated the 8/12 numbers as radius, not padding) — corrected same day.
Scope confirmed: `.area-tab` only, not `.taw-desk-tab` (DeskHub's
separate pill-style sub-tabs, left untouched).
**Verified:** confirmed `radius: 0px` and `padding: 8px 8px 12px` on
both active and inactive Enquiries tabs. No console errors (fresh-tab
check).
**Files touched:** `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure CSS change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Sidebar: 14px right padding, widest-row-sizing, hover matches toggle, radius fix

**What changed:** Four related tweaks to the nav tabs.
1. **`.ta-shell-tab-inner` gets a `12px` right padding — expanded state
   only** (`padding: 8px 12px 8px 8px`); collapsed stays the plain
   uniform `8px` (corrected mid-implementation from an initial "both
   states, 14px" pass). The right-side value doesn't affect the icon's
   own left-anchored position either way, so it's safe to vary per state.
2. **Widest row determines width, every other row stretches to match** —
   `.ta-shell-tabs` back to `align-items: stretch` (uniformly, no more
   per-state split), so in the expanded state every row shares the width
   of its longest label ("Supplier Broadcast") instead of each hugging
   its own shorter content. Collapsed, this is a no-op (every row is
   already the same icon-only size). `.ta-shell-nav` itself stays
   `fit-content`, sized to that same widest row.
3. **Hover state now matches the sidebar toggle icon exactly** — both use
   `background: var(--champagne)`.
4. **Fixed the DevInspector "radius: 0px" report** — the border-radius
   lived on `.ta-shell-tab` (the outer, mostly-invisible structural
   wrapper), but `.ta-shell-tab-inner` (the actual visual pill, and the
   element that's really under the cursor when hovering/inspecting a row)
   had none. Moved `border-radius: 4px` onto `.ta-shell-tab-inner`
   itself, along with the hover/active background (previously also on
   the outer tab) — the inspector now reports the correct radius because
   the element it's actually reading has one.
Also removed two now-superseded duplicate `.ta-shell-tab:hover`/
`.is-active` rules further down the file (leftover from before this
inner/outer split, would have silently fought the new rules via source-
order cascade).
**Verified:** collapsed icon-group padding confirmed `8px` (uniform),
expanded confirmed `8px 12px 8px 8px`; nav's collapsed width confirmed
`53px` (matches the spacer); all 8 expanded rows measure identically
(174.9px, matching the widest label); `.ta-shell-tab-inner`'s computed
`border-radius` confirmed `4px`; `.ta-shell-collapse:hover` and
`.ta-shell-tab:hover .ta-shell-tab-inner` both confirmed
`background: var(--champagne)` via direct stylesheet inspection. No
console errors.
**Files touched:** `src/styles/app-shell.css`
**Data/API status:** N/A — pure UI/layout change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Sidebar: fixed the real right-side-gap bug, switched to fit-content width, removed active-tab inset shadow

**What changed:** Follow-up on the icon-group restructure below — user
correctly reported visibly more spacing on the right of each collapsed
icon than the left. Went down a debugging detour (tried `flex:1` on the
icon-group, tried un-stretching `.ta-shell-tabs` — neither addressed the
real cause) before finding it: **`.ta-shell-tab-inner`'s `gap: 8px`
between the icon and the label was still reserving a full 8px even when
the label was collapsed to `max-width:0`** — CSS `gap` applies between
flex siblings regardless of either one's own rendered size, so that
phantom 8px was the entire asymmetry. Fixed by dropping `gap` from the
icon-group entirely and moving the icon-label spacing onto the label
itself as `margin-left` (`0` collapsed, `8px` expanded) — genuinely zero
width/margin when the label is hidden.
Separately, per request: **the sidebar's width is now `fit-content` in
both states** (was a hardcoded `60px` collapsed / `232px` expanded) —
sized purely by whatever's actually inside it; expanded width is now
`~186px` (content-driven) rather than a fixed `232px`. The layout-
reserving spacer div's width was updated to match the collapsed rail's
new natural width (`53px` = nav padding + icon-group padding + icon +
nav's 1px border). Also removed `.ta-shell-tab.is-active`'s inset
box-shadow (the gold left-accent bar on the active nav item).
**Verified:** collapsed left/right gaps now `16px`/`17px` (the 1px
difference is nav's own `border-right`, expected/correct — not a bug);
icon position confirmed pixel-identical before/after toggling
(`x:16,y:79.2` both states, exact match); expanded width confirmed
content-driven (`186.15625px`, not `232px`); active-tab box-shadow
confirmed `none`. No console errors.
**Files touched:** `src/styles/app-shell.css`
**Data/API status:** N/A — pure UI/layout change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Sidebar icon-group restructure (zero position shift + real fade-in); layout padding/gap tightened

**What changed:**
1. **Sidebar nav tabs restructured** — each `.ta-shell-tab` is now a
   padding-less clickable wrapper around a new `.ta-shell-tab-inner`
   ("icon-group") that carries a fixed `8px` padding on every side, in
   BOTH collapsed and expanded states (previously `4px` collapsed vs.
   `8px 12px` expanded — different padding per state, which visibly moved
   the icon on toggle). Since the icon is always the group's first child
   right after that constant 8px inset, and `.ta-shell-tabs`/`.ta-shell-
   nav`'s own alignment/padding no longer differ between states either
   (`align-items` unified to `stretch`, nav's horizontal padding unified
   to `8px` both states), the icon's rendered position is now identical
   collapsed vs. expanded — verified via `getBoundingClientRect()`
   before/after toggling: Y identical, X off by 0.5px (sub-pixel
   rounding, not a real shift). Icon-group height is also now identical
   in both states (confirmed 38.4px both ways).
2. **Label fade-in is now real** — `.ta-shell-tab-label` used to hard-
   toggle `display:none`/`inline` (an instant swap, not a fade). Replaced
   with `opacity`/`max-width` + `transition`, so expanding genuinely
   fades the label in instead of snapping it into existence.
3. **Layout padding/gap tightened**: `.taw-grid` gap 12px → 8px;
   `.taw-main`/`.area-header` padding now asymmetric — 16px left, 8px
   right, 8px top (was a uniform 12px/8px) — and `.area-tabs`' full-bleed
   divider trick updated to the matching asymmetric margin/padding per
   side, since that trick only works when it mirrors `.taw-main`'s
   padding exactly.
**Verified:** all values confirmed via computed styles (gap, padding,
icon-group padding, label transition/opacity/max-width), icon position
confirmed stable across toggle, no console errors.
**Files touched:** `src/components/ShellChrome.tsx`, `src/styles/app-shell.css`, `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure UI/layout change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — DevInspector: now reports `gap`; sidebar icons unified to 20px

**What changed:** Two small fixes/tweaks after the sidebar rework above.
1. **`DevInspector.tsx` (the in-app "Press I to inspect" tool) never
   reported `gap` at all**, for either flex or grid containers — that's
   why the 12px gutter between Queue/Itinerary Builder/Search
   (`.taw-grid`'s `gap`) wasn't visible when hovering it. Added grid-
   container detection (it only checked `display:flex` before, never
   `display:grid`) and a `gap` value on both the flex and grid container
   lines. Separately confirmed the grid itself was never broken — a
   `gridTemplateColumns` reading of a single track earlier was just the
   existing `@media(max-width:1100px)` responsive breakpoint collapsing
   to one column at a narrow viewport, not a bug.
2. **Sidebar nav icons unified to 20px** in both collapsed and expanded
   states (were 16px collapsed / 18px expanded) — collapsed square frame
   is now 20px icon + 4px padding = 28×28px.
**Verified:** confirmed 20px in both states via computed style before/
after toggling pin; confirmed the grid's real `columnGap`/`rowGap` (12px)
at a proper (non-narrow) viewport width. No console errors (fresh-tab
check, same stale-buffer pattern as before on the working tab).
**Files touched:** `src/components/DevInspector.tsx`, `src/styles/app-shell.css`
**Data/API status:** N/A — dev-tool-only change + pure UI tweak.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Global sidebar: hover-to-open overlay + click-to-pin, square collapsed icons

**What changed:** Reworked the sidebar's collapse/expand model entirely.
Collapsed (60px icon rail) is now the permanent DEFAULT — it no longer
takes a click to collapse. Hovering the rail opens it as an OVERLAY
(`position: fixed`, floating on top of the page via a `box-shadow`) rather
than pushing/reflowing page content — a `.ta-shell-nav-spacer` div
reserves the 60px in normal layout flow so the real nav can be taken out
of flow entirely. Clicking the toggle icon PINS it open regardless of
hover; pin turns off by clicking the toggle again, clicking any nav link,
or clicking anywhere outside the sidebar (via a `pointerdown` listener on
`document`, only attached while pinned).
Collapsed-state nav icons are now true square frames: 16px icon + 4px
padding on each side = 24×24px, `border-radius: 4px` (was the shared
`--radius-sm`, 10px) — matches the treatment already used for the
collapse-toggle icon itself. The toggle icon has no fill/outline at rest
(`background: none; border-color: transparent`) — only shows on hover, for
affordance, same pattern the nav links themselves already used.
**Bug caught while verifying:** initial collapsed-hide rules for
`.acct-id`/`.acct-trigger`/`.acct-pop` (bare 1-class selectors) were
silently losing to AccountMenu's own same-specificity base rules defined
later in the file — CSS cascade tie-break by source order, not a
mistake in the selectors themselves. Fixed by scoping mine under
`.ta-shell-nav` (2-class specificity), which now reliably wins regardless
of order.
**Verified:** hover confirmed correct (a live transition-timing artifact
from the preview pane's own display state briefly looked like a bug —
double-checked with `transition:none` and confirmed the target value was
right all along); pin-via-click, unpin-via-second-click,
unpin-via-nav-link-click, and unpin-via-outside-click all confirmed via
direct DOM/class assertions; collapsed icon frame confirmed exactly
24×24px/16px icon/4px padding/4px radius; toggle icon confirmed
transparent background+border at rest. No console errors.
**Files touched:** `src/components/ShellChrome.tsx`, `src/styles/app-shell.css`
**Data/API status:** N/A — pure UI/interaction change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Search panel: "Search Desks" tabs → "Search" + dropdown, fields stacked vertically

**What changed:** Follow-up polish on the just-inlined Search panel (see
entry below). The Flights/Hotels/Visas tab-button strip is replaced with
a single `<select>` dropdown sitting on the same line as the card title
(now just "Search," not "Search Desks") — via `Card`'s `actions` slot.
FlightDesk/HotelDesk/VisaDesk's own field rows (`taw-row-2/3/4` — shared
grid classes also used by TrendingDealsPanel/CallCopilotPanel/
ServicingIntakePanel elsewhere) are forced to a single stacked column
inside this panel only, via a new `.taw-search-stack` wrapper + scoped
CSS override — the shared classes themselves are untouched, so nothing
else in the app is affected. Reasoning: the right column is narrow (2fr
of 2/5/2), so a 3-way tab strip and 3-4-across field grids both read as
cramped there.
Verified: fresh-tab check clean, dropdown switches desks correctly
(tested Flights → Hotels via a real `change` event), each desk's fields
render one per row.
**Files touched:** `src/components/panels/SearchDesksPanel.tsx`,
`src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure layout change, no data/API impact.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Console: Search moved inline (right column), Summary removed, Search tab deleted

**What changed:** Second half of the Console restructure (see the
Queue/Profile accordion entry below for the first). The right column is
now **Search Desks** (`SearchDesksPanel`, new — Flights/Hotels/Visas)
instead of the read-only Summary card — Search is "accessible at all
times with fewer clicks," inline instead of behind a tab switch. The
standalone Enquiries → Search tab and its route (`console/search/`) are
deleted entirely, per the designer's call ("Console is the only home for
Search now"). `SearchDesksTab.tsx` (the old standalone-tab version, built
2026-09-01 earlier today) is replaced by `SearchDesksPanel.tsx` — same
Flights/Hotels/Visas desk, but no Cart panel of its own; it takes an
`onAdd` prop and feeds WorkbenchTab's own `cart` state instead of managing
a separate local one.
Summary is now GONE from this screen entirely, not relocated — matches
the original ask ("No more Summary — shown as an overlay once the advisor
clicks Finalize"). That Finalize button + overlay are still
undecided/deferred (placement, exact mechanic — not settled), so there's
currently no way to see the cart's contents on this screen; `cart` keeps
accumulating in WorkbenchTab regardless, so nothing added via Search is
lost once the overlay actually gets built.
Verified: fresh-tab check clean (no console errors), Search Desks render
inline with the mock flight-search fallback data, Add-to-cart click
produces no errors (same wiring as before, just a different owner for the
cart state).
**Files touched:** `src/components/panels/SearchDesksPanel.tsx` (new,
replaces deleted `SearchDesksTab.tsx`), `src/components/panels/index.ts`,
`src/components/panels/WorkbenchTab.tsx`,
`src/app/(authenticated)/console/layout.tsx`; deleted
`src/app/(authenticated)/console/search/`
**Data/API status:** N/A — same FlightDesk/HotelDesk/VisaDesk components
and data flow as before, just relocated and re-wired to a shared cart.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Console: Queue and Traveller Profile now share one column (accordion + auto-collapse)

**What changed:** Structural change to the Console screen. Queue no
longer gets its own column and Traveller Profile no longer lives stacked
with Summary in the third column — they now share the LEFT column via a
new `QueueProfileAccordion` component: both sections have clickable
headers (open either one manually, any time), and picking an enquiry also
auto-collapses Queue and opens Profile — no extra click for the common
"pick → review" path. This is "Mode H" from the interaction-lab comparison
built to evaluate this decision (`src/app/lab/queue-profile/` — gitignored,
local-only, not part of this change). The right column is now Summary
alone. Center column (Itinerary Builder) is unchanged.
Still parked, not part of this pass: moving Search inline onto this screen,
and turning Summary into a finalize-triggered overlay — both discussed,
neither built yet.
**Files touched:** `src/components/panels/QueueProfileAccordion.tsx` (new),
`src/components/panels/WorkbenchTab.tsx`, `src/styles/advisor-workbench.css`
**Data/API status:** N/A — reuses the real `EnquiryInbox`/`Member360`
components and real enquiry/member data exactly as before; purely a layout
change, no data flow changed.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Sidebar collapse toggle: bigger icon, tighter button

**What changed:** The collapse/expand toggle button — icon bumped 15px →
20px, button switched from a fixed 24×24px box to `padding: 4px` (so it
hugs the bigger icon) with `border-radius: 4px` (was the shared
`--radius-sm`, 10px). Wordmark's `line-height` bumped 24px → 28px to match
the now-taller button so the brand row still lines up.
**Files touched:** `src/components/ShellChrome.tsx`, `src/styles/app-shell.css`
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Global sidebar: collapse/expand toggle + logo/wordmark resized (steps 2+3 of 3)

**What changed:** Completes the 3-part sidebar plan (see the "leading icon
per nav item" entry below for step 1). Step 2: a collapse/expand toggle
next to the wordmark shrinks the sidebar to a 60px icon-only rail (Jira
pattern) — all tab labels, the account name/role, and the wordmark hide;
icons stay, centered, with `title` tooltips. Session-only state (plain
`useState`, no localStorage) — always resets to expanded on reload, per
designer. Toggle icon is a dedicated "sidebar" glyph (rounded panel with a
divider, matching Jira's actual collapse icon) added to the shared `Icon`
set, not a generic chevron. Step 3: brand row redone to Jira's proportions
— shield mark + "TripAgent" wordmark now share one 24px-tall row (wordmark
22px serif → 16px, `line-height:24px`, matching the toggle button's own
height so everything in the row lines up); the "PRIVATE TRAVEL MAISON"
eyebrow line is removed per designer's explicit call once the row height
was pinned to the toggle's height.
**Files touched:** `src/components/ShellChrome.tsx`,
`src/styles/app-shell.css`, `src/components/ui/Icon.tsx`
**Data/API status:** N/A — pure UI/nav change, no data involved.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Search re-added as its own tab under Enquiries (exact original composition)

**What changed:** The Search feature (Flights/Hotels/Visas) — removed from
the Itinerary Builder screen on 2026-08-31 ("Search still needs a home ...
parked") — is back, as a new nested tab under Enquiries: Console / Search /
Proposal Composer. Rebuilt EXACTLY as it originally rendered as "row 2" of
the pre-rewrite combined Workbench tab (ported verbatim from the frozen
`Admin Panel/advisor-panel` reference's `WorkbenchTab.jsx`, lines 91-134):
a "Search Desks" card with Flights/Hotels/Visas sub-tabs
(`taw-desk-tabs`/`taw-desk-tab`), each rendering the real `FlightDesk` /
`HotelDesk` / `VisaDesk` panel, side by side with an `Itinerary Cart`
(`CartPanel`, local state — nothing outside this tab reads it, same as the
original). No new components invented — same classes, same markup, same
props (`member`, `advisorId`, `onAdd`). Only difference from the original:
lives on its own route (`console/search`) instead of being row 2 of one
combined tab, since Console (Queue/Itinerary Builder/Traveller
Profile/Summary) now has its own tab.
**Files touched:** `src/components/panels/SearchDesksTab.tsx` (new),
`src/components/panels/index.ts`,
`src/app/(authenticated)/console/search/page.tsx` (new),
`src/app/(authenticated)/console/layout.tsx`
**Data/API status:** N/A — reusing FlightDesk/HotelDesk/VisaDesk exactly as
they already were; no data/API changes.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-09-01 — Global sidebar: leading icon per nav item (Jira-style, step 1 of 3)

**What changed:** Each top-level sidebar link (Enquiries, Advisor Workbench,
Supplier Broadcast, Journeys, Trending & Deals, Call Copilot, Analytics,
Member View) now has a leading icon from the existing `Icon` set, matching
Jira's global-sidebar pattern the designer is using as reference. Icons
mapped by meaning: Enquiries→inbox, Advisor Workbench→sliders, Supplier
Broadcast→send, Journeys→compass, Trending & Deals→trend, Call
Copilot→chat, Analytics→radar (given its own icon so it doesn't collide
visually with Trending & Deals, which already aliased to `trend`), Member
View→arrowUR (external-link meaning, consistent with its use elsewhere).
Tab label text wrapped in `<span>` so it can be independently hidden later
when the collapse/expand toggle (step 2) is built. First of a 3-part
sidebar plan: (1) leading icons — this entry, (2) collapse/expand toggle
(no persistence — resets to expanded on every reload, per designer), (3)
logo mark resized to an icon placeholder + wordmark resized, both against
Jira's proportions.
**Files touched:** `src/components/ShellChrome.tsx`, `src/styles/app-shell.css`
**Data/API status:** N/A — pure UI/nav change, no data involved.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-31 — Queue: scrollbar hidden, scroll still works

**What changed:** `.taw-enq` (the Queue list) no longer shows a visible
scrollbar track/thumb — `scrollbar-width: none` / `-ms-overflow-style:
none` / `::-webkit-scrollbar{display:none}`. Scrolling itself is
unaffected (`overflow: auto` unchanged); verified via `scrollTop`/
`scrollHeight` that the element still scrolls, it just doesn't render a
visible track.
**Files touched:** `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure CSS change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-31 — Real shift: Queue/Itinerary Builder/Traveller Profile/Summary now lives at Enquiries → Console; 3 mock enquiries + AI-draft rendering

**What changed:** Follow-up correcting the entry below — the designer
confirmed this needed to be an actual move, not two instances of the same
UI pointing at separate data. Made possible by hoisting the shared
advisors/members/enquiries state one level up:
- New `WorkbenchDataProvider.tsx`, mounted once in `AppRoot.tsx` (wraps
  every authenticated route) — holds the state + pickEnquiry/pickMember/
  cart/order-creation handlers that used to live inside
  `(workbench)/layout.tsx`. One shared `WorkbenchContext` instance for the
  whole app now, not a per-area copy.
- **`(workbench)/workbench/page.tsx` (the real Queue/Itinerary Builder/
  Traveller Profile/Summary screen) moved to `console/queue/page.tsx`** —
  same `WorkbenchTab` component, same shared context, genuinely relocated.
  `(workbench)/workbench/` folder deleted entirely.
- Its "Analytics" sub-route (a different thing — the per-advisor
  AnalyticsPanel, previously nested at `/workbench/analytics` only to
  dodge the top-level `/analytics` route) moved to its own path,
  `/advisor-analytics`, since `/workbench` no longer exists to nest it
  under.
- `(workbench)/layout.tsx` no longer owns any state — it's just tab
  chrome now, tabs list drops "Workbench" (14 tabs remain).
- Root `/` and the sidebar's "Advisor Workbench" link both repointed from
  `/workbench` (deleted) to `/orders` (its new first tab / default
  landing).
- **3 mock enquiries** added (`lib/mockEnquiries.ts`, demo data only, not
  Supabase) — solo/correct (Arjun Mehta), wrong-for-hotels (Priya Kapoor,
  family trip needing adjoining rooms/elevator access, drafted into 2
  separate stairs-only rooms), wrong-for-flights (Kabir Shah, direct-only
  ask, drafted with a KL layover). Each carries both the original "ask"
  and an `ai_draft` (flight + hotel pick, reasoning, and `mismatch: true`
  + a note on the two wrong ones). Merged into the real enquiries list
  client-side so they show in Queue alongside real Supabase data.
- **Itinerary Builder now renders the draft for real** when the selected
  enquiry has one — a flight card and a hotel card, each with the AI's
  one-line reasoning; a `mismatch` segment gets a terracotta-flagged
  treatment ("Check against enquiry" + the specific note) instead of the
  "Not yet built" placeholder, which still shows for enquiries with no
  draft (i.e. real ones, for now).
**Files touched:**
- `src/components/WorkbenchDataProvider.tsx` (new)
- `src/components/AppRoot.tsx`
- `src/app/(authenticated)/(workbench)/layout.tsx` (rewritten)
- `src/app/(authenticated)/(workbench)/advisor-analytics/page.tsx` (new, moved)
- `src/app/(authenticated)/console/queue/page.tsx` (rewritten — real WorkbenchTab wiring)
- `src/app/(authenticated)/page.tsx`, `src/components/ShellChrome.tsx` (redirect/href → `/orders`)
- `src/lib/mockEnquiries.ts` (new)
- `src/components/panels/WorkbenchTab.tsx` (draft rendering)
- `src/styles/advisor-workbench.css` (`.taw-draft*`)
- Deleted: `(workbench)/workbench/`
**Data/API status:** Mock enquiries/members are 100% client-side demo
data, clearly commented as such — no backend writes, no schema change.
Everything else is the same real Supabase-backed state, just relocated.
**Env vars added/changed:** none
**Backend action needed:** None yet — flag when `ai_draft` needs a real
data source instead of the 3 seeded mocks.

---

## 2026-08-31 — Console renamed to Enquiries, trimmed to 2 relevant tabs

**What changed:** A larger swap (renaming Advisor Workbench too, moving its
~14 other tabs into a renamed Console) was scoped out and abandoned
mid-way — nearly every route under Advisor Workbench shares
`WorkbenchContext`, so splitting it would be a much bigger refactor than a
rename. Landed the low-risk version instead, entirely self-contained to
the existing `console/` folder:
- Top-level sidebar link "Console" → **"Enquiries"** (route stays
  `/console` — only the page/label changed, not the URL).
- Page title "Console" → **"Enquiries"**.
- Sub-nav trimmed from 8 tabs to 2: **"Console"** (was "Queue," same
  route `/console/queue`, still a placeholder — NOT wired to the real
  Queue/Itinerary Builder/Traveller Profile/Summary flow, which lives in
  `WorkbenchTab.tsx` under the untouched Advisor Workbench) and
  **"Proposal Composer"** (unchanged).
- Deleted 6 routes as superseded/no-longer-relevant: `traveller-profile`,
  `itinerary-builder`, `ai-draft` (duplicates of the real WorkbenchTab
  flow — explicit delete decision), `price-desk` (folds into Proposal
  Composer as a future panel, not its own screen), `live-trips` and
  `commission-tracker` (had no clear home once the bigger Workbench-side
  swap was scoped out — can come back if/when that happens).
- Advisor Workbench itself: **completely untouched** — same 16 tabs, same
  routes, same shared context, verified unaffected.
**Files touched:**
- `src/components/ShellChrome.tsx` (label only)
- `src/app/(authenticated)/console/layout.tsx`
- `src/app/(authenticated)/console/page.tsx` (comment only)
- `src/app/(authenticated)/console/queue/page.tsx` (placeholder copy)
- Deleted: `console/{traveller-profile,itinerary-builder,ai-draft,price-desk,live-trips,commission-tracker}/`
**Data/API status:** N/A — pure nav/routing change, no backend involved.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-31 — Itinerary Builder shows AI-suggested content, not search; true viewport-height fill

**What changed:** Two corrections from the same round of feedback:
1. **Itinerary Builder no longer renders the Flights/Hotels/Visas search
   UI.** It's a placeholder ("Not yet built") describing what will
   actually live there — the AI-suggested draft, shown one thing at a
   time for the advisor to check/edit — not a search form. FlightDesk/
   HotelDesk/VisaDesk are no longer imported/rendered on this screen
   (components untouched, just not used here); Search still needs a home
   (side-panel/overlay was discussed, trigger location undecided).
2. **The 3 columns now actually fill the viewport**, not just match each
   other. Previous fix (`align-items: stretch`) only equalized column
   heights to the row's OWN content-driven height — the row itself wasn't
   tied to the page. Fixed by making the height chain explicit: `.taw` is
   now `display:flex;flex-direction:column` (was block, only had
   `min-height:100vh`); `.taw-main` gets `flex:1` + is itself a flex
   column; `.taw-cols-3` gets `flex:1` to fill the rest of `.taw-main`.
   Checked Orders Board (also built on `.taw-main`) for regressions —
   renders unaffected.
**Files touched:**
- `src/components/panels/WorkbenchTab.tsx`
- `src/styles/advisor-workbench.css` (`.taw`, `.taw-main`, `.taw-cols-3`)
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-31 — Workbench row fills height; Traveller Profile grows, Summary stays fixed

**What changed:** Follow-up to the entry below — Queue, Itinerary Builder,
and the right column now stretch to fill the row's full height (removed
an explicit `align-items:start` override on `.taw-cols-3`, letting grid's
default `stretch` apply). Inside the right column's `.taw-col-stack`,
Traveller Profile gets a new `.taw-grow{flex:1}` class to absorb whatever
vertical space is left; Summary is untouched and keeps its natural/fixed
height (flex's default, no grow) per the designer's explicit call-out.
**Files touched:**
- `src/components/panels/WorkbenchTab.tsx` (`className="taw-grow"` on the Traveller Profile Card)
- `src/styles/advisor-workbench.css` (`.taw-grow`, `.taw-col-stack` height:100%, dropped `align-items:start`)
**Data/API status:** N/A — pure layout change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-31 — Workbench main screen v2: 3-column proportional layout, Summary card

**What changed:** Correction to the entry below — the designer clarified
the intended layout wasn't Search-merged-into-Itinerary-Builder-as-one-
mega-card; it's three columns with proportional widths and a distinct
read-only summary:
- **Queue | Itinerary Builder | (Traveller Profile + Summary)**, one grid
  row, `grid-template-columns: 2fr 5fr 2fr` (new `.taw-cols-3` value) —
  Itinerary Builder gets "considerable width, but not too much," ~5/9 of
  the row.
- **No separate "AI Draft" card** — Itinerary Builder itself IS that job:
  the detailed, editable view where the advisor checks the draft closely
  (one flight, one day at a time), not an overview.
- **Search (Flights/Hotels/Visas) stays inline inside Itinerary Builder**
  for now — a side-panel/overlay treatment was discussed but the trigger
  button's location wasn't decided, so parked rather than guessed at.
- **New "Summary" card** under Traveller Profile (own `.taw-col-stack`
  flex wrapper as the grid's 3rd cell) — a read-only, in-order recap of
  the whole draft, deliberately separate from Itinerary Builder's editing
  job. `CartPanel` gained `readOnly` (hides remove/Clear) and `title`
  (overrides "Itinerary Cart") props for this. Name is provisional.
**Files touched:**
- `src/components/panels/WorkbenchTab.tsx`
- `src/components/panels/CartPanel.tsx`
- `src/styles/advisor-workbench.css` (`.taw-cols-3`, new `.taw-col-stack`)
**Data/API status:** No data/API changes.
**Env vars added/changed:** none
**Backend action needed:** None yet.

---

## 2026-08-31 — Workbench main screen: Queue/AI Draft/Traveller Profile + consolidated Itinerary Builder

**What changed:** Restructured `/workbench`'s top-level layout per the
Queue → AI Draft → Traveller Profile flow discussion:
- "Enquiry Inbox" renamed **"Queue"**, "Member 360" renamed **"Traveller
  Profile"** — same components, same data, just unified naming with the
  Product Flow docx's own screen names (these were always the same
  screens under two different names, not new builds).
- New **"AI Draft"** card inserted between them (now a 3-column row via
  new `.taw-cols-3` grid) — placeholder only (`Empty` "Not yet built").
  The actual "AI drafts, advisor fixes it" flow is still an open design
  question per the discussion — this card is not wired to any logic yet.
- **Search Desks + Itinerary Cart consolidated into one "Itinerary
  Builder" card** — per the docx, "day-by-day canvas, supplier search
  inline" is one screen, not two. `CartPanel` gained a `bare` prop
  (renders just the list/empty-state + a small header, no own `<Card>`)
  so it nests inside Itinerary Builder instead of standing alone.
- **Quote Builder removed from this screen** — not deleted from the
  codebase, just not rendered here; designer said it "will be in the next
  part" of the flow.
**Files touched:**
- `src/components/panels/WorkbenchTab.tsx`
- `src/components/panels/CartPanel.tsx`
- `src/styles/advisor-workbench.css` (`.taw-cols-3`, `.taw-cart-bare*`)
**Data/API status:** No data/API changes — same `EnquiryInbox`/`Member360`/
`FlightDesk`/`HotelDesk`/`VisaDesk`/`CartPanel` components, same props,
just relabeled/regrouped. AI Draft has no backend behind it yet.
**Env vars added/changed:** none
**Backend action needed:** None yet — flag when AI Draft's actual data
source (what the AI collected per enquiry) gets scoped.

---

## 2026-08-28 — Removed .area-header's redundant bottom padding

**What changed:** Follow-up to the entry below — `.area-header`'s bottom
padding (20px) was stacking with `.taw-main`'s own 20px top padding into
a redundant 40px gap after the divider, since `.taw-main` already provides
that spacing as the next sibling. Set back to `0` (top/left/right stay at
20/24/24) — one 20px gap instead of two.
**Files touched:** `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-28 — Explicit padding: 24px left/right, 20px top/bottom

**What changed:** `.taw-main` (previously `30px 26px 48px`, asymmetric) and
`.area-header` (previously `24px 26px 0`) both set to an explicit
`padding: 20px 24px` — 24px horizontal, 20px vertical, matching each
other exactly. `.area-tabs`'s full-bleed divider trick (`margin: 0 -Npx;
padding: 0 Npx`) updated from -26px/26px to -24px/24px to stay in sync
with the new horizontal padding value (the two have to match for the
divider to still reach the sidebar — see the CSS comment).
**Files touched:** `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-28 — Further tightened spacing, switched headings off serif

**What changed:** Direct follow-up to the density pass below — designer
feedback was "still a lot of spacing/padding" plus an explicit ask to
"switch out the serifs." Two more rounds of the same shared classes:
- Padding/gaps cut again: `.taw-card-h` → `8px 12px` (was 12/16); `.taw-card-b`
  → `12px` (was 16); `.taw-grid` gap → `12px` (was 16); `.taw-enq-item` → `8px
  10px` (was 12); internal gaps in both down to 4-6px.
- **Headings switched from `--serif` to `--sans`**, weight raised to
  compensate for the smaller serif-display sizes losing presence: card
  titles `--serif/500/16px` → `--sans/600/14px`; Enquiry Inbox item names
  `--serif/500/15px` → `--sans/600/13.5px`; Empty-state title `--serif/500/
  14px` → `--sans/600/14px`; page-level Empty title `20px/600` → `18px/700`.
  The "empty states are prominent" logic from the Jira type-usage pass now
  reads through weight/color rather than serif display size, matching how
  Jira itself signals emphasis.
**Files touched:** `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-28 — Densified Workbench cards to Jira's density philosophy (option 1)

**What changed:** Direct follow-up to a design discussion (see
design_reference_jira memory) — the designer compared Workbench's
Enquiry Inbox/Member 360/Search Desks/Itinerary Cart cards against a
Jira List-view screenshot side by side and confirmed they don't match:
Workbench's cards were built spacious/luxury (generous padding, large
28px-rendered serif titles, big open whitespace) vs. Jira's dense,
scan-optimized data views. Explicit decision: **option 1** — adopt Jira's
density philosophy for Workbench's working views, a deliberate departure
from the earlier spacious-card house style, not a bug fix.

Changes (all shared classes — this affects every area using Card/Empty/
Enquiry rows, not just Workbench):
- `.taw-card` border-radius: `--radius` (12px) → `--radius-sm` (10px)
- `.taw-card-h` padding: `18px 22px` → `12px 16px`; title `h3`: 21px/600 → 16px/500
- `.taw-card-b` padding: `22px` → `16px`
- `.taw-grid` gap: `22px` → `16px`
- `.taw-enq-item` (Enquiry Inbox rows) padding: `15px 16px` → `12px`; name 17px/600 → 15px/500; internal gaps 11px → 8px
- `.taw-empty` padding/icon-badge/title all stepped down proportionally (title 21px/600 → 16px/500); `.taw-empty--page` (whole-route empty states, e.g. Console) similarly stepped down (28px → 20px) but stays the boldest/biggest text on its own screen — the "empty states are prominent" logic from the type-usage pass still holds, just at the new smaller overall scale.
**Files touched:** `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-28 — Applied Jira type-usage findings to Workbench/Console empty states

**What changed:** Audited where the Jira type-usage patterns (see
design_reference_jira memory) actually apply vs. where TripAgent already
matches them or intentionally diverges:
- **Already matching, no change**: the reconciliation/approvals stat tiles
  (`.taw-recon-stat` — tiny muted label + large bold serif number) already
  do exactly what Jira's dashboard KPI tiles do. Buttons already don't vary
  font-size by emphasis (color/fill only, matching Jira). Sidebar nav
  already doesn't shrink with nesting depth (fixed earlier today).
- **Intentional divergence, left alone**: TripAgent's card titles (21px
  serif) are bigger than its own page titles (16px sans) — the opposite of
  Jira's hierarchy, where card titles stay small/bold and page titles are
  the bigger ones. This is an established brand choice (the serif card
  header), not something this pass changed.
- **Real gap, fixed**: `Empty` component's title had no explicit
  font-weight (inheriting 400, lighter than every card title it sits
  next to) — added `font-weight:600`. Added a new `size="page"` variant
  (bigger icon + `--t-h2` title) for empty states that are a route's ENTIRE
  content — per Jira, a whole-tab empty state earns the second-biggest text
  in the app. Applied to `ConsolePlaceholder` (all 8 Console screens);
  left small in-card empties (Itinerary Cart, Member 360) at default size
  since they sit alongside other populated cards, not alone on the screen.
**Files touched:**
- `src/components/ui/Empty.tsx`
- `src/components/panels/ConsolePlaceholder.tsx`
- `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-28 — Area divider now full-bleed to the sidebar; Workbench tab-row overflow toggle

**What changed:** Two related fixes to the shared `.area-header`/`.area-tabs`
pattern (Console, Advisor Workbench):

1. The divider line under the tab strip (a `border-bottom` on `.area-tabs`,
   not a separate element) previously stopped at `.taw-main`'s own padding,
   short of the sidebar. `.area-header` now renders as a sibling BEFORE
   `.taw-main` (not nested inside it), making it a direct, unpadded child of
   `.taw` that spans the full content-area width. `.area-tabs` bleeds
   edge-to-edge via `margin:0 -26px; padding:0 26px` (cancels/reapplies
   `.area-header`'s own 26px side padding, matching `.taw-main`'s
   horizontal padding so tab labels still align with the content below).
   The sidebar's own layout/spacing was not touched.
2. Advisor Workbench's 16 tabs wrap to two rows at typical widths — added
   an icon-button toggle (next to Invite Customer) that collapses the row
   to a single line (overflow clipped, `.area-tabs.is-collapsed`) or shows
   all of it. Defaults to showing everything (matches prior behavior).
   Console's 8 tabs fit on one line already, so no toggle was added there.
**Files touched:**
- `src/app/(authenticated)/console/layout.tsx`
- `src/app/(authenticated)/(workbench)/layout.tsx`
- `src/styles/advisor-workbench.css`
**Data/API status:** N/A — pure layout/UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-28 — Area header: dropped the icon, widened header-to-tabs gap

**What changed:** Follow-up to the shared `.area-header` pattern (Console,
Advisor Workbench) — removed the small icon next to the page title on both
areas (global-level pages shouldn't carry one), and widened the gap between
the title row and the tab strip below it from 12px to 24px for clearer
separation.
**Files touched:**
- `src/app/(authenticated)/console/layout.tsx`
- `src/app/(authenticated)/(workbench)/layout.tsx`
- `src/styles/advisor-workbench.css` (removed `.area-title-icon`, `.area-header` gap 12px→24px)
**Data/API status:** N/A — pure UI change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-28 — Advisor Workbench adopted Console's header/tab visual treatment

**What changed:** Advisor Workbench's sub-nav moved from a sticky pill-style
tab bar (`.taw-tab`, positioned as its own bar above the content) to the
same icon+title / underline-tab-strip treatment `/console` uses — no longer
sticky, sits inline at the top of the content area instead. "Invite
Customer" moved from the far end of the old tab bar into the title row
(right-aligned), the same slot Console reserved for real actions. This is
purely visual — no IA/categorization change; all 16 existing tabs, their
routes, and the admin/margin gating (`isAdmin()`/`canSeeMargin()`) are
unchanged. Generalized the CSS from `.console-*` to a shared `.area-*`
naming (`area-header`, `area-title-row`, `area-tabs`, `area-tab`, etc.)
since it's now used by two areas, not Console alone.
**Files touched:**
- `src/app/(authenticated)/(workbench)/layout.tsx`
- `src/app/(authenticated)/console/layout.tsx` (class rename only)
- `src/styles/advisor-workbench.css` (`.console-*` → `.area-*`)
**Data/API status:** No data/API changes.
**Env vars added/changed:** none
**Backend action needed:** None — pure frontend layout/styling.

---

## 2026-08-28 — Added "Console" (the EIR docx's 8-screen admin console)

**What changed:** New top-level sidebar link "Console", positioned above
Advisor Workbench, linking to a new `/console` route. Per the EIR's Product
Flow docx (§5.2), Console has its own horizontal sub-nav of 8 screens:
Queue, Traveller Profile, Itinerary Builder, AI Draft, Price Desk, Proposal
Composer, Live Trips, Commission Tracker. `/console` redirects to
`/console/queue` (Queue is the docx's first-listed screen). Each of the 8
is currently an honest "not yet built" placeholder (Card + Empty, per the
future-proof-not-remove principle) — none duplicate or replace anything
that already exists in Advisor Workbench (Enquiry Inbox, Itinerary Cart,
Proposals, etc. are untouched).

The Console header (icon + "Console" title, then the underline-style tab
strip) is modeled on a specific Jira space-page screenshot the designer
provided — spacing/type follow the same Jira-aligned scale as the sidebar
(4/8/12/16/24/32px spacing, 14px body / 11px small / 16px this page's
title). This is a NEW, distinct visual treatment from Advisor Workbench's
own pill-style taw-tab sub-nav — deliberately not reused here. An initial
pass copied Jira's 3 header action icons (share/automation/expand) and a
much larger title; both were removed same-day on design feedback (icons
had no real behavior behind them, title read too large/heavy) — the
current header is just the icon + title, no action buttons.
**Files touched:**
- `src/components/ShellChrome.tsx` (new sidebar link)
- `src/app/(authenticated)/console/layout.tsx` (new)
- `src/app/(authenticated)/console/page.tsx` (new — redirect)
- `src/app/(authenticated)/console/{queue,traveller-profile,itinerary-builder,ai-draft,price-desk,proposal-composer,live-trips,commission-tracker}/page.tsx` (new, 8 files)
- `src/components/panels/ConsolePlaceholder.tsx` (new — shared empty-state)
- `src/styles/advisor-workbench.css` (new `.console-*` rules)
**Data/API status:** None of the 8 screens are wired to any backend —
all placeholder content, static text only.
**Env vars added/changed:** none
**Backend action needed:** None yet. Flag when any of these 8 screens gets
scoped for real — Live Trips and AI Draft are explicitly Phase E in the
docx's roadmap (later than the other 6), worth sequencing accordingly.

---

## 2026-08-28 — Sidebar type sizes aligned to the Jira/Atlassian scale

**What changed:** Follow-up to the sidebar reflow below — the sidebar had
carried over its old horizontal-bar font sizes (13.5px nav links, 10px/9.5px
metadata labels) without checking them against the Jira type-scale reference
already on file. Aligned: nav links, account name, and menu items → 14px
(Jira's body default); eyebrow subtitle and role label → 11px (Jira's small,
de-emphasized by --muted color rather than by shrinking further). Brand
wordmark (22px) already sat inside Jira's 20-24px title band — left as-is.
**Files touched:** `src/styles/app-shell.css`
**Data/API status:** N/A — pure CSS value change.
**Env vars added/changed:** none
**Backend action needed:** None.

---

## 2026-08-28 — Global nav: horizontal top bar → Jira-style left sidebar

**What changed:** `ShellChrome`'s top-level navigation (TripAgent brand,
Advisor Workbench / Supplier Broadcast / Journeys / Trending & Deals / Call
Copilot / Analytics / Member View, and the AccountMenu) moved from a
horizontal bar into a persistent vertical sidebar, styled after Jira's
global sidebar. This is a pure navigation-placement change — every link,
route, and the account menu underneath are byte-for-byte the same; only the
layout direction changed (`.ta-shell` is now a row of sidebar+body instead
of a column of bar+body). Explicitly scoped to this shell only: Advisor
Workbench's own internal sub-nav, Call Copilot, Supplier Broadcast, and
every other area's content are untouched — nothing inside them was
restructured to look like Jira, only this outer nav shell. Sidebar layout,
top to bottom: brand (TripAgent / Private Travel Maison), section links,
AccountMenu pinned to the bottom via `margin-top: auto` on `.ta-shell-footer`.
**Files touched:**
- `src/components/ShellChrome.tsx`
- `src/styles/app-shell.css`
**Data/API status:** No data/API changes — same routes, same session context,
same AccountMenu from the previous change.
**Env vars added/changed:** none
**Backend action needed:** None — pure frontend layout change.

---

## 2026-08-28 — Replaced advisor-switcher/sign-out cluster with a single account menu

**What changed:** The old `.taw-advisor` cluster in the Workbench sub-nav (an
"Advisor" label + `<select>` to switch which advisor's desk you're viewing,
an initials avatar, a role text label, and a standalone "Sign out" button —
all inline, all equal visual weight) is gone from that row. In its place:
a new `AccountMenu` component now sits in the top-right of the *global*
header (ShellChrome), showing the signed-in advisor's own circle avatar,
name, and role label, with a caret that opens a popover menu (Set yourself
as away / Preferences / Sign out). Design rationale: account identity and
sign-out are session-global concerns, not Workbench-tab-specific ones, so
they belong in the persistent global header, not the scrollable sub-nav
row — and Sign out no longer sits at the same visual weight as a primary
action. The advisor-switcher (`<select>`) was dropped per explicit design
decision, not merged elsewhere — there is currently no in-app control that
changes `advisorId` after initial load. "Invite Customer" stayed in its
original place in the Workbench sub-nav row (unaffected).
**Files touched:**
- `src/components/AccountMenu.tsx` (new)
- `src/components/ShellChrome.tsx`
- `src/styles/app-shell.css`
- `src/app/(authenticated)/(workbench)/layout.tsx`
**Data/API status:**
- Real (already wired): avatar initials + name resolve from the real
  `advisors` table (same endpoint the old avatar used); role label and
  Sign out reuse the existing `AdvisorSessionContext`/`AdvisorLoginGate`
  auth plumbing unchanged.
- Needs backend attention: "Set yourself as away" and "Preferences" menu
  items are placeholder/dummy — no click behavior, no backend endpoint.
  Left in deliberately as reserved menu slots; not wired to anything yet.
**Env vars added/changed:** none
**Backend action needed:** None yet — flag if/when "away status" or a real
preferences surface gets scoped, since neither exists server-side today.

---

## 2026-08-27 — Switched entire type system to IBM Plex

**What changed:** Replaced all three font tokens with the IBM Plex family:
`--serif` (Cormorant Garamond → IBM Plex Serif), `--eyebrow` (Cinzel → IBM
Plex Sans Condensed), `--sans` (system font stack → IBM Plex Sans, with the
same system stack kept as fallback). Updated the Google Fonts `@import` to
load all three IBM Plex families/weights. Since every stylesheet already
referenced these three tokens exclusively (confirmed during the earlier
token-consolidation pass — zero hardcoded `font-family` declarations
anywhere), this one change propagated across the entire app with no
per-component edits needed. Also removed the root layout's leftover
`next/font/google` loading of Geist/Geist Mono (from the original
create-next-app scaffold) — confirmed via grep that no CSS rule anywhere
referenced `--font-geist-sans`/`--font-geist-mono`, so it was downloading
two entirely unused font families on every page load.

**Files touched:**
- `src/styles/tokens.css` (`--serif`/`--eyebrow`/`--sans` token values)
- `src/styles/styles.css` (Google Fonts `@import`)
- `src/app/layout.tsx` (removed unused Geist/Geist Mono `next/font` loading)

**Data/API status:** N/A — pure typography change, no data or API surface touched.

**Env vars added/changed:** none.

**Backend action needed:** None. Verified via the dev inspector tool
(`getComputedStyle` check) that the brand wordmark, nav, and eyebrow labels
all now resolve to IBM Plex Serif / IBM Plex Sans / IBM Plex Sans Condensed
respectively — no visual regressions.

---

## 2026-08-27 — Dev inspector tool + reduced "Verifying your desk access" churn

**What changed:** Two dev-only additions, both gated by `NEXT_PUBLIC_APP_ENV=
development` (never present in a real deployment):

1. **Hover inspector** — press "I" anywhere in the app (including the
   sign-in screen) to toggle a hover tooltip showing the hovered element's
   computed font, color, padding/margin, flex container/item properties,
   border-radius, border, and shadow. Wherever a value matches a live
   design token, it's labeled (e.g. `color: rgb(23,19,16) (--ink)`) — read
   directly from `tokens.css` at runtime via `getComputedStyle`, not a
   hand-maintained list, so it can never go stale. Press "L" to lock the
   tooltip on the current element (move the mouse to read it without it
   jumping around); press again to unlock. Both are single unmodified keys,
   safely ignored while typing in any input/textarea (verified against the
   sign-in form).
2. **Auth-resolve dev cache** — `AdvisorLoginGate` was re-verifying advisor
   role with the real backend on every full reload (harmless in production,
   but during active local dev — where a source change or `.env` edit
   forces a reload — this meant "Verifying your desk access…" flashing far
   more often than the underlying Supabase session actually changed).
   Caches the resolved `{advisorId, role}` in `sessionStorage`, keyed to the
   current access token, and skips the network round-trip on a repeat
   resolve of the SAME token; a genuinely new sign-in still always
   re-verifies for real. Cleared on sign-out.

**Files touched:**
- `src/components/DevInspector.tsx` (new)
- `src/components/AppRoot.tsx` (mounts it alongside the gate, not inside
  its `render`, so it's present on every stage including sign-in)
- `src/components/AdvisorLoginGate.tsx` (dev resolve cache)

**Data/API status:**
- Real (already wired): the auth cache still calls the exact same
  `resolveAdvisorSession()` → real `advisor-console` backend function on any
  new token; it only skips the round-trip for a REPEAT resolve of a token
  already verified this tab session.
- Needs backend attention: none — both are frontend-only dev conveniences
  with no API surface of their own.

**Env vars added/changed:** none new — both reuse the existing
`NEXT_PUBLIC_APP_ENV` flag from the Autofill-button change above.

**Backend action needed:** None. FYI: the auth-resolve cache is
`sessionStorage`-scoped (cleared when the tab closes) and hard-gated to
`NEXT_PUBLIC_APP_ENV=development` — it cannot mask a real role change in
any real deployment, since production never takes this code path.

---

## 2026-08-27 — Design token consolidation (colors)

**What changed:** Audited every stylesheet against `tokens.css` (the declared
canonical design system) and fixed real drift: a full duplicate `:root`
token block in `styles.css` (some values had silently diverged from
`tokens.css`'s — e.g. a differently-tuned `--success-ink`), ~100 hardcoded
hex colors in `advisor-workbench.css` that had an exact token equivalent,
60 dead `var(--token, #fallback)` CSS fallbacks that could never activate
(the primary token is always defined) some of which had gone stale, and two
real component-family inconsistencies (`.taw-margin--ok` used flat white
instead of its siblings' `--success-bg`/`--danger-bg`/`--gold-bg` pattern;
`.taw-chip--fare` used a slightly-off cream instead of the `--gold-bg` its
sibling chips already used). Also deleted two dead CSS files entirely:
`index.css` (unmodified Vite/React starter-template boilerplate — a
`#root { width: 1126px }` counter-demo layout that has nothing to do with
this product) and `App.css` (never imported anywhere). Deleting `index.css`
surfaced a real bug it had been silently causing: two live components
(`OrdersBoard.tsx`'s "Net yield", `QuoteBuilder.tsx`'s "Markup") were
styled with `var(--accent)`, which only resolved because of `index.css`'s
leftover Vite purple (`#aa3bff`) — fixed to the correct, already-established
`--gold-ink` token instead.

**Files touched:**
- `src/styles/tokens.css` (added `--sage`/`--terracotta`/`--cognac-bg`/
  `--cognac-ink`/`--maxw` — real, actively-used values that were only ever
  declared in `styles.css`'s duplicate block, now centralized)
- `src/styles/styles.css` (duplicate `:root` block removed)
- `src/styles/advisor-workbench.css` (hex → `var()`, dead fallbacks stripped,
  two family-inconsistency fixes)
- `src/components/panels/OrdersBoard.tsx`, `QuoteBuilder.tsx` (`--accent` → `--gold-ink`)
- `src/app/globals.css` (dropped the `index.css`/`App.css` imports)
- Deleted: `src/styles/index.css`, `src/styles/App.css`

**Data/API status:** N/A — pure styling cleanup, no data or API surface touched.

**Env vars added/changed:** none.

**Backend action needed:** None. Purely visual/CSS — verified pixel-equivalent
before/after (screenshot comparison) aside from the two intentional bug fixes.

**Process note:** used a Python script (not manual per-line edits) to do the
hex→token matching and dead-fallback stripping across the ~530-line
stylesheet — see the "efficient workflow" discussion for why this is the
default approach for mechanical, well-defined changes going forward.

---

## 2026-08-27 — Sign-in screen: Autofill button + dev/production env flag

**What changed:** Added an "Autofill" button on the sign-in screen, right-aligned
next to "Forgot password?" on the same row. Clicking it fills the email/password
fields with a locally-configured advisor login and immediately submits — a
convenience for the designer to get past the login screen quickly while
iterating on UI, without ever bypassing real authentication. Also added an
explicit `NEXT_PUBLIC_APP_ENV` flag (`development` / `production`) so
dev-only UI like this can never render in a real deployment.

**Files touched:**
- `src/lib/env.ts` (new)
- `src/components/AdvisorLoginGate.tsx`
- `src/styles/advisor-login.css`
- `.env.local`, `.env.example` (new)
- `.gitignore`

**Data/API status:**
- Real (already wired): Autofill calls the exact same `signInWithPassword()`
  Supabase Auth call as typing credentials by hand and clicking "Sign in" —
  no mock, no bypass, no shortcut around auth.
- Needs backend attention: none. This is a frontend-only, env-gated
  convenience; it has no API surface of its own.

**Env vars added/changed:**
- `NEXT_PUBLIC_APP_ENV` — `development` | `production`. Must be set to
  `production` in every real deployment (staging/prod hosting config) —
  it's what hides the Autofill button outside local dev.
- `NEXT_PUBLIC_DEV_AUTOFILL_EMAIL` / `NEXT_PUBLIC_DEV_AUTOFILL_PASSWORD` —
  local-only (`.env.local`, gitignored), a real provisioned advisor login.
  Button is hidden entirely unless both are set AND `NEXT_PUBLIC_APP_ENV=development`.

**Backend action needed:** None. FYI only — when provisioning is set up,
worth knowing a `development`-flagged deploy will show this button to anyone
who can read its `.env.local`; it should never be set on a real deployment.
