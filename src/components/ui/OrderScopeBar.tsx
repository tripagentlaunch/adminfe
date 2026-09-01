"use client";
import { Spinner } from "./Spinner";
import { Icon } from "./Icon";

// Ported from web/js/advisor.js (line ~5330). Small order-id entry control
// reused by the order-scoped desks. Lets the advisor type/paste an order id
// (or arrives pre-filled via onOpenOrder). The workbench's authoritative order
// list lives on the Orders Board; this is a lightweight focus control so a
// desk can act on a specific order.
export function OrderScopeBar(props: any) {
  const value = props.value || "";
  const onChange = props.onChange;
  const onLoad = props.onLoad;
  const busy = props.busy;
  const placeholder = props.placeholder || "Paste an order id…";
  return (
    <div className="taw-qfilters" style={{ marginBottom: 14, alignItems: "center" }}>
      <input
        className="taw-input"
        style={{ maxWidth: 320 }}
        value={value}
        placeholder={placeholder}
        aria-label="Order id"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onLoad();
        }}
      />
      <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={busy || !value} onClick={onLoad} title="Load this order">
        {busy ? <Spinner /> : <Icon name="search" size={14} />}
        Load
      </button>
    </div>
  );
}
