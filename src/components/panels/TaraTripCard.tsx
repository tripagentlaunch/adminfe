"use client";
/* =============================================================================
 * TripAgent — src/components/panels/TaraTripCard.tsx
 *
 * The itinerary card in the advisor's Conversation tab: the same card the customer
 * sees in their Tara chat (chatbot-fe ItineraryCard) for an itinerary link in Tara's
 * message — photo with the trip's status, name, dates and nights, an arrow — instead
 * of the bare URL. The details come from Tara's plans for this member
 * (GET /admin/tara-plan/{code} -> plans[]: key, status, start, end, nights, places,
 * photo), matched to the link by its key, and fetched once per member per minute for
 * all the cards on screen. If they can't be read the card still opens the link, with
 * a plain heading (as the customer's does). It opens the itinerary page signed in as
 * the customer, the way the "Tara site" button opens their chat.
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { getTaraPlan } from "../../services/api";
import { cardMeta, cardPlaces } from "../../lib/taraTripLinks";
import { Icon } from "../ui";

type PlanCard = { key?: string; title?: string; status?: string; start?: string | null; end?: string | null; nights?: number | null; places?: string[]; photo?: string | null };

const PLANS_TTL_MS = 60000;
const plansByCode = new Map<string, { at: number; p: Promise<PlanCard[]> }>();

function loadPlans(code: string): Promise<PlanCard[]> {
  const hit = plansByCode.get(code);
  if (hit && Date.now() - hit.at < PLANS_TTL_MS) return hit.p;
  const p = getTaraPlan(code)
    .then((r: any) => ((r && r.plans) || []) as PlanCard[])
    .catch(() => [] as PlanCard[]);
  plansByCode.set(code, { at: Date.now(), p });
  return p;
}

export function TaraTripCard({ code, tripKey, url }: { code: string; tripKey: string; url: string }) {
  // What was loaded, and for which card: a card whose member or trip changed shows as loading until its own answer arrives.
  const [loaded, setLoaded] = useState<{ id: string; plan: PlanCard | null } | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const id = code + "|" + tripKey;

  useEffect(() => {
    if (!code) return;
    let live = true;
    loadPlans(code).then((plans) => { if (live) setLoaded({ id, plan: plans.find((p) => p.key === tripKey) || null }); });
    return () => { live = false; };
  }, [code, tripKey, id]);

  // undefined = loading, null = no such plan (or no code): the plain card that still opens the link.
  const plan: PlanCard | null | undefined = !code ? null : loaded && loaded.id === id ? loaded.plan : undefined;
  const loading = plan === undefined;
  const title = (plan && plan.title) || (loading ? "" : "Your itinerary");
  const meta = plan ? cardMeta(plan.start, plan.end, plan.nights) : loading ? "" : "Itinerary proposal";
  const places = plan ? cardPlaces(title, plan.places) : "";
  const href = code ? url + "#code=" + encodeURIComponent(code) : url;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={"taw-tripcard" + (loading ? " is-loading" : "")}
      aria-label={loading ? "Open the itinerary" : "Open the itinerary: " + title + ", " + meta}
    >
      <div className="taw-tripcard-photo">
        {plan && plan.photo && !photoFailed ? <img src={plan.photo} alt="" onError={() => setPhotoFailed(true)} /> : null}
        {plan && plan.status ? <span className={"taw-tripcard-status is-" + plan.status}>{plan.status}</span> : null}
      </div>
      <div className="taw-tripcard-body">
        <div className="taw-tripcard-text">
          <h3>{title || " "}</h3>
          <p>{meta || " "}</p>
          {places ? <p className="taw-tripcard-places">{places}</p> : null}
        </div>
        <span className="taw-tripcard-go" aria-hidden="true">
          <span className="taw-tripcard-golabel">View itinerary</span>
          <Icon name="arrow" size={20} />
        </span>
      </div>
    </a>
  );
}
