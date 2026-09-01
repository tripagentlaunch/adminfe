"use client";
/* =============================================================================
 * TripAgent — src/components/panels/DeskHub.tsx
 * Ported from web/js/advisor.js: DeskHub (line ~5789). Hotel changes
 * (modify + in-stay deviation HITL) · disputes · group air. Each sub-tab is
 * an advisor review/queue surface. Correctly identified in Phase 2 as NOT a
 * layout wrapper — it's the feature panel behind the "Desk" tab.
 * ===========================================================================*/
import { useState } from "react";
import { cx } from "../../lib/cx";
import { Card, Icon } from "../ui";
import { HotelChangeQueue } from "./HotelChangeQueue";
import { DisputeDesk } from "./DisputeDesk";
import { GroupAirDesk } from "./GroupAirDesk";

export function DeskHub(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;
  const membersById = props.membersById || {};
  const onOpenOrder = props.onOpenOrder || (() => {});

  const [sub, setSub] = useState("hotel"); // hotel|dispute|group
  function SubBtn(key: any, icon: any, label: any) {
    return (
      <button className={cx("taw-desk-tab", sub === key && "is-active")} role="tab" aria-selected={sub === key ? "true" : "false"} onClick={() => setSub(key)}>
        <Icon name={icon} size={15} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div className="taw-fade-in">
      <Card title="Desk" icon={<Icon name="sliders" size={18} />} sub="Hotel changes · disputes · group air">
        <div className="taw-desk-tabs" role="tablist" aria-label="Desk view" style={{ marginBottom: 16 }}>
          {SubBtn("hotel", "hotel", "Hotel changes")}
          {SubBtn("dispute", "shield", "Disputes")}
          {SubBtn("group", "flight", "Group air")}
        </div>
        {sub === "hotel" ? (
          <HotelChangeQueue advisorId={advisorId} membersById={membersById} onOpenOrder={onOpenOrder} />
        ) : sub === "dispute" ? (
          <DisputeDesk advisorId={advisorId} membersById={membersById} onOpenOrder={onOpenOrder} />
        ) : (
          <GroupAirDesk advisorId={advisorId} membersById={membersById} onOpenOrder={onOpenOrder} />
        )}
      </Card>
    </div>
  );
}
