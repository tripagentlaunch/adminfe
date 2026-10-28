"use client";
/* Order detail (real booking_* data): header, booking progress checklist
   (travellers -> payment -> ticket / confirm), itinerary tabs, Flights /
   Hotels / Visa sub-tabs, trip summary side card and traveller list. */
import { useState } from "react";
import { Icon } from "../ui";
import { fmtINR, type Flight, type Hotel, type Itinerary, type Order, type Visa } from "../../lib/orderTypes";
import { statusClass } from "./orderUi";
import { OrderFulfilment } from "./OrderFulfilment";

// A stay's photo over its gradient + name; if the photo is missing or fails to load,
// the gradient and name stay (never a broken image).
function Photo({ src, tone, label }: { src?: string | null; tone: string; label: string }) {
  const [bad, setBad] = useState(false);
  return (
    <div className="ow-photo" style={{ background: tone, position: "relative", overflow: "hidden" }}>
      {src && !bad ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} loading="lazy" onError={() => setBad(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}
      <span style={{ position: "relative" }}>{label}</span>
    </div>
  );
}

function FlightCard({ f, travellers }: { f: Flight; travellers: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ow-seg">
      <div className="ow-seg-top">
        <span><Icon name="calendar" size={13} /> {f.dateLabel}</span>
        <span>{f.airline} · {f.flightNo}{f.pnr ? <> · PNR <b>{f.pnr}</b></> : null}</span>
      </div>
      <div className="ow-route">
        <div className="ow-city"><div className="code">{f.from}</div><div className="time">{f.dep}</div><div className="nm">{f.fromCity}</div></div>
        <div className="ow-line">{f.duration}<div className="bar" />{f.stops}</div>
        <div className="ow-city r"><div className="code">{f.to}</div><div className="time">{f.arr}</div><div className="nm">{f.toCity}</div></div>
      </div>
      <div className="ow-seg-foot">
        <span><span className="taw-chip taw-chip--dom">{f.cabin}</span> &nbsp;{fmtINR(f.pricePerTraveller)} <small>per traveller</small></span>
        <button type="button" className="taw-btn taw-btn--sm" onClick={() => setOpen((v) => !v)}>{open ? "Hide details" : "View details"}</button>
      </div>
      {open ? (
        <div className="ow-seg-detail">
          <div><b>Baggage</b>{f.detail.baggage || "Not provided"}</div>
          <div><b>Seats</b>{f.detail.seat || "Not selected yet"}</div>
          <div><b>Terminal</b>{f.detail.terminal || "Not provided"}</div>
          <div><b>Segment total</b>{fmtINR(f.pricePerTraveller * travellers)} for {travellers}</div>
        </div>
      ) : null}
    </div>
  );
}

function FlightsTab({ it, travellers }: { it: Itinerary; travellers: number }) {
  const total = it.flights.reduce((s, f) => s + f.pricePerTraveller * travellers, 0);
  return (
    <>
      {it.flights.map((f) => <FlightCard key={f.id} f={f} travellers={travellers} />)}
      <div className="ow-total"><span>Total flights ({travellers} traveller{travellers === 1 ? "" : "s"})</span><span>{fmtINR(total)}</span></div>
    </>
  );
}

function HotelTab({ h }: { h: Hotel | null }) {
  if (!h) return <div className="ow-card">No hotel in this itinerary.</div>;
  return (
    <div className="ow-card">
      <div className="ow-hotel">
        <Photo src={h.imageUrl} tone={h.tone} label={h.name} />
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{h.name}</div>
              <div className="ow-sub" style={{ whiteSpace: "normal" }}>{h.location}</div>
            </div>
            <span className="ow-rating"><Icon name="star" size={14} />{h.rating.toFixed(1)}</span>
          </div>
          {h.pricePerNight ? <div style={{ marginTop: 6, fontSize: 13 }}><b>{fmtINR(h.pricePerNight)}</b> <span className="ow-sub">per night</span></div> : null}
          {h.roomType ? <div style={{ marginTop: 4, fontSize: 13 }}>{h.roomType}{h.board ? " · " + h.board : ""}</div> : null}
          {h.refundable != null ? <div className="ow-sub">{h.refundable ? "Refundable" : "Non-refundable"}{h.priceChanged ? " · price changed at verification" : ""}</div> : null}
          <div className="ow-tags">{h.amenities.map((a) => <span key={a} className="ow-amen">{a}</span>)}</div>
        </div>
      </div>
      {h.bookingStatus === "confirmed" ? (
        <div className="ow-lock">
          <b>Confirmed with the hotel</b>
          {h.confirmationNumber ? <div>Confirmation {h.confirmationNumber}</div> : null}
          {h.lock?.guest ? <div>Guest {h.lock.guest}</div> : null}
        </div>
      ) : h.lock ? (
        <div className="ow-lock">
          <b>Room locked with Tripsure</b>
          <div>Reference {h.lock.partnerRef}{h.lock.guest ? " · Guest " + h.lock.guest : ""}</div>
          {h.lock.total != null ? <div>Locked amount {fmtINR(h.lock.total)}</div> : null}
          <div className="ow-sub" style={{ whiteSpace: "normal" }}>Not booked yet — confirm it from Booking progress once the order is paid.</div>
        </div>
      ) : (
        <div className="ow-sub" style={{ whiteSpace: "normal", margin: "8px 0" }}>
          Room not locked yet (no guest details). Add it again with guest details (Add flight or hotel → Hotel only) to lock it before booking.
        </div>
      )}
      <div className="ow-sum">
        <div><div className="k">Check-in</div><div className="v">{h.checkIn}</div></div>
        <div><div className="k">Check-out</div><div className="v">{h.checkOut}</div></div>
        <div><div className="k">Nights</div><div className="v">{h.nights}</div></div>
        <div><div className="k">Rooms</div><div className="v">{h.rooms}</div></div>
        <div><div className="k">Total price</div><div className="v">{fmtINR(h.total)}</div></div>
      </div>
    </div>
  );
}

function VisaTab({ v }: { v: Visa | null }) {
  if (!v) return <div className="ow-card">No visa needed for this itinerary.</div>;
  const stage = v.status === "Not started" ? -1 : v.status === "Applied" ? 1 : 2;
  const steps = ["Applied", "Under process", "Decision"];
  return (
    <div className="ow-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{v.type}</div>
          <div className="ow-sub">{v.country} · Processing time {v.processing}</div>
        </div>
        <span className={statusClass(v.status)}>{v.status}</span>
      </div>
      <div className="ow-steps" aria-label="Application progress">
        {steps.map((s, i) => (
          <span key={s} style={{ display: "contents" }}>
            <span className={"ow-step" + (i <= stage ? " on" : "")}><i />{s}</span>
            {i < steps.length - 1 ? <span className="ow-stepbar" /> : null}
          </span>
        ))}
      </div>
      <div className="taw-banner taw-banner--info" style={{ margin: "8px 0 12px" }}>{v.note}</div>
      <h4 style={{ marginBottom: 0 }}>Documents required</h4>
      <ul className="ow-docs">{v.documents.map((d) => <li key={d}><Icon name="check" size={14} />{d}</li>)}</ul>
      <div className="ow-sum"><div><div className="k">Visa fee</div><div className="v">{v.fee ? fmtINR(v.fee) : "Free"}</div></div></div>
    </div>
  );
}

export function OrderDetail({ order, onAddFlight, onChanged }: { order: Order; onAddFlight?: () => void; onChanged?: () => void }) {
  const [itinId, setItinId] = useState(order.itineraries[0].id);
  const first = order.itineraries[0];
  // A hotel-only itinerary has nothing under Flights, so open on Hotels.
  const [sub, setSub] = useState<"flights" | "hotels" | "visa">(first.flights.length === 0 && first.hotel ? "hotels" : "flights");
  const it = order.itineraries.find((i) => i.id === itinId) || order.itineraries[0];
  // Before travellers are entered, fall back to the searched passenger count so
  // per-traveller totals still add up.
  const n = order.travellers.length || order.paxCount || 0;
  const lead = order.travellers[0];

  return (
    <>
      <div className="ow-head">
        <div className="ow-head-top">
          <div className="ow-title">
            <span><span className="num">Order #{order.number} ·</span> {order.id}</span>
            <span className={statusClass(order.status)}>{order.status}</span>
          </div>
        </div>
        <div className="ow-facts">
          <div className="ow-fact"><div className="k">Customer</div><div className="v">{order.customerName}<small>{order.email}</small></div></div>
          <div className="ow-fact"><div className="k">Travel dates</div><div className="v">{order.travelDates}</div></div>
          <div className="ow-fact"><div className="k">Travellers</div><div className="v">{n}</div></div>
          <div className="ow-fact"><div className="k">Total amount</div><div className="v">{fmtINR(order.amount)}<small><span className={statusClass(order.paymentStatus)}>{order.paymentStatus}</span></small></div></div>
        </div>
      </div>

      {order.fulfilment ? <OrderFulfilment order={order} onChanged={onChanged || (() => undefined)} /> : null}

      {order.itineraries.length > 1 ? (
        <div className="ow-itins" role="tablist" aria-label="Itineraries">
          {order.itineraries.map((i) => (
            <button key={i.id} role="tab" aria-selected={i.id === it.id} className={"ow-itin" + (i.id === it.id ? " is-active" : "")} onClick={() => setItinId(i.id)}>{i.label}</button>
          ))}
        </div>
      ) : null}

      <div className="ow-subtabs" role="tablist" aria-label="Itinerary sections">
        {([["flights", "Flights", "flight"], ["hotels", "Hotels", "hotel"], ["visa", "Visa", "visa"]] as const).map(([k, label, icon]) => (
          <button key={k} role="tab" aria-selected={sub === k} className={"ow-subtab" + (sub === k ? " is-active" : "")} onClick={() => setSub(k)}>
            <Icon name={icon} size={15} />{label}
          </button>
        ))}
      </div>

      <div className="ow-layout">
        <div>
          {sub === "flights" ? <FlightsTab it={it} travellers={n} /> : null}
          {sub === "flights" && onAddFlight ? (
            <button type="button" className="taw-btn taw-btn--block" style={{ marginTop: 8 }} onClick={onAddFlight}><Icon name="plus" size={15} /> Add flight or hotel</button>
          ) : null}
          {sub === "hotels" ? <HotelTab h={it.hotel} /> : null}
          {sub === "visa" ? <VisaTab v={it.visa} /> : null}
        </div>

        <div>
          <div className="ow-card ow-trip">
            <Photo src={it.hotel?.imageUrl} tone={order.tone} label={order.destination} />
            <h5>{it.title}</h5>
            <div className="m"><Icon name="calendar" size={13} /> {it.dates}</div>
            <div className="m"><Icon name="user" size={13} /> {n} traveller{n === 1 ? "" : "s"} · Lead: {lead ? lead.name : "not added yet"}</div>
            {it.tripsure ? (
              <div className="ow-lock">
                <b>Fare locked with Tripsure</b>
                <div>Itinerary {it.tripsure.itineraryId}</div>
                {it.tripsure.totalFare != null ? <div>Fare {fmtINR(it.tripsure.totalFare)}{it.tripsure.priceChanged ? " (price changed since search)" : ""}</div> : null}
                <div className="ow-sub" style={{ whiteSpace: "normal" }}>
                  The fare lock is short-lived: add travellers, record payment and issue the ticket from Booking progress.
                </div>
              </div>
            ) : null}
          </div>
          <div className="ow-card">
            <h4>Traveller Information</h4>
            {order.travellers.length === 0 ? <div className="ow-sub" style={{ whiteSpace: "normal" }}>No passengers added yet.</div> : null}
            <ul className="ow-trav">
              {order.travellers.map((t) => (
                <li key={t.id || t.name}>
                  <span className="ow-av">{t.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
                  <span className="who">
                    {t.title ? t.title + " " : ""}{t.name}
                    <small>{[t.isLead ? "Lead" : t.relation, t.paxType && t.paxType !== "adult" ? t.paxType : "", t.passportLast4 ? "Passport •••• " + t.passportLast4 : ""].filter(Boolean).join(" · ")}</small>
                  </span>
                  {t.age != null ? <span className="ow-sub">{t.age} yrs</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
