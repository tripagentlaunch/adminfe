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
