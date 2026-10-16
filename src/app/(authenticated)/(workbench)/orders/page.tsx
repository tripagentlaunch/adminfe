"use client";
/* =============================================================================
 * TripAgent — src/app/orders/page.tsx
 * "Orders" now opens the new Orders workspace (list + detail, MOCK DATA — see
 * components/orders/*). The original live OrdersBoard is untouched and one click
 * away via the "Live board" switch, so real order servicing isn't lost while the
 * new UI is reviewed. Wiring to real data comes later.
 * ===========================================================================*/
import { useState } from "react";
import { OrdersBoard } from "../../../../components/panels";
import { OrdersWorkspace } from "../../../../components/orders/OrdersWorkspace";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function OrdersPage() {
  const { advisorId, justCreated, focusOrderId, consumeCreated } = useWorkbench();
  const [view, setView] = useState<"workspace" | "live">("workspace");

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: "2px 0 8px" }}>
        {view === "workspace" ? <span style={{ fontSize: 11, color: "var(--muted)" }}>Live orders first · sample data below</span> : null}
        <div className="taw-segrp" role="group" aria-label="Orders view">
          <button type="button" className={"taw-seg" + (view === "workspace" ? " is-on" : "")} onClick={() => setView("workspace")}>Orders</button>
          <button type="button" className={"taw-seg" + (view === "live" ? " is-on" : "")} onClick={() => setView("live")}>Live board</button>
        </div>
      </div>
      {view === "workspace" ? (
        <OrdersWorkspace />
      ) : (
        <OrdersBoard
          advisorId={advisorId}
          justCreatedOrderId={justCreated || focusOrderId}
          onConsumeCreated={consumeCreated}
        />
      )}
    </div>
  );
}
