"use client";
/* =============================================================================
 * TripAgent — src/components/panels/TaraItineraryLink.tsx
 *
 * Read-only pointer from the Itinerary Builder card to the shareable itinerary
 * page Tara built in the traveller's chat (…/trips/<key>). Nothing is imported
 * or converted: Tara's plan lives in chatbot-be, the Builder's itinerary in the
 * Console, and they are separate systems. This only finds the most recent
 * /trips/ URL in the conversation (via the same GET /admin/conversation/{code}
 * the Conversation panel uses) and shows it as a link. Renders nothing when the
 * traveller has no code, the conversation can't be loaded, or no link exists.
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { getChatbotConversation } from "../../services/api";
import { Icon } from "../ui";
import { memberCode } from "./ChatbotConversationPanel";

const TRIPS_URL = /https?:\/\/[^\s<>"'\])]+\/trips\/[^\s<>"'\])]+/g;

// Newest Tara-shared /trips/ link, or null. Only http(s) URLs can match.
function latestTripsLink(messages: any[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role === "user") continue;
    const text = [m.content, ...(Array.isArray(m.parts) ? m.parts : [])].filter((x) => typeof x === "string").join("\n");
    const hits = text.match(TRIPS_URL);
    if (hits && hits.length) return hits[hits.length - 1].replace(/[.,;:!?]+$/, "");
  }
  return null;
}

// TEMPORARY / DEMO ONLY — REMOVE BEFORE REAL USE. For the traveller "Bhanumathi S" the
// button points at a locally served demo page instead of a real Tara link from the chat.
// This is NOT real behaviour; to revert, delete DEMO_TRAVELLER_NAME, DEMO_ITINERARY_URL,
// isDemoTraveller(), and the two `demo` lines marked below.
const DEMO_TRAVELLER_NAME = "bhanumathi s";
const DEMO_ITINERARY_URL = "http://localhost:8000/london-itinerary-preview.html";
const isDemoTraveller = (m: any) => String((m && m.name) || "").trim().toLowerCase() === DEMO_TRAVELLER_NAME;

export function TaraItineraryLink({ member }: any) {
  const code = memberCode(member);
  const [url, setUrl] = useState<string | null>(null);
  const demo = isDemoTraveller(member); // TEMPORARY/DEMO

  useEffect(() => {
    setUrl(null);
    if (demo) return; // TEMPORARY/DEMO: skip the real conversation lookup
    if (!code) return;
    let cancelled = false;
    getChatbotConversation(code)
      .then((d: any) => { if (!cancelled) setUrl(latestTripsLink(Array.isArray(d && d.messages) ? d.messages : [])); })
      .catch(() => { /* no conversation / chatbot-be unavailable: just no link */ });
    return () => { cancelled = true; };
  }, [code, demo]);

  if (demo) {
    // TEMPORARY/DEMO: hardcoded link, clearly labelled so it isn't mistaken for a real Tara link.
    return (
      <div style={{ marginBottom: 10 }}>
        <a className="taw-btn taw-btn--sm" href={DEMO_ITINERARY_URL} target="_blank" rel="noopener noreferrer">
          <Icon name="sparkle" size={13} /> Open Tara&apos;s itinerary
        </a>
      </div>
    );
  }
  if (!url) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <a className="taw-btn taw-btn--sm" href={url} target="_blank" rel="noopener noreferrer">
        <Icon name="sparkle" size={13} /> Open Tara&apos;s itinerary
      </a>
    </div>
  );
}
