"use client";
/* =============================================================================
 * TripAgent — src/app/orders/page.tsx
 * "Orders" opens the Orders workspace (components/orders/*): real booking_*
 * orders, from search and fare lock through travellers, payment, ticketing and
 * hotel confirmation. The older OrdersBoard (orders / order_legs tables, booking
 * saga) stays one click away as "Live board".
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
