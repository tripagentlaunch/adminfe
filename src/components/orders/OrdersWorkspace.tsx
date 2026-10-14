"use client";
/* =============================================================================
 * Orders workspace — list (left) + order detail (right). MOCK DATA ONLY: this is
 * a frontend preview; see lib/mockOrders.ts. Not wired to the backend.
 * ===========================================================================*/
import { useMemo, useState } from "react";
import { Dropdown, Empty, Icon } from "../ui";
import { MOCK_ORDERS, MOCK_TODAY, fmtINR, type MockOrder } from "../../lib/mockOrders";
import { OrderDetail } from "./OrderDetail";
import { statusClass } from "./orderUi";
import "../../styles/orders-workspace.css";

type Tab = "all" | "paid" | "pending" | "cancelled";
const RANGES = [
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

function inTab(o: MockOrder, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "cancelled") return o.status === "Cancelled";
  if (tab === "paid") return o.status !== "Cancelled" && o.paymentStatus === "Paid";
  return o.status !== "Cancelled" && o.paymentStatus === "Pending";
}

export function OrdersWorkspace() {
  const [tab, setTab] = useState<Tab>("all");
  const [range, setRange] = useState("90");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_ORDERS[0]?.id || null);

  const inRange = useMemo(() => {
    if (range === "all") return MOCK_ORDERS;
    const cutoff = new Date(MOCK_TODAY).getTime() - Number(range) * 86_400_000;
    return MOCK_ORDERS.filter((o) => new Date(o.createdAt).getTime() >= cutoff);
  }, [range]);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inRange;
    return inRange.filter((o) =>
      [o.id, o.customerName, o.destination, o.email].some((v) => v.toLowerCase().includes(q))
    );
  }, [inRange, query]);

  const counts: Record<Tab, number> = {
    all: searched.length,
    paid: searched.filter((o) => inTab(o, "paid")).length,
    pending: searched.filter((o) => inTab(o, "pending")).length,
    cancelled: searched.filter((o) => inTab(o, "cancelled")).length,
  };
  const rows = searched.filter((o) => inTab(o, tab));
  const selected = MOCK_ORDERS.find((o) => o.id === selectedId) || null;

  const TABS: { key: Tab; label: string }[] = [
    { key: "all", label: "All Orders" }, { key: "paid", label: "Paid" },
    { key: "pending", label: "Pending" }, { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="ow">
      <div className="ow-col">
        <div className="ow-tools">
          <div className="ow-tabs" role="tablist" aria-label="Order status">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} className={"ow-tab" + (tab === t.key ? " is-active" : "")} onClick={() => setTab(t.key)}>
                {t.label}<span className="n">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="ow-toolrow">
            <label className="ow-search">
              <Icon name="search" size={15} />
              <input
                className="taw-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by Order ID, customer name or destination"
                aria-label="Search orders"
              />
            </label>
            <Dropdown value={range} options={RANGES} onChange={setRange} ariaLabel="Date range" hideOptionIcons />
          </div>
        </div>

        {rows.length === 0 ? (
          <Empty icon="search" title="No orders match" message="Try a different tab, date range or search term." />
        ) : (
          rows.map((o) => (
            <div
              key={o.id}
              role="button"
              tabIndex={0}
              className={"ow-row" + (o.id === selectedId ? " is-selected" : "")}
              onClick={() => setSelectedId(o.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(o.id); } }}
            >
              <div className="ow-row-top">
                <span className="ow-id">#{o.id}</span>
                <span className={statusClass(o.status)}>{o.status}</span>
              </div>
              <div className="ow-cust">{o.customerName}</div>
              <div className="ow-sub">{o.email}</div>
              <div className="ow-meta">
                <span><Icon name="compass" size={13} />{o.destination}</span>
                <span className="ow-tag">{o.itineraries[0].label}{o.itineraries.length > 1 ? " +" + (o.itineraries.length - 1) : ""}</span>
              </div>
              <div className="ow-meta">
                <span><Icon name="calendar" size={13} />{o.travelDates}</span>
                <span><Icon name="user" size={13} />{o.travellers.length} traveller{o.travellers.length === 1 ? "" : "s"}</span>
              </div>
              <div className="ow-row-foot">
                <span><span className="ow-amt">{fmtINR(o.amount)}</span>{" "}<span className={statusClass(o.paymentStatus)}>{o.paymentStatus}</span></span>
                <button
                  type="button"
                  className="taw-btn taw-btn--sm"
                  onClick={(e) => { e.stopPropagation(); setSelectedId(o.id); }}
                >
                  View
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="ow-col">
        {selected ? (
          <OrderDetail key={selected.id} order={selected} />
        ) : (
          <Empty icon="luggage" title="Select an order" message="Pick an order on the left to see its itineraries, flights, hotel and visa." />
        )}
      </div>
    </div>
  );
}
