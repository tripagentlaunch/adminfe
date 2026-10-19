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
 * picker appears. Renders nothing when the traveller has no code, no plan, or
 * chatbot-be can't be reached — the Builder then shows its usual "Start this
 * itinerary" chooser, as before.
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { getTaraPlan } from "../../services/api";
import { errText, toast } from "../../lib/advisorHelpers";
import { useWorkbench } from "../../lib/workbenchContext";
import { Icon } from "../ui";
import { memberCode } from "./ChatbotConversationPanel";

type PlanSummary = { planId: string; title?: string; updatedAt?: number; url?: string };

const fmtUpdated = (ms?: number) =>
  ms ? new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";

export function TaraItineraryLink({ member, selEnqId, onEnsureEnquiry }: any) {
  const code = memberCode(member);
  const { itinerariesByEnquiry, loadTaraItinerary } = useWorkbench();
  // Plans are stored with the code they were fetched for, so switching traveller
  // shows nothing (not the previous traveller's plans) until the new list arrives.
  const [loaded, setLoaded] = useState<{ code: string; plans: PlanSummary[] }>({ code: "", plans: [] });
  const [pick, setPick] = useState<string>("");
  const [opening, setOpening] = useState(false);
  const plans = code && loaded.code === code ? loaded.plans : [];

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    getTaraPlan(code)
      .then((d: any) => {
        if (!cancelled) setLoaded({ code, plans: Array.isArray(d && d.plans) ? d.plans : [] });
      })
      .catch(() => { /* chatbot-be unavailable / no plans route: just no button */ });
    return () => { cancelled = true; };
  }, [code]);

  if (!plans.length) return null;
  const chosen = plans.find((p) => p.planId === pick) || plans[0];

  const open = async () => {
    if (opening) return;
    // Fetch at click time — Tara may have revised the plan since the list loaded.
    setOpening(true);
    try {
      const d: any = await getTaraPlan(code, chosen.planId);
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

  return (
    <div style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="taw-btn taw-btn--sm" onClick={open} disabled={opening}>
        <Icon name="sparkle" size={13} /> {opening ? "Opening…" : "Open Tara’s itinerary"}
      </button>
      {plans.length > 1 ? (
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
      {chosen.url ? (
        <a href={chosen.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
          Tara&apos;s page
        </a>
      ) : null}
    </div>
  );
}
