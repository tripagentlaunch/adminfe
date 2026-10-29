"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dropdown, Empty, Icon } from "../ui";
import { OrderDetail } from "./OrderDetail";
import { NewBookingModal, type BookingPreset } from "./NewBookingModal";
import { bookingGetOrder, bookingListOrders } from "../../services/api";
import { detailToOrder, summaryToOrder } from "../../lib/realOrders";
import { statusClass } from "./orderUi";
import type { RealOrder } from "../../lib/realOrders";
import "../../styles/orders-workspace.css";

type Tab = "all" | "paid" | "pending" | "cancelled";

const RANGES = [
  { key: "7",   label: "Last 7 days"  },
  { key: "30",  label: "Last 30 days" },
  { key: "90",  label: "Last 90 days" },
  { key: "all", label: "All time"     },
];

const TABS: { key: Tab; label: string }[] = [
  { key: "all",       label: "All Orders" },
  { key: "paid",      label: "Paid"       },
  { key: "pending",   label: "Pending"    },
  { key: "cancelled", label: "Cancelled"  },
];

function fmtINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function inTab(o: RealOrder, tab: Tab): boolean {
  if (tab === "all")       return true;
  if (tab === "cancelled") return o.status === "Cancelled";
  if (tab === "paid")      return o.status !== "Cancelled" && o.paymentStatus === "Paid";
  return o.status !== "Cancelled" && o.paymentStatus === "Pending";
}

function presetFromUrl(): BookingPreset | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  if (q.get("book") !== "1" || !q.get("name")) return null;
  const num = (k: string) => (q.get(k) ? Number(q.get(k)) || undefined : undefined);
  return {
    customer: {
      member_id: q.get("member") || null, name: q.get("name") || "", email: q.get("email") || "",
      phone: q.get("phone") || "", enquiry_id: q.get("enquiry") || null,
    },
    from: q.get("from") || undefined, fromCity: q.get("fromCity") || undefined,
    to: q.get("to") || undefined, toCity: q.get("toCity") || undefined,
    date: q.get("date") || undefined, returnDate: q.get("ret") || undefined,
    adults: num("adults"), children: num("children"), infants: num("infants"),
    requests: q.get("bag") || q.get("seat") || q.get("meal") || q.get("note")
      ? { extraBaggageKg: num("bag") || 0, seat: q.get("seat") || "", meal: q.get("meal") || "", note: q.get("note") || "" }
      : undefined,
  };
}

