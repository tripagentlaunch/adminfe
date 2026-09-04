# TripAgent Admin Frontend — Backend Handoff

A screen-by-screen, element-by-element reference for the backend developer connecting this frontend to real data. For every piece of UI: what it does, where its data comes from **today** (real Supabase/FastAPI call, mock fallback, or pure local React state with no persistence at all), and what needs to be built for it to be fully real.

This is a living demo/MVP frontend (Next.js App Router + TypeScript) built ahead of the backend in several places — mock data and local-only state stand in for what a real backend will eventually own. Every mock source is a named file under `src/lib/mock*.ts`; every real call goes through `src/services/api.ts`. Nothing in this doc is guesswork — every claim is backed by a specific file/function, cited inline.

**Companion doc:** [DESIGN-CHANGES.md](DESIGN-CHANGES.md) is a chronological changelog (what changed, when, why) — read this doc for **current state**, that one for **history**.

---

## 1. How the app is wired together

- **Framework:** Next.js App Router, TypeScript, all client components (`"use client"`).
- **Shared state:** One `WorkbenchDataProvider` (`src/components/WorkbenchDataProvider.tsx`), mounted once in `AppRoot.tsx` above the router, exposes everything via `useWorkbench()` (`src/lib/workbenchContext.tsx`). Every route reads/writes the SAME instance — there is no per-route or per-tab isolation of this state, and **none of it persists** across a page reload beyond what's already been fetched from the backend. Refreshing the browser loses any itinerary being built, any proposal sent, any selection — all of it is plain `useState`, no `localStorage`, no draft-saving.
- **Two networking primitives in `src/services/api.ts`:**
  - `call(fn, body)` — `POST`s to a named Supabase **Edge Function** (`FUNCTIONS_BASE + fn`). Used for anything that's an action/mutation (search, create order, journey-tick, etc.).
  - `db(path)` / `dbOne(path)` — looks like a PostgREST path (`"members?select=*&limit=100"`) but does **not** hit Supabase's PostgREST directly. It's parsed into `{table, filters, select, limit}` and routed through a `data-read` Edge Function running with the service-role key, which enforces a strict table+column allowlist server-side (see `src/services/api.ts:254-` `db()`). This is a deliberate security boundary: once RLS is enabled, the browser's public key can't read tables directly, so member PII (passport numbers etc.) is never browser-exposed. **Any new table a backend dev wants the frontend to read must be added to that allowlist**, not just exposed via RLS.
- **Real vs. mock, the general pattern:** almost every "Search" action (flights/hotels/visas) tries a real API call first; on failure (network error, 404, anything) it **silently falls back to locally-generated mock data** and shows a toast: *"Live API unreachable — showing demo … data"*. This means the UI can look fully functional in a demo while doing nothing real. Every such fallback is called out explicitly in the sections below.
- **Two git branches:** `Demo` (iteration) and `main` (promoted/dev-ready) — both currently at the same commit as of this doc. `main` is what a backend dev should treat as the reference snapshot.

---

## 2. Data model — what's real, what's mock-only

| Entity | Real source | Mock source | Notes |
|---|---|---|---|
| **Advisor** | `advisors` table via `db()` (`WorkbenchDataProvider.tsx:52`) | — | Fully real; first advisor auto-selected if none in session. |
| **Member** | `members` table via `db()` (`:53`) | `MOCK_MEMBERS_BY_ID` (`src/lib/mockEnquiries.ts`) merged into `membersById` **ahead of** real rows (`:59-63`) | Real members load fine, but carry almost none of the rich profile fields the UI renders (see below) — those only exist on the 3 mock members. |
| **Enquiry** | `enquiries` table via `db()` (`:54`) | `MOCK_ENQUIRIES` (`src/lib/mockEnquiries.ts`) — **always concatenated in front of real rows** (`:67`, comment: *"Mock enquiries are merged in ahead of real ones so they're immediately visible for the demo"*) | **Critical gap:** a real Supabase enquiry has none of the fields the Itinerary Builder depends on — no `ask` object at all (confirmed in `EnquiryInbox.tsx:79`: *"real Supabase enquiries don't have `ask` yet"*). Concretely: `ask.dateRange`, `ask.destinations`, `ask.from`, `ask.persons`, `ask.flight`/`ask.hotel` preferences, `ask.dateFlex`, `ask.budgetCap` — **none of these exist on a real row**. Every downstream feature keyed off them (date-bound seeding for the Itinerary Builder, Search desk defaults, Traveller Profile's request detail, hard-constraints list) silently degrades to nothing/defaults for a real enquiry. This is the single biggest thing a backend dev needs to design: **what does a real enquiry's structured `ask` look like, and where does it get populated from** (an intake form? an LLM parse of the raw message? manual advisor entry?). |
| **Itinerary** (per enquiry, in the Itinerary Builder) | **None — 100% local state**, `itinerariesByEnquiry: Record<string, any>` in `WorkbenchDataProvider.tsx:47` | `MOCK_ITINERARY` (`src/lib/mockItinerary.ts`) is the seed for "Generate AI Itinerary"; a "Start from scratch" itinerary is `blankItinerary()` (`src/lib/itineraryFromCart.ts`) | **No backend concept of an itinerary exists at all yet.** Everything — every flight/hotel/visa added, every edit, every removal, every date change — lives only in browser memory and is gone on reload. This is the biggest piece of net-new backend work: a real `itineraries` table (or equivalent), CRUD endpoints, and a real "Generate AI Itinerary" call (currently just clones a hardcoded Switzerland trip regardless of the enquiry). |
| **Proposal queue** | **None — 100% local state**, `proposalQueue: ProposalQueueEntry[]` in `WorkbenchDataProvider.tsx:43` | — | Populated only by "Send to Proposal"; nothing persists it. See §5.6. |
| **Order** | `orders` table via `db()`; `createOrder(quoteId)` via `call()` (real Edge Function) | — | Real, but entirely disconnected from the Itinerary Builder/Proposal flow above — there is currently no code path from "advisor built an itinerary" to "an order exists". That bridge doesn't exist yet. |

---

## 3. Enquiries / Console — the core advisor flow

Route: `/console` (redirects into `/console/queue`) and `/console/proposal-composer`. This is the **primary screen this session's work focused on** — an advisor answers one client enquiry with a full itinerary proposal, end to end. It is NOT for booking or ticketing (see the item-actions removal in DESIGN-CHANGES.md, 2026-09-04) — that happens downstream in Advisor Workbench once a proposal is approved.

### 3.1 Layout

Three-column grid (`WorkbenchTab.tsx`): **Queue/Traveller Profile** (shared accordion column, left) → **Itinerary Builder** (center) → **Search** (Flights/Hotels/Visas, right, always visible).

### 3.2 Queue / Traveller Profile (`QueueProfileAccordion.tsx`, `EnquiryInbox.tsx`, `Member360.tsx`)

- One shared column, two boxes, mutually exclusive open/closed (`open: "queue" | "profile"` state, `QueueProfileAccordion.tsx:58`). Clicking either section's own chevron toggle flips to the other. Picking an enquiry auto-collapses Queue and opens Profile (`selectEnquiry()`, `:71-74`).
- **Queue** (`EnquiryInbox.tsx`): lists every non-closed enquiry (`enquiries.filter(e => e.status !== "closed")`), sorted SLA-breach-first then oldest-first (`enqSla()` from `advisorHelpers.ts`). Each row shows: member name (or "New lead" if no `member_id`), pax count (from `ask.persons.length` — **mock-only field**), hours-since-created with a red "breach" state past SLA, destinations + service types (from `intent.destinations`/`intent.services` — real fields, present on real rows too), and "Departs {month}" (from `ask.dates.month` — **mock-only**, real rows show "No dates yet"). Clicking a row calls `onSelect(e, m)` → `pickEnquiry()` in the provider, which sets `selEnqId`/`member` and fires a toast.
- Empty state (no open enquiries) shows a fallback list of up-to-6 members to start a session with directly, bypassing the enquiry entirely (`onPickMember`, `EnquiryInbox.tsx:34-44`) — this path sets `member` with `selEnqId: null`, meaning **no itinerary can be built** (the Itinerary Builder requires `selEnqId`) — it's only useful for whatever other panels key off `member` alone (Comms, etc.).
- **Traveller Profile** (`Member360.tsx`): the enquiry's own request detail (message, ask.*, dateFlex, budgetCap, hard constraints, documents on file), not a generic member profile. Per its own docblock: *"Most of this enquiry-level detail … only exists on the 3 MOCK_ENQUIRIES/MOCK_MEMBERS_BY_ID entries — a real Supabase enquiry/member won't have these fields yet."* Every section is conditionally rendered on its own data being present, so a real row degrades to a shorter card rather than breaking — but a real enquiry today renders almost nothing here beyond name/nationality/passport-if-present.

### 3.3 Itinerary Builder (`ItineraryView.tsx`, 790+ lines — the largest, most complex component in the app)

Three states per enquiry, driven entirely by `itinerariesByEnquiry[enquiryId]` (local state, see §2):

**A. No itinerary yet** → chooser: "Generate AI Itinerary" or "Start from scratch" (`WorkbenchTab.tsx:119-126`).
- **Generate AI Itinerary** → `initItinerary(enquiryId, "ai", enquiry)` → deep-clones `MOCK_ITINERARY` verbatim, **regardless of which enquiry or member it's for** (`WorkbenchDataProvider.tsx`). It's always the same fixed Switzerland/8-night/Zurich-Lucerne-Zermatt trip with the same 4 flight/hotel items in various states (on-hold, awaiting-supplier, price-changed, not-selected). **This is the single most important thing for a backend dev to replace**: a real "generate an itinerary from what the enquiry asked for" call — presumably an LLM or rules-based planner reading the enquiry's `ask` and returning a real flight/hotel/visa shortlist. The itinerary's date bound (`startIso`/`endIso`) is seeded from the mock's own day span, not the enquiry, since the mock data is fixed anyway.
- **Start from scratch** → `blankItinerary()` (empty `days: []`, `visa: null`) with its date bound (`startIso`/`endIso`) seeded from the enquiry's own `ask.dateRange` via `boundFromDateRange()` (`itineraryFromCart.ts`) — a best-effort regex parse of a "D – D Mon" string assuming year 2026 (hardcoded — **will need a real year source once this isn't a demo pinned to 2026**), returning `null` (no bound, nothing flagged) if it can't parse. Since real enquiries have no `ask.dateRange` at all, a scratch itinerary for a real enquiry has **no date bound whatsoever** — the out-of-bound-date feature (§3.3.5) simply never triggers for it.

