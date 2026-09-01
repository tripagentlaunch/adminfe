"use client";
/* =============================================================================
 * TripAgent — src/app/orders/page.tsx
 * Mirrors App.jsx's <Route path="/orders" element={<OrdersBoard
 * advisorId={advisorId} justCreatedOrderId={justCreated || focusOrderId}
 * onConsumeCreated={...} />} /> — renders the ported OrdersBoard, wired to
 * the shared state from lib/workbenchContext.tsx (provided by
 * app/workbench/layout.tsx).
 * ===========================================================================*/
import { OrdersBoard } from "../../../../components/panels";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function OrdersPage() {
  const { advisorId, justCreated, focusOrderId, consumeCreated } = useWorkbench();

  return (
    <OrdersBoard
      advisorId={advisorId}
      justCreatedOrderId={justCreated || focusOrderId}
      onConsumeCreated={consumeCreated}
    />
  );
}
