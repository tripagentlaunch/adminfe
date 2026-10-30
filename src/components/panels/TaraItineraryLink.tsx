"use client";
/* =============================================================================
 * TripAgent — src/components/panels/TaraItineraryLink.tsx
 *
 * "Open Tara's itinerary" on the Itinerary Builder card. When Tara (the
 * chatbot) has built a trip plan for this traveller, the button loads that plan
 * into the Builder as the enquiry's itinerary — no rebuilding via Generate AI
 * Itinerary / Start from scratch.
 *
 * The plan lives in chatbot-be, filed under the traveller's access code.
 * GET /admin/tara-plan/{code} (adminbe) asks chatbot-be for it and converts it
 * to the Builder's own itinerary shape, so ItineraryView renders it unchanged.
 * Everything in it arrives as "draft": Tara's flight/hotel prices are web
 * research, not TripSure results (the plan's own alert says so).
 *
 * With several plans for one traveller the newest is the default and a small
 * picker appears. This is the Builder's ONE Tara entry point, shown the same way
 * for every traveller with an access code: a button when Tara has a plan, a quiet
 * "no itinerary from Tara yet" line when she doesn't. It renders nothing only when
 * there is no code or chatbot-be can't be reached. While one of Tara's itineraries is
 * on screen it becomes a row of the traveller's Tara itineraries to switch between
 * (2026-10-28; edits to the one left are kept); "← Back" still sets Tara aside. After a
 * "← Back" the button becomes "Return to Tara's itinerary" and restores the parked
 * itinerary with its edits.
 * ===========================================================================*/
import { useEffect, useRef, useState } from "react";
import { getMemberCode, getTaraPlan } from "../../services/api";
import { errText, toast } from "../../lib/advisorHelpers";
import { useWorkbench } from "../../lib/workbenchContext";
import { Icon } from "../ui";
import { memberCode } from "./ChatbotConversationPanel";

type PlanSummary = { planId: string; title?: string; updatedAt?: number; url?: string };

const fmtUpdated = (ms?: number) =>
  ms ? new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";

// Tara's newest plan opens in the Builder by itself (2026-10-22) when the Builder
// is empty for this traveller: no click needed. Never over an itinerary already
// there (the advisor's work), nor after "← Back" set Tara's aside. The plan list
// is checked again every minute, so a plan Tara builds while the panel is open
// appears too. A traveller whose record carries no code is found by phone/email.
const PLANS_EVERY_MS = 60000;
const AUTO_OPEN_NEWEST: boolean = false;

// Edited copies of Tara's plans set aside by switching to another plan, per enquiry
// and plan, so switching back restores the advisor's edits (this tab's session).
const switchedAway = new Map<string, any>();