export function OrdersWorkspace() {
  const [tab,        setTab]        = useState<Tab>("all");
  const [range,      setRange]      = useState("90");
  const [query,      setQuery]      = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew,    setShowNew]    = useState(() => !!presetFromUrl());
  const [addTo,      setAddTo]      = useState<RealOrder | null>(null);
  const [orders,     setOrders]     = useState<RealOrder[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [liveError,  setLiveError]  = useState<string | null>(null);
  const [details,    setDetails]    = useState<Record<string, RealOrder>>({});
  // "Book this trip" from an enquiry (Console / Pipeline) lands here as
  // /orders?book=1&enquiry=…&name=…: open New Booking for that customer, with
  // the route/dates/party they asked for, and tie the order to the enquiry.
  // Read once on mount (this screen only renders client-side, after sign-in).
  const [preset,     setPreset]     = useState<BookingPreset | null>(() => presetFromUrl());
  useEffect(() => {
    if (preset) window.history.replaceState(null, "", window.location.pathname); // a reload must not reopen it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // silent = background refresh: no loading spinner, selection untouched.
  const loadOrders = useCallback((silent: boolean | unknown = false) => {
    if (silent !== true) setLoading(true);
    bookingListOrders()
      .then((rows: any[]) => {
        // newest first, always
        const mapped = (rows || []).slice()
          .sort((a, b) => (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0) || (Number(b.seq) || 0) - (Number(a.seq) || 0))
          .map(summaryToOrder);
        setOrders(mapped);
        setLiveError(null);
        setSelectedId((prev) => prev ?? (mapped[0]?.id || null));
      })
      .catch((e: any) => setLiveError((e && e.message) || "Could not load orders."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // New orders appear without a manual refresh: poll while the tab is visible, and refresh on focus.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") loadOrders(true); };
    const id = window.setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); };
  }, [loadOrders]);

  const loadDetail = useCallback((o: RealOrder) => {
    bookingGetOrder(o.dbId)
      .then((d: any) => setDetails((m) => ({ ...m, [o.id]: detailToOrder(d) })))
      .catch((e: any) => setLiveError((e && e.message) || "Could not load order detail."));
  }, []);

  const inRange = useMemo(() => {
    if (range === "all") return orders;
    const cutoff = Date.now() - Number(range) * 86_400_000;
    return orders.filter((o) => new Date(o.createdAt).getTime() >= cutoff);
  }, [range, orders]);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRange.filter((o) =>
      [o.id, o.customerName, o.destination, o.email].some((v) =>
        v?.toLowerCase().includes(q)
      )
    );
  }, [inRange, query]);

  const counts: Record<Tab, number> = {
    all:       searched.length,
    paid:      searched.filter((o) => inTab(o, "paid")).length,
    pending:   searched.filter((o) => inTab(o, "pending")).length,
    cancelled: searched.filter((o) => inTab(o, "cancelled")).length,
  };

  const rows = searched.filter((o) => inTab(o, tab));
  const base = orders.find((o) => o.id === selectedId) || null;
  const selected = base ? details[base.id] || base : null;

  // Opening an order loads its full detail (itineraries, travellers, booking progress).
  useEffect(() => {
    if (base && !details[base.id]) loadDetail(base);
  }, [base, details, loadDetail]);

  // After a fulfilment action: refresh this order and the list (status / paid badges).
  const refreshSelected = useCallback(() => {
    if (base) loadDetail(base);
    loadOrders();
  }, [base, loadDetail, loadOrders]);

  function handleCreated(orderId: string) {
    setShowNew(false);
    setAddTo(null);
    loadOrders(true);
    bookingGetOrder(orderId)
      .then((d: any) => {
        const full = detailToOrder(d);
        setDetails((m) => ({ ...m, [full.id]: full }));
        setSelectedId(full.id);
        setTab("all");
        setQuery("");
        loadOrders();
      })
      .catch(() => loadOrders());
  }

  return (
    <div className="ow">
      <div className="ow-col">
        <div className="ow-tools">
          <button type="button" className="taw-btn taw-btn--primary taw-btn--block" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={15} /> New Booking
          </button>
          {liveError && (
            <div className="taw-banner taw-banner--danger" style={{ margin: "6px 0 0" }}>
              {liveError}
            </div>
          )}
          <div className="ow-tabs" role="tablist" aria-label="Order status">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key}
                className={"ow-tab" + (tab === t.key ? " is-active" : "")}
                onClick={() => setTab(t.key)}>
                {t.label}<span className="n">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="ow-toolrow">
            <label className="ow-search">
              <Icon name="search" size={15} />
              <input className="taw-input" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by Order ID, customer name or destination" aria-label="Search orders" />
            </label>
            <Dropdown value={range} options={RANGES} onChange={setRange} ariaLabel="Date range" hideOptionIcons />
          </div>
        </div>

        {loading ? (
          <Empty icon="loader" title="Loading orders…" message="" />
        ) : orders.length === 0 ? (
          <Empty icon="luggage" title="No orders yet" message="Click New Booking to create your first order." />
        ) : rows.length === 0 ? (
          <Empty icon="search" title="No orders match" message="Try a different tab, date range or search term." />
        ) : (
          rows.map((o) => (
            <div key={o.id} role="button" tabIndex={0}
              className={"ow-row" + (o.id === selectedId ? " is-selected" : "")}
              onClick={() => setSelectedId(o.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(o.id); } }}>
              <div className="ow-row-top">
                <span className="ow-id">#{o.id}</span>
                <span className={statusClass(o.status)}>{o.status}</span>
              </div>
              <div className="ow-cust">{o.customerName}</div>
              <div className="ow-sub">{o.email}</div>
              <div className="ow-meta">
                <span><Icon name="compass" size={13} />{o.destination}</span>
                {o.itineraries?.[0] && (
                  <span className="ow-tag">
                    {o.itineraries[0].label}{o.itineraries.length > 1 ? " +" + (o.itineraries.length - 1) : ""}
                  </span>
                )}
              </div>
              <div className="ow-meta">
                <span><Icon name="calendar" size={13} />{o.travelDates}</span>
                <span><Icon name="user" size={13} />{o.travellers?.length ? o.travellers.length + " traveller" + (o.travellers.length === 1 ? "" : "s") : details[o.id] ? "Travellers pending" : "—"}</span>
              </div>
              <div className="ow-row-foot">
                <span><span className="ow-amt">{fmtINR(o.amount)}</span>{" "}<span className={statusClass(o.paymentStatus)}>{o.paymentStatus}</span></span>
                <button type="button" className="taw-btn taw-btn--sm" onClick={(e) => { e.stopPropagation(); setSelectedId(o.id); }}>View</button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="ow-col">
        {selected ? (
          <OrderDetail key={selected.id + (details[selected.id] ? ":full" : "")} order={selected}
            onAddFlight={selected.dbId && selected.status !== "Cancelled" ? () => setAddTo(selected) : undefined}
            onChanged={refreshSelected}
            onDeleted={() => {
              const gone = selected.id;
              setOrders((list) => list.filter((o) => o.id !== gone));
              setDetails((m) => { const n = { ...m }; delete n[gone]; return n; });
              setSelectedId(null);
              loadOrders();
            }} />
        ) : (
          <Empty icon="luggage" title="Select an order" message="Pick an order on the left to see its details." />
        )}
      </div>

      {(showNew || addTo) && (
        <NewBookingModal
          onClose={() => { setShowNew(false); setAddTo(null); setPreset(null); loadOrders(true); }}
          onCreated={(id) => { setPreset(null); handleCreated(id); }}
          addToOrder={addTo?.dbId ? { dbId: addTo.dbId, customerName: addTo.customerName, email: addTo.email } : undefined}
          preset={addTo ? undefined : preset || undefined}
        />
      )}
    </div>
  );
}
