"use client";
/* =============================================================================
 * TripAgent — src/components/panels/SearchDesksTab.tsx
 * Re-added 2026-09-01, EXACTLY as it originally rendered inside WorkbenchTab
 * before the 2026-08-31 Queue/Itinerary Builder rewrite (see that file's
 * docblock — "Search still needs a home ... parked"). Ported verbatim from
 * the frozen reference, Admin Panel/advisor-panel/src/components/panels/
 * WorkbenchTab.jsx (lines 91-134, "Row 2: search desks + cart") — same
 * markup, same classes (taw-grid taw-cols-q, taw-desk-tabs/taw-desk-tab),
 * same Flights/Hotels/Visas sub-tabs, same FlightDesk/HotelDesk/VisaDesk +
 * CartPanel composition. Only difference: this now lives on its own route
 * (Enquiries → Search) instead of being row 2 of the old combined Workbench
 * tab. Cart stays local here too — nothing outside this tab reads it, same
 * as the original.
 * ===========================================================================*/
import { useState } from "react";
import { cx } from "../../lib/cx";
import { toast } from "../../lib/advisorHelpers";
import { Card, Icon } from "../ui";
import { CartPanel } from "./CartPanel";
import { FlightDesk } from "./FlightDesk";
import { HotelDesk } from "./HotelDesk";
import { VisaDesk } from "./VisaDesk";

export function SearchDesksTab(props: any) {
  const { member, advisorId } = props;

  const [desk, setDesk] = useState("flights");
  const [cart, setCart] = useState<any[]>([]);

  function addToCart(item: any) {
    setCart((c) => c.concat([item]));
    toast((item._title || item.type) + " added to itinerary", "success");
  }
  function removeFromCart(cid: any) {
    setCart((c) => c.filter((x) => x._cid !== cid));
  }
  function clearCart() {
    setCart([]);
  }

  return (
    <div className="taw-grid taw-cols-q">
      <Card
        title="Search Desks"
        icon={<Icon name="search" size={18} />}
        sub={member ? "for " + member.name : "no member selected"}
      >
        <div style={{ marginBottom: 14 }}>
          <div className="taw-desk-tabs" role="tablist" aria-label="Search desk">
            <button
              className={cx("taw-desk-tab", desk === "flights" && "is-active")}
              role="tab"
              aria-selected={desk === "flights" ? "true" : "false"}
              onClick={() => setDesk("flights")}
            >
              <Icon name="flight" size={15} />
              <span>Flights</span>
            </button>
            <button
              className={cx("taw-desk-tab", desk === "hotels" && "is-active")}
              role="tab"
              aria-selected={desk === "hotels" ? "true" : "false"}
              onClick={() => setDesk("hotels")}
            >
              <Icon name="hotel" size={15} />
              <span>Hotels</span>
            </button>
            <button
              className={cx("taw-desk-tab", desk === "visas" && "is-active")}
              role="tab"
              aria-selected={desk === "visas" ? "true" : "false"}
              onClick={() => setDesk("visas")}
            >
              <Icon name="visa" size={15} />
              <span>Visas</span>
            </button>
          </div>
        </div>
        {desk === "flights" ? <FlightDesk member={member} advisorId={advisorId} onAdd={addToCart} /> : null}
        {desk === "hotels" ? <HotelDesk member={member} advisorId={advisorId} onAdd={addToCart} /> : null}
        {desk === "visas" ? <VisaDesk member={member} advisorId={advisorId} onAdd={addToCart} /> : null}
      </Card>
      <CartPanel cart={cart} onRemove={removeFromCart} onClear={clearCart} />
    </div>
  );
}