export function TaraItineraryLink({ member, selEnqId, onEnsureEnquiry, hidden, variant, onScratch }: any) {
  const baseCode = memberCode(member);
  const memberKey = String((member && (member.id || member.member_id)) || "");
  const [found, setFound] = useState<{ key: string; code: string } | null>(null);
  const phone = member ? member.phone || member.wa_phone : undefined;
  const email = member ? member.email : undefined;
  useEffect(() => {
    if (baseCode || !member || !(phone || email)) return;
    let cancelled = false;
    getMemberCode(phone, email)
      .then((c: string) => { if (!cancelled) setFound({ key: memberKey, code: c || "" }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [baseCode, memberKey, phone, email]);
  const code = baseCode || (found && found.key === memberKey ? found.code : "");
  const { itinerariesByEnquiry, loadTaraItinerary, autoLoadTaraItinerary, workspaceRestored, parkedItineraries, resumeParkedItinerary } = useWorkbench();
  const parked = !!(selEnqId && parkedItineraries[selEnqId]);
  // Plans are stored with the code they were fetched for, so switching traveller
  // shows nothing (not the previous traveller's plans) until the new list arrives.
  const [loaded, setLoaded] = useState<{ code: string; plans: PlanSummary[] } | null>(null);
  const [pick, setPick] = useState<string>("");
  const [opening, setOpening] = useState(false);
  const checked = !!(code && loaded && loaded.code === code);
  const plans = checked && loaded ? loaded.plans : [];

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const refresh = () =>
      getTaraPlan(code)
        .then((d: any) => {
          if (!cancelled) setLoaded({ code, plans: Array.isArray(d && d.plans) ? d.plans : [] });
        })
        .catch(() => { /* chatbot-be unavailable / no plans route: just no button */ });
    refresh();
    const iv = window.setInterval(refresh, PLANS_EVERY_MS);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [code]);

  // Open the newest plan by itself, once per plan version, into an empty Builder.
  const autoTried = useRef<Set<string>>(new Set());
  const latest = plans[0];
  useEffect(() => {
    // Not before the saved itineraries are back from the server: until then "empty" may just
    // mean "not loaded yet", and opening Tara's plan would replace the advisor's work.
    // Off since 2026-10-30 (the user's call): the advisor picks from Tara's itineraries shown in
    // the Builder's start screen (variant "cards") instead of the newest opening by itself.
    if (AUTO_OPEN_NEWEST !== true || !checked || !latest || parked || !workspaceRestored) return;
    const existing = selEnqId ? itinerariesByEnquiry[selEnqId] : null;
    if (existing && Array.isArray(existing.days) && existing.days.length) return;
    const tryKey = `${code}:${latest.planId}:${latest.updatedAt || ""}`;
    if (autoTried.current.has(tryKey)) return;
    autoTried.current.add(tryKey);
    (async () => {
      const d: any = await getTaraPlan(code, latest.planId);
      if (!d || !d.itinerary) return;
      const enquiryId = selEnqId || (onEnsureEnquiry && member ? (await onEnsureEnquiry(member)).id : null);
      if (enquiryId) autoLoadTaraItinerary(enquiryId, d.itinerary);
    })().catch(() => { /* the button below still works */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, latest && latest.planId, latest && latest.updatedAt, selEnqId, parked, code, workspaceRestored]);

  // A Tara itinerary is on screen: when the traveller has several, switch between them here.
  if (hidden) {
    if (!checked || plans.length < 2 || !selEnqId) return null;
    const current = itinerariesByEnquiry[selEnqId];
    const currentId = current && current.taraPlan ? String(current.taraPlan.planId || "") : "";
    const switchTo = async (planId: string) => {
      if (opening || planId === currentId) return;
      setOpening(true);
      try {
        if (current && currentId) switchedAway.set(selEnqId + ":" + currentId, current);
        const kept = switchedAway.get(selEnqId + ":" + planId);
        if (kept) {
          loadTaraItinerary(selEnqId, kept);
          return;
        }
        const d: any = await getTaraPlan(code, planId);
        if (!d || !d.itinerary) {
          toast("Tara's plan is no longer available.", "error");
          return;
        }
        loadTaraItinerary(selEnqId, d.itinerary);
      } catch (e: any) {
        toast("Couldn't open Tara's itinerary: " + errText(e), "error");
      } finally {
        setOpening(false);
      }
    };
    return (
      <div className="taw-tara-plans" role="tablist" aria-label="Tara's itineraries for this traveller">
        <span className="taw-tara-plans-l">Tara&apos;s itineraries</span>
        {plans.map((p) => (
          <button
            key={p.planId}
            type="button"
            role="tab"
            aria-selected={p.planId === currentId}
            className={"taw-tara-plan" + (p.planId === currentId ? " is-active" : "")}
            disabled={opening}
            onClick={() => switchTo(p.planId)}
            title={p.planId === currentId ? "Showing" : "Switch to this itinerary (edits to the one showing are kept)"}
          >
            {p.title || p.planId}
            {p.updatedAt ? <small>{fmtUpdated(p.updatedAt)}</small> : null}
          </button>
        ))}
      </div>
    );
  }
  if (!checked) return null;
  if (!plans.length && !parked) {
    return <div style={{ marginBottom: 10, fontSize: 12.5, color: "#9098A8" }}>Tara hasn&apos;t built an itinerary for this traveller yet.</div>;
  }
  const chosen = plans.find((p) => p.planId === pick) || plans[0];

  const open = async (planId?: string, resumeParked?: boolean) => {
    if (opening) return;
    if ((resumeParked ?? !planId) && parked && selEnqId) {
      const current = itinerariesByEnquiry[selEnqId];
      const inUse = !!(current && Array.isArray(current.days) && current.days.length);
      if (inUse && !window.confirm("Replace the itinerary in the Builder with the Tara itinerary you set aside?")) return;
      resumeParkedItinerary(selEnqId);
      return;
    }
    // Fetch at click time — Tara may have revised the plan since the list loaded.
    setOpening(true);
    try {
      const d: any = await getTaraPlan(code, planId || chosen.planId);
      if (!d || !d.itinerary) {
        toast("Tara's plan is no longer available.", "error");
        return;
      }
      const enquiryId = selEnqId || (onEnsureEnquiry && member ? (await onEnsureEnquiry(member)).id : null);
      if (!enquiryId) return;
      const existing = itinerariesByEnquiry[enquiryId];
      const hasContent = !!(existing && Array.isArray(existing.days) && existing.days.length);
      if (hasContent && !window.confirm("This traveller already has an itinerary in the Builder. Replace it with Tara's plan? Anything you added or edited will be lost.")) return;
      loadTaraItinerary(enquiryId, d.itinerary);
    } catch (e: any) {
      toast("Couldn't open Tara's itinerary: " + errText(e), "error");
    } finally {
      setOpening(false);
    }
  };

  // The Builder's start screen: Tara's itineraries as cards to pick from, beside Start from scratch.
  if (variant === "cards") {
    return (
      <div className="taw-tara-cards">
        {parked || plans.length ? <div className="taw-tara-cards-h">Tara&apos;s itineraries for this traveller</div> : null}
        {parked ? (
          <button type="button" className="taw-tara-card is-parked" onClick={() => open(undefined, true)} disabled={opening}>
            <Icon name="edit" size={16} />
            <span><b>Your edited copy of Tara&apos;s itinerary</b><small>Set aside with ← Back — continue where you left off</small></span>
          </button>
        ) : null}
        {plans.map((p, i) => (
          <button key={p.planId} type="button" className="taw-tara-card" onClick={() => open(p.planId, false)} disabled={opening}>
            <Icon name="sparkle" size={16} />
            <span>
              <b>{p.title || "Tara's itinerary"}</b>
              <small>{[i === 0 ? "Latest" : null, p.updatedAt ? `updated ${fmtUpdated(p.updatedAt)}` : null, "built in the traveller's chat"].filter(Boolean).join(" · ")}</small>
            </span>
            {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Tara&apos;s page</a> : null}
          </button>
        ))}
        {checked && !plans.length && !parked ? <div className="taw-tara-cards-empty">Tara hasn&apos;t built an itinerary for this traveller yet.</div> : null}
        {!checked && code ? <div className="taw-tara-cards-empty">Looking for Tara&apos;s itineraries…</div> : null}
        <button type="button" className="taw-btn taw-btn--block" onClick={onScratch} disabled={opening}>
          <Icon name="plus" size={16} /> Start from scratch
        </button>
        {opening ? <div className="taw-tara-cards-empty">Opening…</div> : null}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="taw-btn taw-btn--sm" onClick={() => open()} disabled={opening}>
        <Icon name="sparkle" size={13} /> {opening ? "Opening…" : parked ? "Return to Tara’s itinerary" : "Open Tara’s itinerary"}
      </button>
      {plans.length > 1 && !parked ? (
        <select
          className="taw-select-plain"
          aria-label="Which of Tara's plans"
          value={chosen.planId}
          onChange={(e) => setPick(e.target.value)}
        >
          {plans.map((p, i) => (
            <option key={p.planId} value={p.planId}>
              {(p.title || p.planId) + (p.updatedAt ? " · " + fmtUpdated(p.updatedAt) : "") + (i === 0 ? " (latest)" : "")}
            </option>
          ))}
        </select>
      ) : null}
      {chosen && chosen.url ? (
        <a href={chosen.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
          Tara&apos;s page
        </a>
      ) : null}
    </div>
  );
}
