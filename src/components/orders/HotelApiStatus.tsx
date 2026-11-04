"use client";

/* A small "is Tripsure's hotel API reachable" chip for the hotel search (guide: healthCheck).
   It asks once when the search opens, so an advisor sees an outage before typing a search that
   can't work. It only reads; a failed probe never blocks searching. */

import { useEffect, useState } from "react";
import { hotelApiHealth } from "../../services/api";

export function HotelApiStatus() {
  const [s, setS] = useState<"checking" | "ok" | "down">("checking");
  useEffect(() => {
    let live = true;
    hotelApiHealth().then(() => live && setS("ok")).catch(() => live && setS("down"));
    return () => { live = false; };
  }, []);
  if (s === "checking") return null;
  return s === "ok" ? (
    <span className="ow-tag ok" title="Tripsure's hotel API answered a test search just now">Tripsure hotels online</span>
  ) : (
    <div className="taw-banner taw-banner--warn" role="status">
      Tripsure&apos;s hotel service isn&apos;t answering right now, so a search may fail. Try again in a minute; if it persists, contact Tripsure support with a trace id.
    </div>
  );
}