**B. Itinerary exists** → the full builder view, described below.

**C. `ItineraryView` unmounted** whenever `selEnqId` has no itinerary yet — WorkbenchTab conditionally renders it only once `itineraryData` exists (`WorkbenchTab.tsx:101-108`).

#### 3.3.1 Summary header
Destination/date-range title, cities/nights/pax/purpose line, **"Send to Proposal"** button (opens the Summary modal, §3.6), and a financial rollup: Total (a range if any item's price is only a "from" estimate) / Confirmed / Held / Unresolved, plus a proportional segmented bar. All computed client-side from `data.totals` (itself just accumulated as items are added/removed — never independently verified against real supplier prices) and `data.days`.

#### 3.3.2 Attention banner
"N items need attention" — collapsible (button + rotating chevron, `alertsOpen` state, defaults open). Lists `data.alerts[]` (curated strings in the mock data only — a Search-added item never generates an alert entry) as clickable rows that jump to (scroll + auto-expand) the relevant day/visa.

#### 3.3.3 Category tabs
All / Flights / Hotels / Visa — client-side filter over `data.days`/`data.visa`, no data implication.

#### 3.3.4 Day list & items (the core hierarchy)
- Days render as **dividers**, not cards (`border-bottom` only) — collapsed to one line by default unless attention-tier or out-of-bound (auto-open), toggle state is a sparse map of explicit overrides only (falls back to computed default every render — this pattern fixed 3 separate "added item defaults to wrong open state" bugs this session, see DESIGN-CHANGES.md 2026-09-03).
- Each item (flight/hotel) has two tiers: **"attention"** (on_hold / awaiting_supplier / price_changed / not_selected — full card with detail, chips, status pill) vs **"done"** (booked — collapses to one line). `tierOf()`/`STATUS_META` in `mockItinerary.ts` is the single place status maps to tier/color/label — **this status vocabulary (6 fixed strings) is currently mock-only; a real backend integration needs to decide whether these are real supplier states it maps onto, or whether the frontend's status model needs to change to match whatever the real booking/hold system returns.**
- **Only one real per-item action exists: Remove.** (Every other action — "Issue ticket", "Extend hold", "Accept new rate", etc. — was deleted 2026-09-04; none were ever wired to anything, and all were out of scope for a proposal-composition screen. See DESIGN-CHANGES.md for the full reasoning.) Replacing a pick is Remove + re-Add via Search.
- Inline editing: a day's own date (real `<input type="date">`, commits to both `_iso` and the display string, then **re-sorts and relabels every day** — see §3.3.5) and a hotel item's room type / flight's cabin (plain click-to-edit text, `EditableText` component). Nothing else (price, confirmation numbers, segment detail) is editable — those are meant to be supplier-confirmed facts.
- Item-level drag-reorder within a day (not across days — a day change is a date edit, not a reorder).

#### 3.3.5 Date-bound flagging (2026-09-04 feature — the most recently built, most likely to need backend alignment)
Every itinerary carries `startIso`/`endIso` — its own "committed" date range (see seeding logic in 3.3 above). Any day whose `_iso` falls outside that range renders in its own flagged section: real date as the label (not "Day N"), an amber "Outside itinerary dates" pill, and an expanded prompt with an "Include as Day #" control. Confirming extends the bound (and recomputes `dateRange`/`nights`) and the day picks up a normal "Day N" label with everyone else renumbering to match — driven purely by keeping `data.days` sorted by `_iso` (`resortDays()` in `itineraryFromCart.ts`), never by anything server-side. **This entire concept — an itinerary having a "committed" date range distinct from its actual day contents — does not exist in any backend data model yet.** If a backend `itineraries` table gets built, it needs an equivalent bound field (or the frontend needs to keep deriving it, which only works today because of the enquiry `ask.dateRange` gap noted in §2).

### 3.4 Search (`SearchDesksPanel.tsx` → `FlightDesk.tsx` / `HotelDesk.tsx` / `VisaDesk.tsx`)

One card, a dropdown switches between three desks. Results **replace** the form (not shown below it) once a search runs, matching pattern across all three desks (`showResults`/`backToSearch()`); the card grows to fill the column and only the innermost result list scrolls internally (`SleekScroll`), reported via `onExpandChange`.

- **Defaults are seeded from the selected enquiry's `ask`** (2026-09-04 fix) — Flights' From/To from `ask.from`/`ask.destinations[0]` via a small hardcoded `CITY_AIRPORT_CODES` table (Delhi/Mumbai/Singapore/Goa/Dubai only — **a real airport-code lookup is needed for this to scale past the 3 mock enquiries' cities**); Hotels' city straight from `ask.destinations[0]`; Visa's destination only if it's one of the desk's 7 supported countries. **All of this silently does nothing for a real enquiry** (no `ask` → defaults fall back to hardcoded DEL/Dubai/UAE).
- **Flights** (`FlightDesk.tsx`): tries `fastapiFlightSearch`/`fastapiFlightAutosuggest` (real FastAPI backend, separate service — see §6) first; on failure falls back to `buildMockFlightOffers()` (`mockFlightSearch.ts`) with a toast. Fare-detail expander calls `flightFares` similarly.
- **Hotels** (`HotelDesk.tsx`): `USE_REAL_HOTELS = true` constant — tries `hotelAutosuggestV2`/`hotelListingV2` (real TripSure integration via the backend) first, falls back to `buildMockHotelOffers()` (`mockHotelSearch.ts`) with a toast. Property-detail expander calls `hotelProperty` (real, when reachable) — advisor-facing (net rates visible; a member-facing surface would need the sell-only variant per the code's own comment).
- **Visa** (`VisaDesk.tsx`): tries `searchVisa` (real, OneVasco-backed per comments elsewhere in the codebase) first, falls back to `buildMockVisaOffer()` (`mockVisaSearch.ts`).
- **"Add"** on any result calls `onAdd()` → `addSearchItemToItinerary()` (`WorkbenchDataProvider.tsx`), which auto-seeds a blank itinerary if none exists yet, then `addCartItemToItinerary()` (`itineraryFromCart.ts`) buckets it into the day matching its date (creating a new day if needed) — **direct write, no cart/staging step**, an explicit scope decision this session ("Cart is not necessary at all for this flow"). `CartPanel.tsx` exists in the codebase but is **dead code** — not imported by this flow (confirm with Agent 1/2's findings on where it's actually used, if anywhere).

### 3.5 Send to Proposal → Summary modal (`ItinerarySummaryModal.tsx` / `ItinerarySummaryContent.tsx`)
A pause-point confirm dialog — recaps the itinerary (days, totals, an "X days still need attention" banner). "Continue to Proposal Composer" calls `sendItineraryToProposal()` (writes into `proposalQueue`, keyed by enquiryId — upserts, so re-sending replaces rather than duplicates) and navigates to `/console/proposal-composer`.

### 3.6 Proposal Composer (`console/proposal-composer/page.tsx`)
Two-column layout, **always** rendered (queue + content, each with its own empty state) regardless of whether anything's been sent yet. Queue = `proposalQueue` (local-state-only, see §2), one entry per enquiry (upserted). Selecting an entry shows `ItinerarySummaryContent` read-only, plus this exact literal string in the UI: **"The real compose/preview/send UI isn't built yet — this is confirming the handoff itself worked."** (`page.tsx:80`). The empty state's own copy states the intended real scope: *"Assemble, preview exactly as the client sees it, send via WhatsApp — per the Product Flow doc §5.2."* — **this entire screen, beyond the read-only recap, is unbuilt.** No backend endpoint exists for "send a proposal to a client" at all yet.

---

## 4. Advisor Workbench routes

Everything under `src/app/(authenticated)/(workbench)/` (a route group adding no URL segment). All wrapped by `(workbench)/layout.tsx`, which renders the "Advisor Workbench" tab bar and reads shared advisor/member/enquiry state from the same `useWorkbench()`/`WorkbenchDataProvider` described in §1/§3.

Two gating helpers recur throughout (`advisorHelpers.ts`): `canSeeMargin()` (true only for `window.TA_ROLE === "head_of_business"` or a `TA_SHOW_MARGIN` flag — gates Earnings/Reconciliation, rendering `null` otherwise) and `isAdmin()` (`window.TA_ROLE === "admin"` — gates Admin). **Both are UI-only conveniences; the backend re-checks role independently on every call**, so neither is a real access-control boundary by itself.

### 4.1 Orders Board — `/orders`

**Component:** `OrdersBoard.tsx`. **Purpose:** the advisor's view into every order and its live booking-saga state machine — see what's booked, drive the multi-supplier saga (flight+hotel+visa legs booking atomically with compensation), preview change/disruption impact before opening a real service case.

- Orders list (left rail, clickable rows) + Refresh.
- "Simulate supplier failure" toggle → reveals a leg-picker for injecting a failure.
- "Run Booking Saga" button → `runSaga(order_id, opts)` (disabled unless status is `CONFIRMING`/`PARTIALLY_BOOKED`).
- Disruption & change preview tabs (flight/hotel legs only): Classify disruption, Re-protect, Exchange quote, Void eligibility, Refund quote, Hotel cancel/amend preview — all **read/quote-only**, no money moves, no case opened.
- "Post-sale servicing" section — **permanently stubbed**: `useServicingModule()` hardcodes `{mod:null, err:"ServicingPanel — requires porting web/js/servicing.js (not yet scoped)"}` (`:27-29`); every order shows that exact error banner, always. Real, unfinished functionality — not a transient failure.

**Data:** orders list/detail/legs/timeline via real `db()` reads; saga via real `runSaga()`; change previews via real `flightIrrops()`/`hotelServicingRead()` (both explicitly read/quote-only per their own comments).

**Backend work needed:** port `web/js/servicing.js`'s `ServicingPanel`/`SimulateModal`/`ApprovalBadge` (or a Next equivalent) for in-order post-sale case actions. No API gap otherwise.

### 4.2 Servicing — `/servicing`

**Component:** `ServicingHub.tsx`, four sub-tabs: Intake, Holds, EMD, Refund preview. **Purpose:** order-scoped, non-money servicing ops — SSR/special-request/name-check capture, pre-issue hold management, flight EMD fulfilment, refund-figure preview.

- **Intake:** kind selector (SSR / Special request / Name check / Idempotency probe) + per-kind form → "Capture"/"Capture & hold" → real `servicingIntake()`. Per its own comment, the one chargeable branch (name-change) is HELD server-side, never charged from this panel directly.
- **Holds:** per-row Extend/Release/Lapse (Release/Lapse prompt for a reason) → real `holdServicing()`.
- **EMD:** order scope bar + per-row Reconcile/Residual → real `flightEmd()`.
- **Refund preview:** order scope bar → four read-only tiles (member refund/penalty/route/timeline) → real, explicitly non-posting `payRefundPreview()`.

**Naming trap worth knowing:** `HotelChangeQueue`, `GroupAirDesk`, `DisputeDesk` are **not** part of this hub despite sounding like servicing — they live under `/desk` (§4.6).

**Backend work needed:** verify `servicing-intake`, `hold-servicing`, `flight-emd`, `pay-refund-preview` are deployed and role-gated in every environment — each already degrades calmly ("isn't live yet") if unreachable, which is worth confirming isn't masking an actual deployment gap.

### 4.3 Disruptions — `/disruptions`

**Component:** `DisruptionQueue.tsx`. **Purpose:** live worklist of schedule-change/IRROPS signals ingested from suppliers, showing affected orders — triage only, "Open order" jumps to Orders Board; never executes a re-protection itself.

Filter buttons (Open/Critical/All with counts) + Refresh + per-row "Open order". **Data:** real, `call("disruption-ingest", {action:"queue"})` — no dedicated wrapper in `api.ts`, goes through the generic transport. No mock data.

**Backend work needed:** ensure `disruption-ingest` is deployed and populated by a real supplier-signal ingestion pipeline — frontend is fully ready to consume it.

### 4.4 Approvals — `/approvals`

**Component:** `ApprovalsPanel.tsx`. **Purpose:** tiered decision inbox (above "auto" tier — duty-manager/finance sign-off, e.g. large refunds/exceptions) plus a workload/SLA dashboard.

Sub-tabs Inbox/Workload; Inbox scope toggle Mine/Team (server coerces Team→Mine if the caller lacks manager authority); per-item Approve/Reject/Escalate (Reject/Escalate prompt for a reason).

**Data:** real, `advisorWorkbench({action:...})` → `call("advisor-workbench-read", ...)`.

**Documented gap (quoted from `api.ts:618-621`):** *"approval_decide POSTS NO LEDGER and MOVES NO MONEY … it requires db/071 (advisor_approval_decisions) to be APPLIED to persist — until then the function degrades to `{error:'decide_failed'}`"* — the panel surfaces this as a calm "decision log not live yet" notice.

**Backend work needed:** apply DB migration `db/071` (`advisor_approval_decisions`) — right now the inbox displays fine but a real decision may silently fail to persist depending on migration state.

### 4.5 My Day — `/myday`

**Component:** `MyDayPanel.tsx`. **Purpose:** the advisor's personal ranked task worklist (follow-ups, callbacks, payment reminders, reviews) — daily-driver "what do I do right now" screen.

Filter buttons (Today/Overdue/Snoozed/All); per-task Done, Snooze (prompts for a reason, 24h default), Reassign (`<select>`, prompts for a reason); "Open" jumps to the linked order.

**Data:** fully real, `advisorTasks({action:...})` → `call("advisor-tasks", ...)`. Explicitly non-money — a `payment_pending` task is a reminder, not a ledger line.

**Backend work needed:** none beyond ensuring `advisor-tasks` generates real tasks from actual business events in every environment.

### 4.6 Desk — `/desk`

**Component:** `DeskHub.tsx`, three sub-tabs: Hotel changes, Disputes, Group air. (This — not Servicing — is where those three panels actually live; see the naming trap in §4.2.)

- **Hotel changes:** kind toggle (Date/room changes vs In-stay deviations); per-row Approve/Reject (Reject prompts for a reason) → real `hotelModifyOrchestrate()` (modify kind) / `hotelStayDeviation()` (deviation kind).
- **Disputes:** new-dispute order-id input + "Open dispute"; per-row Evidence/Submit/Resolve (free-text prompts) → real `disputeCase()`.
- **Group air:** per-row "Names"/"Deposit terms" → real `flightGroup()`, but the detail view is a **raw `JSON.stringify()` dump in a `<pre>` block** — data is real, UI is debug-grade, no name-list editing or deposit-schedule display exists yet.

**Backend work needed:** confirm `hotel-modify-orchestrate`, `hotel-stay-deviation`, `dispute-case`, `flight-group` are deployed — all four already have complete lifecycles defined contract-side. Document `name_list`/`deposit_terms` response shapes so a real Group Air UI can eventually be built over the raw dump.

### 4.7 Escalation Queue — `/queue` (nav: "Servicing Queue")

**Component:** `EscalationQueue.tsx`. **Purpose:** the master worklist over `servicing_requests` — every open post-booking case across all orders, with SLA countdowns, tier badges, ownership, and a low-risk auto-resolve affordance. The primary "clear my case backlog" screen, broader than Approvals.

Filter buttons (Open/Approvals/Mine/All); per-case Approve (for `AWAITING_APPROVAL`/`ESCALATED`), Auto-resolve (runs approve→execute back-to-back, only for cases already quoted into the "auto" tier), Snooze/Wake, Reassign owner (`<select>`); "Open" jumps to the order.

**Data — mixed, important distinction:**
- Case list: real, `db("servicing_requests?...")`, enriched per-row via real `servicingCase({action:"status", case_id})` for the full FSM shape.
- Approve/Auto-resolve: real, `servicingCase({action:"approve"|"execute", ...})`.
- **Snooze and Reassign-owner are local React state only — never persisted.** Quoted directly (`EscalationQueue.tsx:50-54`): *"Queue-side assignment/snooze annotations (SVC-077). These are worklist metadata, not case-FSM state — there is no servicing-case action to persist them and db() is read-only (data-read), so we keep them as session state on the queue rather than fabricating a write the backend can't honour."* **Refreshing the page, or another advisor loading the same queue, will not see these changes.** This is the single most concrete real-data-loss gap found in the Advisor Workbench.

**Backend work needed:** add a `servicing-case` action (or new endpoint) to persist ownership transfer and snooze state server-side. Also port `ApprovalBadge` (same gap as Orders Board) — currently silently falls back to a plain `<span>` badge here.

### 4.8 Visa Desk — `/visa`

**Component:** `VisaDeskQueue.tsx`. **Purpose:** visa-application lifecycle queue (submitted/in_review/decided) across all members — document collection tracking, approve/reject decisions.

Filter buttons (Queue/In review/Decided/All); per-application document checklist (toggle chips, local draft until committed) → "Mark docs collected"; Approve (disabled until all docs collected)/Reject (prompts for a required reason) — both gated by `canDecideVisa(role)` (role must be head_of_business/senior_advisor/visa_desk_lead/manager, or a force-flag).

**Data:** fully real, on the **FastAPI backend** (recently migrated off the legacy edge function) — `visaQueue()` → `GET /visa/queue`, `commitDocs()` → `POST /visa/applications/{id}/advisor-commit-docs`, `visaDecide()` → `POST /visa/applications/{id}/decide`.

**Backend work needed:** none — fully wired to a real, migrated backend.

### 4.9 Appointments — `/appointments`

**Component:** `VisaAppointmentDesk.tsx` (exclusively this route — `/visa` renders `VisaDeskQueue`, not this). **Purpose:** visa appointment-slot lifecycle — offering slots, sweeping upcoming-appointment reminders. Pure scheduling, no money.

"Scan reminders" button, Refresh, per-row "Offer slots". **Data:** fully real, `visaAppointment({action:...})` → `call("visa-appointment", ...)`.

**Backend work needed:** confirm the edge function is deployed with a real appointment-provider integration (OneVasco or similar) behind `offer_slots`/`scan_reminders`.

### 4.10 Reconciliation — `/recon` (gated by `canSeeMargin()`)

**Component:** `ReconciliationPanel.tsx` + `HotelCommissionRecon`. **Purpose:** head-of-business money-safety/commission dashboard — unmatched supplier-statement exceptions, hotel commission reconciliation, provisional-vs-realised commission per order, supplier settlement statements.

Exception status filter (Open/Resolved/Written off/All); per-exception Resolve/Write off; Refresh (main + nested sections).

**Data — mixed, transparently labelled in-UI:**
- Exceptions: real, `call("reconcile-settlement", {action:...})`, with a documented fallback to a direct `db()` read if the function transport is unavailable.
- Hotel commission: real, `hotelCommissionRead()` → `call("hotel-commission-read", ...)`.
- Supplier settlements: **best-effort read-model**, `db("supplier_settlements?...")`. If not exposed, shows an explicit in-UI notice (not a silent failure): *"The supplier_settlements read-model is not exposed to the workbench yet. Provisional commission below is read from the priced tax breakdown; realised settlement will appear here once the read-model is live."* (`:221`)
- Commission provisional: real, `tax_calculations`/`orders` tables. "Realised" commission is `null`/`—` for **every row** until `supplier_settlements` exists — the whole realised-vs-provisional comparison is currently provisional-only in most environments.

**Backend work needed:** expose/allowlist the `supplier_settlements` table (or a dedicated read function) so "realised" commission actually populates — the column is structurally present but data-empty until this ships. Verify `reconcile-settlement`/`hotel-commission-read` are HOB-role-gated server-side (the route's `canSeeMargin()` is UI-only).

### 4.11 Earnings — `/earnings` (gated by `canSeeMargin()`)

**Component:** `EarningsPanel.tsx`. **Purpose:** an individual advisor's own book-of-business — commission earned, goal attainment, line-item statement. Hard-gated server-side on `advisor_id` — a member session can never reach it.

Sub-tabs Scorecard/Earnings/Statement; "Set goal" (prompts for a monthly INR figure) → `set_goal` action; Refresh.

**Data:** fully real, `advisorBookOfBusiness({action:...})` → `call("advisor-book-of-business", ...)`.

**Backend work needed:** confirm the edge function is deployed everywhere — its 3 read actions + 1 write action are all the panel needs, no contract gap.

### 4.12 Admin — `/admin` (gated by `isAdmin()`)

**Component:** `AdminPanel.tsx` (`AgentsSection`/`AdminOrdersSection`/`EnquiryAssignSection`). **Purpose:** platform oversight — activate/deactivate advisor accounts, view every order platform-wide, manually assign unassigned enquiries. A genuinely new screen (not ported from a legacy panel), built directly against the FastAPI admin router.

Sub-tabs Agents/Orders/Enquiry assignment; per-advisor Activate/Deactivate toggle; read-only orders list; per-enquiry advisor `<select>` + Assign.

**Data:** fully real, FastAPI — `adminListAdvisors()`/`adminUpdateAdvisor()`/`adminListOrders()`/`adminAssignEnquiry()`, plus a real `enquiries()` read for the unassigned filter.

**Backend work needed:** none — fully wired both sides, with server-side `role==='admin'` re-verification on every call.

### 4.13 Analytics — `/advisor-analytics` (nav "Analytics", **distinct from top-level `/analytics`** — this is per-advisor, that's platform-wide, see §5)

**Component:** `AnalyticsPanel.tsx`. **Purpose:** an individual advisor's own performance (bookings, booked value, median first-response time, enquiry→quote→booking funnel) plus anonymised peer ranking; head-of-business sees full per-advisor economics instead of anonymised peers.

"Export" button (pure client-side CSV generation/download, no backend call); Refresh.

**Data:** fully real, `analyticsSummary({advisor_id, role, show_margin})` → `call("analytics-summary", ...)`. Margin/net figures are gated **server-side** off the caller's DB role — the client-passed `show_margin` is advisory only (quoted, `api.ts:596-599`: *"MARGIN is gated SERVER-SIDE off the caller's DB advisor role … a forged body role/show_margin can NEVER unlock it."*).

**Backend work needed:** none — fully wired. (A defensive `pctClamp()` client-side guard exists against a previously-observed backend bug where percentages briefly exceeded 100% — worth knowing about, not an open issue.)

### 4.14 Leads — `/leads`

**Component:** `LeadsPanel.tsx`. **Purpose:** lead-routing workspace over open enquiries — an advisor's own assigned open leads, auto-route unassigned leads via weighted round-robin, manual reassignment with a reason, and an AI "warm handoff" summary brief.

View toggle My leads/Unassigned; "Auto-route" (unassigned only); "Handoff brief"; Reassign (`<select>`, prompts for a reason); Refresh.

**Data:** fully real — enquiry list via real `enquiries()`; actions via real `advisorProposals({action:"route"|"reassign_enquiry"|"handoff_summary", ...})`.

**Backend work needed:** none — fully wired.

### 4.15 Communications — `/comms`

**Component:** `CommsPanel.tsx` (`CommsInbox`→`CommsThread`, `CommsTemplates`→`CommsTemplatePreview`, `CommsDelivery`). **Purpose:** the advisor-side surface over the comms spine — an inbox of member conversation threads (email/WhatsApp/SMS) with real replies, a template catalogue with live render preview, and per-order/per-member delivery-receipt lookup.

Sub-tabs Inbox/Templates/Delivery; Inbox channel/status filters + clickable threads; Thread view has a **live reply composer** (textarea + Send, ⌘/Ctrl+Enter); Templates → clickable rows open a preview with per-variable inputs ("Preview only — sending is not available here"); Delivery → order-id lookup.

**Data:** inbox/thread/templates/preview/delivery-status are all real **read/preview-only** (`commsRead({action:...})` → `call("comms-read", ...)`). **The reply composer is the one live send** — `call("comms-orchestrate", {action:"orchestrate", ..., kind:"advisor_reply", ...})`.

**Documented gap (quoted, `CommsThread.tsx:52-54`):** *"Real WhatsApp/email transport is gated on the BSP/Resend A-gate, so the response's `simulated` flag tells us whether it actually went over a wire or is recorded for delivery once live."* — in some environments, sending a reply here does **not** actually deliver a message; it's recorded server-side pending the provider gate. Surfaced transparently to the advisor via toast ("Reply recorded — it will reach the member once live delivery is switched on" vs. "Reply sent to the member") and rendered UI copy in the thread itself.

**Backend work needed:** complete the WhatsApp BSP + Resend email provider integration gate — until then, replies from this screen are captured/logged but not guaranteed delivered over a real channel.

### 4.16 Delivery — `/delivery`

**Component:** `DeliveryPanel.tsx`. **Purpose:** two read-only diagnostics — comms delivery receipts for an order/correlation id (did the message land, bounce, fall back to another channel), and a directory of every member's preferred channel/language/quiet-hours.

Sub-tabs Delivery receipts (order/correlation-id lookup)/Preferences directory (Refresh only). **Data:** fully real, `commsDelivery()`/`commsPreferences()` → `call("comms-delivery"/"comms-preferences", ...)`.

**Backend work needed:** none beyond ensuring both edge functions are deployed.

### 4.17 Proposals — `/proposals` (legacy — distinct from Console's Proposal Composer, §3.6)

**Component:** `ProposalsPanel.tsx`. **Purpose:** assemble multiple named, side-by-side priced options ("Signature"/"Essential" etc.) for a member into one shareable proposal, mark one recommended, send it, version it, generate a branded PDF. Pure grouping over already-priced quotes — never touches money/ledger itself.

Member picker + "New proposal" (prompts for a title); proposal list → detail view with "Add option" (prompts for a raw Quote ID), "New version" (once `sent`), "Send proposal", "Generate PDF" (~5-min download link), per-option "Recommend".

**Data:** fully real, `advisorProposals({action:"create"|"add_option"|"set_recommended"|"send"|"version"|"get"|"list"|"render_pdf", ...})` → `call("advisor-proposals", ...)`.

**Real gap, not a backend one:** "Add option" requires the advisor to hand-type/paste a Quote ID (`window.prompt("Quote ID for this option (price a cart in the Workbench to mint one):", "")`) — but there is currently **no in-app flow that produces a quote id** to paste (see §4.18). An advisor needs some other, currently-unwired, cart-pricing surface to generate one.

**Backend work needed:** none — `advisor-proposals` is fully implemented. The gap is frontend: wire `QuoteBuilder`/`CartPanel` into a real route, or build a quote-picker directly into this panel over the advisor's recent priced quotes.

**Note:** this is a *separate, legacy, still-live* screen from the Console's own Proposal Composer (§3.6) — the two are not the same feature and currently have no relationship to each other. Worth a product decision on whether they should eventually merge.

### 4.18 `QuoteBuilder.tsx` / `CartPanel.tsx` — dead code, confirmed unreachable

Both exported from the panel barrel (`components/panels/index.ts`) but **never imported by any route** — no `/app` file references either, and the only other repo mention of `QuoteBuilder` is an unrelated CSS comment. Not reachable from any URL today. `QuoteBuilder.tsx` (300 lines) appears to be a cart-assembly + pricing UI (would call `price(cart)`/`createOrder(quote_id)` based on `api.ts`'s exports — not confirmed by direct read since it's unreachable); `CartPanel.tsx` (90 lines) looks like its cart-display dependency.

**Backend work needed:** none directly — a frontend routing gap, but it's the root cause of §4.17's "type in a Quote ID by hand" UX. Either wire one of these back into a real route, or confirm with product that quote-building has moved entirely into the Enquiries/Console flow and delete both files.

### 4.19 Cross-cutting summary for this section

**Fully wired, nothing to build:** Orders Board (except the servicing stub), Servicing, Disruptions, My Day, Visa Desk, Appointments, Admin, Analytics, Leads, Delivery, Desk.

**Fully wired but with a documented backend-side gap:** Approvals (needs DB migration `db/071`), Reconciliation (`supplier_settlements` read-model not exposed), Communications (WhatsApp/Resend provider gate not switched on).

**Real API but with a genuine data-loss risk today:** Escalation Queue's Snooze/Reassign-owner — pure client state, never persisted, silently lost on refresh or to other advisors.

**Frontend-only completeness gaps, no backend work needed:** Orders Board / Escalation Queue's `ServicingPanel`/`ApprovalBadge` port, Group Air's raw-JSON detail view, Proposals' manual-quote-id entry (rooted in `QuoteBuilder`/`CartPanel` being dead code).

---

## 5. Other top-level routes

### `/broadcast` — Supplier Broadcast & Bidding

- **Page:** `src/app/(authenticated)/broadcast/page.tsx` — thin wrapper, pulls `advisorId` from `useAdvisorSession()` and renders `<SupplierBroadcastPanel advisorId={advisorId} />`.
- **Panel:** `src/components/panels/SupplierBroadcastPanel.tsx` (479 lines). Nav label: "Supplier Broadcast & Bidding".

**Purpose:** the full RFQ (request-for-quote) lifecycle for a flight/hotel/visa spec: compose → human-approve & broadcast (Gate 1) → collect supplier replies → parse & rank bids → award the winner (Gate 2). `STAGES` = compose/approve/collect/bids/awarded (`:25`).

**Interactive elements:**
- Product `<select>` (`:332`) — flight/hotel/visa; resets the spec textarea to a canned JSON preset from `SPEC_PRESETS` (`:34`).
- Spec `<textarea>` (`:340`, JSON, free-text, parsed client-side before compose).
- **Draft RFQ** (`:349`) → `rfqCompose(product, spec, {advisor_id})`.
- **Approve & broadcast** (`:363`, Gate 1) → `rfqDispatch(rfqId, advisorId)` — nothing reaches suppliers before this click.
- **Discard** (`:367`) → resets all local state to compose stage.
- **Pull replies** (`:403`) → `rfqGet(rfqId)`, reads `.quotes`.
- **Simulate replies (dev)** (`:407`) → `rfqSimulate(rfqId)` then re-reads quotes — explicitly labeled dev/demo-only in the UI tooltip.
- **Parse & rank N bids** (`:411`) → `rfqParse(rfqId)` (best-effort, errors swallowed) then `rfqRank(rfqId)`, re-reads quotes, advances stage to "bids".
- **Re-rank** (`:425`, pre-award only) → same as above.
- Per-bid **Award this bid** (`BidCard`, `:97`, Gate 2) → `rfqAward(rfqId, bid.quote_id, advisorId)`.
- **New RFQ** → resets to compose.

**Data source:** everything on this screen is a real API response (`rfqCompose`/`rfqDispatch`/`rfqGet`/`rfqRank`/`rfqAward`) — **no mock/local-only data at all** in this panel.

**Called-out gaps (quoted from code):**
- `:10-13` — "Deliberately NOT ported: the legacy 'Add to workbench cart' action on the awarded screen … deferred per the scoping discussion, not dropped silently."
- `:198-203` — "Dev-only: fabricates supplier replies via the real FastAPI endpoint (`POST /rfq/{rfq_id}/simulate`, gated server-side by `RFQ_SIMULATE_ENABLED`, deterministic-only — no AI-authored replies) … Real replies arrive via n8n -> `POST /rfq/inbound` once that relay is built; this button exists so the flow is testable before then."

**Backend work needed:** the real supplier-inbound relay (n8n → `POST /rfq/inbound`, using an `X-Internal-Token`) is not built yet — until it is, "Simulate replies (dev)" is the only way to populate bids outside a demo. Everything else on this screen already has a live endpoint.

### `/journeys` — Journeys (Concierge Care)

- **Page:** `src/app/(authenticated)/journeys/page.tsx` → `<JourneysPanel advisorId={advisorId} />`.
- **Panel:** `src/components/panels/JourneysPanel.tsx` (354 lines). Nav label: "Journeys · Concierge Care · enquiry → home".

**Purpose:** lifecycle console for every customer journey moving through 8 stages (enquiry → quoted → booked → pre_departure → in_trip → returned → post_trip → closed, `STAGES:33`), with scheduled touchpoints (WhatsApp/email/SMS/app) that either auto-send or require advisor approval (`requires_approval`).

**Interactive elements:**
- Journey list (`JourneyCard`, `:95`) — click selects (`setSelId`), shows its stepper + touchpoint counts.
- **Run scheduler** (`:233`) → `journeyTick({})` — runs the real tick/cron logic on demand, then reloads; toasts how many touchpoints were delivered.
- Refresh icon (`:237`) → re-runs `load()`.
- Per-touchpoint **Approve & send** (`:325`, shown only when `requires_approval && status==="queued"`) → `journeyApprove({touchpoint_id, advisor_id, decision:"approve"})`, then `journeyTick({journey_id})` to actually send it.
- Per-touchpoint **Skip** (`:328`) → `journeyApprove(..., decision:"skip")` (no tick call).

**Data source:** `journeys`/`journeyTouchpoints` real table reads (`customer_journeys`/`journey_touchpoints` via `data-read`); member names via a real, independently-fetched `members(...)` read that silently degrades to no names on failure (`:156`, `.catch(() => [])`). No mock data. If the read fails in a "not deployed yet"-shaped way (matches `/unavailable|not found|404|403|forbidden|not permitted/i`), shows a soft "The journeys feed is not live yet." notice instead of a hard error (`:174-182`).

**Called-out gaps:**
- `:16-19` — "journey-advance (creating journeys / materialising touchpoints from templates) runs upstream of this panel — off order/quote lifecycle events, not off anything an advisor clicks here." **There is no UI path to create a journey** — they must already exist server-side.

**Backend work needed:** confirm `journey-advance` is deployed and wired to real order/quote lifecycle events (this panel can't create test data itself); confirm `journey-tick`/`journey-approve` edge functions are live (no fallback). Note the soft "not live yet" notice could mask an actual deployment gap during testing — worth checking explicitly rather than trusting the calm UI.

### `/pulse` — Trending Now & Great Deals

- **Page:** `src/app/(authenticated)/pulse/page.tsx` → `<TrendingDealsPanel advisorId={advisorId} />` (prop received but unused by the panel).
- **Panel:** `src/components/panels/TrendingDealsPanel.tsx` (290 lines). Nav label: "Trending Now & Great Deals".

**Purpose:** shows live "what members are searching/leaning into" signals; lets an advisor compose a promotional "Great Deal" from any signal; every composed deal goes into a human review queue before reaching members.

**Interactive elements:**
- Signal cards (`SignalCard`, `:44`) — **Compose deal** → `selectSignal(signal)` (`:147`), pre-fills the compose form.
- Compose form (`:240-261`): entity name, now/was price, comma-separated inclusions, advisor note — local state until submit.
- **Draft deal for review** (`:263`) → `pulseCompose({signal_id, service, entity_name, entity_city, entity_country, price_from, was_price, inclusions[], advisor_note})`.
- **Clear** → resets the compose panel.
- Per-draft **Approve** / **Send back** (`DraftCard`, `:98/101`) → `pulseApprove(draft.id, "approve" | "reject")`.
- **Refresh** (`:205`) → `load()`.

**Data source:** trending signals grid via real `pulseTrending({limit:12})`; "needs review" queue via real `pulseNeedsReview(50)`. Safety flags on drafts (`deal_terms.safety_flags`) are computed server-side (per comment `:17`) and rendered as-is. No mock data.

**Called-out note:** `:109-112` — "`pulseCompose`/`pulseApprove` take no `advisor_id` at all; the backend derives the acting advisor purely from the JWT" — different from the RFQ endpoints, which do take an explicit advisor id.

**Backend work needed:** none apparent — fully wired, no fallback. Worth confirming server-side that the safety-flag heuristics (`ungrounded_price`, `tax_legal_claim`, `tone_guard`) are actually populated in practice, since the UI fully trusts and surfaces whatever the server returns.

### `/copilot` — Call Copilot

- **Page:** `src/app/(authenticated)/copilot/page.tsx` → `<CallCopilotPanel advisorId={advisorId} />` (prop unused by the panel).
- **Panel:** `src/components/panels/CallCopilotPanel.tsx` (571 lines). Nav label: "Call Copilot".

**Purpose:** live-call assist. With advisor + customer consent, captures speech via the browser's Web Speech API (or manual text entry as fallback), streams transcript deltas to a backend AI pipeline, and surfaces suggested content the advisor can share with the member in one tap. **No audio ever leaves the browser** — only stabilized transcript text.

**Interactive elements:**
- "On a call with" member `<select>` (`:471`) — populates `memberId` from a real members list.
- Consent toggle (`:480`) — flips `consent`; requires a member picked first (toast otherwise). This is the **only** thing that starts/stops the mic.
- Live transcript area — Web Speech API, or a manual `<textarea>` fallback (`:516`) with Enter-to-submit and a 1.5s debounce auto-submit.
- Per-suggestion **Share with member** (`SuggestionCard`, `:265`) → `enquiryCreate({member_id, channel:"advisor", message, intent})`; disabled until a member is picked.

**Data source:** member picker via real `members(...)` read. Transcript is genuine local browser input by design (privacy: "No audio is recorded"). Suggestion cards via real `callAssistRun({chunk, context, member_id})`, auto-triggered by a debounce/buffer (250 chars / 2 utterances / 4s pause, floor 6s between calls) — failures here are silently swallowed (`console.warn`) so a slow/failed AI call never interrupts the live call. Share action via real `enquiryCreate(...)`.

**Backend work needed:** confirm `/call-assist` and `/enquiries` (FastAPI) are deployed with real JWT auth — both reject outright with no fallback if there's no session. A call-assist failure degrades silently (no suggestion cards, no visible error), worth knowing when debugging "why aren't cards showing up."

### `/analytics` — Platform Analytics

- **Page:** `src/app/(authenticated)/analytics/page.tsx` → `<PlatformAnalyticsPanel advisorId={advisorId} />` (prop unused).
- **Panel:** `src/components/panels/PlatformAnalyticsPanel.tsx` (288 lines). Nav label: "Analytics · Platform-wide performance — computed live from the transactional ledger".

**Purpose:** read-only platform-wide dashboard — GMV/revenue/tax, conversion funnel, RFQ engine performance, lifecycle-care stats, Pulse/demand stats, bookings-by-product, members-by-tier, post-trip NPS/CSAT. Distinct from a separate per-advisor `AnalyticsPanel.tsx` (inside the Advisor Workbench group — see §4) which still uses the legacy `analytics-summary` edge function.

**Interactive elements:** **Refresh** (`:79`) is the only control — pure display dashboard, re-runs `load()`.

**Data source:** one real call, `getPlatformSummary()` → `GET /analytics/platform-summary`. `margin_visible` (server-derived from `advisor.role === "admin"`) gates whether net-revenue/yield figures render at all, checked as an explicit flag rather than inferred. Empty sections render an honest "No … yet" off the *actual* returned zero values, not a hardcoded gap flag — so real data shows up with no frontend change needed once those tables populate. No mock data anywhere.

**Called-out note:** if `data.meta.data_truncated` is true, shows a live banner: "Some figures are partial — {truncated_tables} hit the read cap." — a real runtime signal that the summary endpoint has a row-read cap that can silently truncate figures under load.

**Backend work needed:** none from the frontend's side — fully wired, single endpoint.

### `/` — Authenticated root

`src/app/(authenticated)/page.tsx` — pure server-side `redirect("/orders")`, no UI, no data. (Was `/workbench` until 2026-08-31; moved when that route's content relocated to `console/queue`.) No backend work.

### `/join` — Accept Advisor Invite

- **Page:** `src/app/join/page.tsx` — outside the `(authenticated)` group (no session exists yet for a brand-new invitee), wraps `<AcceptAdvisorInvite />` in `Suspense` (needed for `useSearchParams()`).
- **Component:** `src/components/AcceptAdvisorInvite.tsx` (139 lines). Reached only via an emailed invite link `/join?token=...`, not from the main nav.

**Purpose:** lets a newly-invited advisor set their own password and activate their account for the first time, using an invite token instead of an existing session.

**Interactive elements:** if no `token` query param, shows a static "Invitation not available" message, no form. Otherwise: password + confirm-password inputs (local state), **Set password & activate account** submit → client-side validates length ≥8 and match, then `acceptAdvisorInvite(token, password)`. On success shows "You're all set" with the real returned `result.email` and a "Go to sign in" link.

**Called-out note:** `:6-11` — "this never touches `services/auth.ts` (there is no session yet); it calls the FastAPI backend directly … `acceptAdvisorInvite()`." This is the **one** endpoint in the whole app sent with no Authorization header at all (by design).

**Backend work needed:** confirm `POST /advisor/team/accept-invite/{token}` is live, and confirm whatever generates/emails the `/join?token=...` links (admin-side, out of this file's scope) actually produces valid tokens.

---

## 6. Shared API layer (`src/services/api.ts`, `advisorHelpers.ts`, auth)

### `src/services/api.ts` (2068 lines) — the live backend client

Talks to two backends:
1. **Supabase Edge Functions** (`FUNCTIONS_BASE`) via generic `call(fn, body)` / `callAuthed(fn, body)`, and PostgREST-shaped table reads via `db(path)` — which actually proxies through an edge function called `data-read` (service-role, table+column-allowlisted; see §1). Real PostgREST is never hit directly from the browser.
2. **FastAPI backend** (`FASTAPI_BASE`, env `NEXT_PUBLIC_FASTAPI_BASE`, defaults to `http://127.0.0.1:8787` locally) via per-domain `fastapiXCall(path, options)` helpers, each requiring a real advisor JWT — they reject up front with `ApiError("Not signed in.", {status:401})` if there's no session, **no anon-key fallback** (the one deliberate exception is `acceptAdvisorInvite`, §5).

**Critical finding — there is no client-side mock-data fallback anywhere in `api.ts`.** A full pass for `mock`/`fallback`/`demo` patterns turns up zero "on failure, substitute fake data" logic. Every function either makes a real call and rejects on failure, or is a pure formatting utility (`inr`, `ApiError`). `rfqSimulate` (name notwithstanding) is a real POST to a real, server-gated endpoint returning deterministic test data — not a frontend mock. **Every function below is "fully real, no fallback" unless noted otherwise.** (This contrasts with the Console/Search desks in §3, where the mock fallback lives in the *panel* components, not in `api.ts` itself.)

Grouped by domain:

**Core/infra:** `ApiError` (custom error class: `status`/`fn`/`path`/`body`/`cause`) · `authBearer()` (current session JWT or `null`) · `call(fn, body)` (generic edge-fn POST, falls back to the anon key as bearer if no session — an auth degrade, not mock data) · `callAuthed(fn, body)` (same, but rejects outright with no session — has leftover **TEMP DEBUG** `console.log`/`console.warn` instrumentation flagged in its own comment as "remove after root-causing 'Not yet provisioned'", worth cleaning up) · `db(path)`/`dbOne(path)` (routed table read via `data-read`) · `inr(n, opts)` (pure INR formatter).

**Search services:** `searchFlights` (edge fn `flight-search`) · `searchHotels` (edge fn `hotel-search`) · `searchVisa` (FastAPI `GET /visa/vendor/search` — the server itself has a vendor→DB fallback signaled via a `source` field in the response; that's a *server-side* fallback surfaced honestly to the client, not a client mock) · `visaQueue`, `visaDecide`, `commitDocs` (FastAPI visa-application endpoints) · `flightReprice`/`flightHold` (edge fn `flight-hold`) · `flightFares` (edge fn `flight-fares`) · `flightIrrops` (edge fn `flight-irrops`) · `flightShop` (edge fn `flight-shop`) · `hotelProperty`/`hotelServicingRead`/`hotelCommissionRead` (edge fns) · `hotelAutosuggestV2`/`hotelListingV2`/`hotelDetailsV2`/`hotelPriceCheckV2` (FastAPI `/hotels/*`) · `fastapiFlightSearch` (FastAPI `POST /flights/search`, remapped from real TripSure preprod data via `mapTripSureSearchResponse`) · `fastapiFlightAutosuggest` (FastAPI `GET /flights/autosuggest`) · `getTripsureFlightOffer` (pure in-memory cache lookup, not a network call).

**Advisor task engine / analytics:** `advisorTasks` (edge fn `advisor-tasks`) · `analyticsSummary` (edge fn `analytics-summary` — the **legacy** per-advisor surface, distinct from `getPlatformSummary()`) · `advisorWorkbench`/`approvalsInbox`/`advisorWorkload`/`advisorHandover`/`approvalDecide` (edge fn `advisor-workbench-read` — comment notes `approval_decide` "requires db/071 (advisor_approval_decisions) to be APPLIED to persist — until then the function degrades to `{error:'decide_failed'}`", a server-side migration dependency, not a client mock).

**Pricing/Orders:** `price` (edge fn `quote-price`) · `createOrder` (edge fn `order-create`) · `runSaga` (edge fn `booking-saga`).

**RAG/AI:** `kbSearch` (edge fn `kb-search`) · `concierge` (edge fn `concierge`).

**RFQ Engine** (used by `/broadcast`, §5): `rfqCompose`/`rfqDispatch`/`rfqSimulate`/`rfqParse`/`rfqRank`/`rfqAward` (FastAPI `/rfq/*`) · `rfqList`/`rfqGet` (FastAPI `GET /rfq`, `GET /rfq/{id}`) · `rfqInbound` (the one **legacy edge fn** left un-migrated — `rfq-inbound` — deliberately, since it needs an n8n-only shared secret an advisor JWT can't provide; nothing in the current UI calls it).

**Servicing case engine (post-booking):** `servicingCase` (edge fn `servicing-case`, 7 actions: open/simulate/approve/execute/status/dispute/reconcile) · `dispute`/`reconcile` (convenience wrappers over it) · `advisorProposals` (edge fn `advisor-proposals`) · `refundStatus` (edge fn `refund-status`) · `servicingIntake` (edge fn `servicing-intake`) · `holdServicing` (edge fn `hold-servicing`) · `escalationQueue`/`reconciliationQueue`/`servicingCases` (real `db("servicing_requests?...")` table reads).

**Quote sharing / consent / comms:** `createShareLink`/`getSharedQuote`/`revokeShareLink`/`setConsent` (edge fn `quote-share`) · `commsConsent` (edge fn `comms-consent`) · `commsRead` (edge fn `comms-read`) · `commsDelivery` (edge fn `comms-delivery`) · `commsPreferences` (edge fn `comms-preferences`).

**Wave-N action-dispatcher edge functions** (all real, action-validated, no fallback): `hotelModifyOrchestrate` (`hotel-modify-orchestrate`) · `flightEmd` (`flight-emd`) · `payRefundPreview` (`pay-refund-preview`) · `visaReadiness` (`visa-readiness`) · `visaCopilot` (`visa-copilot`) · `disputeCase` (`dispute-case`) · `flightGroup` (`flight-group`) · `hotelStayDeviation` (`hotel-stay-deviation`) · `advisorBookOfBusiness` (`advisor-book-of-business` — advisor-internal, exposes net/commission) · `visaAppointment` (`visa-appointment`).

**Table readers** (thin wrappers over `db()`, real reads via `data-read`): `members`, `advisors`, `enquiries`, `suppliers`, `orders`, `quotes`, `rfqs`, `rfqQuotes`, `visaRequirements`, `journeys` (table `customer_journeys`), `journeyTouchpoints` (table `journey_touchpoints`).

**Journeys** (used by `/journeys`, §5): `journeyTick` (edge fn `journey-tick`) · `journeyApprove` (edge fn `journey-approve`, client-validates `{touchpoint_id, decision}` before calling).

**Pulse** (used by `/pulse`, §5): `pulseTrending`/`pulseNeedsReview`/`pulseCompose`/`pulseApprove` (FastAPI `/pulse/*`).

**Call Copilot** (used by `/copilot`, §5): `callAssistRun` (FastAPI `POST /call-assist` — replaces a legacy anon-key/CORS-open edge function).

**Enquiries (advisor-initiated):** `enquiryCreate` (FastAPI `POST /enquiries` — used by Call Copilot's Share action).

**Platform Analytics:** `getPlatformSummary` (FastAPI `GET /analytics/platform-summary`).

**Admin oversight:** `adminListAdvisors`/`adminUpdateAdvisor`/`adminListOrders`/`adminAssignEnquiry` (FastAPI `/admin/*`).

**Invite/account:** `acceptAdvisorInvite` (FastAPI `POST /advisor/team/accept-invite/{token}` — the only function with no Authorization header at all, by design) · `inviteCustomer` (FastAPI `POST /advisor/customers/invite`).

**Net summary:** no pure-mock or mock-fallback-on-failure functions exist in `api.ts` at all. The only quasi-fallback behaviors are (1) `call()`'s anon-key bearer degrade when there's no session (auth, not data), and (2) server-side fallbacks the API reports back honestly via response fields (`searchVisa`'s `source`, `approvalDecide`'s `{error:'decide_failed'}` when a migration isn't applied). All mock data in this app lives in the *panel* components (§3's Search desks, Console's mock enquiries/itinerary), never in the API client itself.

### `src/lib/advisorHelpers.ts` (322 lines) — shared pure UI/business helpers

No network calls anywhere in this file. Real business-logic helpers worth knowing: `canSeeMargin()` (client-side margin-visibility gate — role `head_of_business` or a `TA_SHOW_MARGIN` flag; **the authoritative gate is server-derived** per `PlatformAnalyticsPanel`'s `margin_visible` field, this is an older, separate client convenience) · `isAdmin()` (reads `window.TA_ROLE === "admin"`, explicitly documented as "a UI convenience, not the authority" — the backend re-checks independently on every `/admin/*` call) · `marginHealth(frac)` (classifies a margin fraction low/ok/high, 8%/28% thresholds) · `enqSla(e)` (enquiry SLA breach state, 15-business-minute target) · `queueSla(dueAt)` (generic due-date countdown/breach classifier) · `softNotice(msg)` (regex-classifies an error message as a calm "not live yet" degrade vs. a genuine hard fault — note `JourneysPanel.tsx` re-implements this same regex inline rather than importing it, a minor duplication worth consolidating) · `caseStateClass`/`sevClass` (servicing-case/severity taxonomy, mirrors backend state-machine names) · cart item builders `flightCartItem`/`hotelCartItem`/`visaCartItem` (reshape a raw search offer into the pricing engine's expected cart-item shape — real business logic, though the Console flow in §3 uses its own separate `itineraryFromCart.ts`, not these).

Pure formatting/UI convenience (no domain logic): `pct`, `r`, `shortId`, `fmtDate`, `fmtTime`, `todayISO`, `uniqId`, `capLabel` (Indian lakh/crore shorthand, e.g. `₹2.4L`), `errText` (normalizes any thrown error to a display string — used throughout the whole app), `toast` (local DOM-based toast; checks for a legacy `window.TA_UI.toast` first but that's never present in this port, so it always falls through to the local implementation), `productIconName`/`productIcon`, `commsChannelClass`/`deliveryStateClass`/`threadStateClass`.

### `src/services/auth.ts` (274 lines) and `src/services/supabaseConfig.ts` (19 lines) — auth/session

**Real Supabase Auth, fully wired — not mocked**, with one deliberate legacy compatibility path.

- `supabaseConfig.ts` — single source of truth for `SUPABASE_URL`/`SUPABASE_KEY` from `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_KEY` env vars only; **throws at import time** if either is missing. No hardcoded fallback/demo credentials exist anywhere in source.
- `auth.ts` uses the real `@supabase/supabase-js` npm package's `createClient()`. On module init it seeds a cached access token from any persisted session (`_client.auth.getSession()`) and subscribes to `onAuthStateChange` to keep it fresh; the cached token is exposed synchronously via `accessToken()` — this is exactly what every `authBearer()` call in `api.ts` reads.
- **Fail-open path:** if `createClient()` throws (bad config), `_client` stays `null` and every auth method rejects with `"auth unavailable"` rather than throwing uncaught — defensive coding, not a mock login.
- **Dual auth surface:** the file also implements a **passwordless OTP flow** (`requestCode`/`verifyCode`) calling a Supabase edge function `auth-otp` directly (not through `api.ts`), exchanging a one-time `token_hash` for a real session via `_client.auth.verifyOtp(...)`. This appears to be the **member-facing** login mechanism (identifier = phone or email), separate from advisor password login.
- `ready()` exposes the one canonical initial-session-probe promise, specifically to avoid a race where a second independent `getSession()` call could read the token before it's set.
- **Flag for infra:** `RESET_PASSWORD_REDIRECT_URL` is hardcoded to `http://localhost:3000/web/reset-password.html` — almost certainly stale for any non-local environment. Needs to be environment-derived (or at minimum updated to the real staging/prod path), or password-reset emails will send a broken redirect link in production.

**Net summary:** auth is a real Supabase Auth session, not mocked. Every `fastapiXCall` helper requires this real JWT and has no fallback; only the older `call()`/`db()` edge-function path silently degrades to the anon key when no session exists (intentional, to preserve pre-auth behavior). The one concrete bug worth fixing: the hardcoded localhost password-reset redirect URL.

---

## 7. Priority backend TODO list

Synthesized across every section above. Ordered roughly by how many downstream screens/features are blocked on each item, not by estimated effort.

### Tier 1 — blocks the core Enquiries/Console flow this session's work centered on

1. **Design a real enquiry `ask` schema and populate it** (intake form / LLM parse of the raw message / manual advisor entry). Nothing downstream works for a real enquiry without this: the Itinerary Builder's date-bound seeding, Search desk defaults (route/city/visa destination), and the Traveller Profile's entire request-detail card all silently degrade to nothing/hardcoded-defaults today because real Supabase enquiries carry no `ask` object at all (§2, §3.2, §3.3, §3.4).
2. **Build a real itinerary data model + CRUD.** Today an itinerary is 100% browser memory (`itinerariesByEnquiry` in `WorkbenchDataProvider.tsx`) — every flight/hotel/visa added, every edit, every removal, every date change is gone on reload, for every enquiry regardless of source (§2, §3.3).
3. **Build a real "Generate AI Itinerary" call.** Today it clones one hardcoded Switzerland/8-night trip verbatim for every enquiry, real or mock (§3.3).
4. **Build the real Proposal Composer** — assemble, preview exactly as the client sees it, send via WhatsApp (per the product flow doc §5.2 quoted in-app). Currently a read-only recap with the UI's own explicit notice: *"The real compose/preview/send UI isn't built yet — this is confirming the handoff itself worked."* (§3.6)
5. **Bridge Itinerary/Proposal → Order.** `orders` is real and fully separate; there is no code path today from "advisor built and sent a proposal" to "a real order exists" (§2, §3.6).
6. Decide the real item-status vocabulary (`on_hold`/`booked`/`awaiting_supplier`/`price_changed`/`not_selected`, `mockItinerary.ts`'s `tierOf()`) and how it maps onto real supplier/booking states once #2 is real.

### Tier 2 — real data-loss / silent-failure risks in already-live screens

7. **Escalation Queue's Snooze and Reassign-owner are never persisted** — pure client-side React state (`EscalationQueue.tsx:50-54`, ref "SVC-077"). An advisor's snooze/reassignment vanishes on refresh and is invisible to any other advisor viewing the same queue. Needs a new `servicing-case` action (or equivalent) to persist it server-side. (§4.7)
8. **Apply DB migration `db/071`** (`advisor_approval_decisions`) — until it's applied, `approval_decide` silently returns `{error:'decide_failed'}` and an approval/reject/escalate decision on the Approvals screen may not actually persist, even though the UI lets the advisor make it. (§4.4)
9. **Expose/allowlist the `supplier_settlements` table** (or add a dedicated read function) — until then, Reconciliation's "realised commission" column is structurally present but empty for every single row in most environments. (§4.10)
10. **Complete the WhatsApp BSP / Resend email provider integration gate** — until it's switched on, an advisor's reply from the Communications screen is captured/logged server-side but the `simulated` flag means it may not actually reach the member over a real channel. The UI already discloses this transparently to the advisor; the backend gate is the remaining piece. (§4.15)

### Tier 3 — frontend completeness gaps with no backend work required (still worth a backend dev knowing about, since they explain "missing" features that aren't actually API gaps)

11. Port `web/js/servicing.js`'s `ServicingPanel`/`SimulateModal`/`ApprovalBadge` — Orders Board's "Post-sale servicing" section is a permanent stub, and Escalation Queue's tier badges silently fall back to a plain `<span>` without it. (§4.1, §4.7)
12. `QuoteBuilder.tsx`/`CartPanel.tsx` are dead code, unreachable from any route — this is the root cause of the legacy Proposals screen requiring an advisor to hand-type a Quote ID with no in-app way to generate one. Either wire a cart/quote route back in, or confirm with product this moved entirely into Console and delete both files. (§4.17, §4.18)
13. Group Air's option detail view is a raw `JSON.stringify()` dump, not a real UI — the data is real and complete, only the presentation is placeholder-grade. (§4.6)
14. `CartPanel.tsx` in the Console flow (§3.4) is confirmed dead code there too — Search's "Add" writes directly to the itinerary now, no cart step, by explicit 2026-09-03 scope decision.

### Tier 4 — smaller fixes and things to verify, not blocking

15. Fix the hardcoded `RESET_PASSWORD_REDIRECT_URL` (`http://localhost:3000/web/reset-password.html` in `auth.ts`) — almost certainly stale outside local dev; password-reset emails will link somewhere broken in staging/prod until this is environment-derived. (§6)
16. Remove or resolve the **TEMP DEBUG** `console.log`/`console.warn` instrumentation in `callAuthed()` (`api.ts`), left in specifically to root-cause a "Not yet provisioned" issue — worth checking whether that issue is now understood and the logging can come out. (§6)
17. `boundFromDateRange()`'s year is hardcoded to `2026` (`itineraryFromCart.ts`) — fine for a demo pinned to this year, will need a real source once that's no longer true. (§3.3)
18. The small hardcoded `CITY_AIRPORT_CODES` table used to seed Flight search defaults (Delhi/Mumbai/Singapore/Goa/Dubai only) needs a real airport-code lookup to scale past the 3 mock enquiries' cities. (§3.4)
19. Audit every screen listed as "degrades calmly to an 'isn't live yet' notice if its backend function is unreachable" (most of §4) — this error-handling pattern is good UX but can mask a genuine deployment gap in a given environment; worth an explicit environment-by-environment pass confirming which edge functions/FastAPI routes are actually live where, rather than inferring it from the calm frontend.
