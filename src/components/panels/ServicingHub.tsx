"use client";
/* =============================================================================
 * TripAgent — src/components/panels/ServicingHub.tsx
 * Ported from web/js/advisor.js: ServicingHub (line ~5359). Order-scoped,
 * NON-money servicing intake + holds queue + EMD fulfilment + refund preview.
 * Sub-tabs keep it one coherent surface.
 * ===========================================================================*/
import { useState } from "react";
import { cx } from "../../lib/cx";
import { Card, Icon } from "../ui";
import { HoldsQueue } from "./HoldsQueue";
import { ServicingIntakePanel } from "./ServicingIntakePanel";
import { FlightEmdPanel } from "./FlightEmdPanel";
import { RefundPreviewPanel } from "./RefundPreviewPanel";

export function ServicingHub(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;
  const membersById = props.membersById || {};
  const onOpenOrder = props.onOpenOrder || (() => {});

  const [sub, setSub] = useState("intake"); // intake|holds|emd|refund
  const [orderId, setOrderId] = useState(props.focusOrderId || "");

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
      <Card title="Servicing" icon={<Icon name="shield" size={18} />} sub="Intake · holds · EMD · refund preview">
        <div className="taw-desk-tabs" role="tablist" aria-label="Servicing view" style={{ marginBottom: 16 }}>
          {SubBtn("intake", "shield", "Intake")}
          {SubBtn("holds", "clock", "Holds")}
          {SubBtn("emd", "luggage", "EMD")}
          {SubBtn("refund", "compass", "Refund preview")}
        </div>
        {sub === "holds" ? (
          <HoldsQueue advisorId={advisorId} membersById={membersById} onOpenOrder={onOpenOrder} />
        ) : sub === "intake" ? (
          <ServicingIntakePanel advisorId={advisorId} orderId={orderId} setOrderId={setOrderId} />
        ) : sub === "emd" ? (
          <FlightEmdPanel advisorId={advisorId} orderId={orderId} setOrderId={setOrderId} />
        ) : (
          <RefundPreviewPanel advisorId={advisorId} orderId={orderId} setOrderId={setOrderId} />
        )}
      </Card>
    </div>
  );
}
