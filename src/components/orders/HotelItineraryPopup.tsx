"use client";
/* The Console's "Add a hotel" popup: after Search in the Hotels desk, the same hotel flow as New Booking
   opens over the page - the hotels as cards, a hotel's page, the room picker, the review - and the last
   step adds the room to the itinerary (builder + proposal) instead of recording an order. */
import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui";
import { errText } from "../../lib/errText";
import { NewBookingHotel } from "./NewBookingHotel";
import type { RoomGuests } from "../../lib/hotelRooms";
import "../../styles/orders-workspace.css";

export type HotelPopupSearch = { city: string; location: any | null; checkIn: string; checkOut: string; rooms: RoomGuests[] };

export function HotelItineraryPopup({ search, findName, onAdd, onClose }: {
  search: HotelPopupSearch;
  /** Open this hotel's room list by itself once the search has it (Get live price on a Tara draft stay). */
  findName?: string;
  /** The itinerary item for the room that was picked (same shape the Hotels desk has always passed to onAdd). */
  onAdd: (item: any) => void;
  onClose: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="taw-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Add a hotel to the itinerary"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="taw-modal-panel ow-modal ow-modal--wide nb-modal">
        <div className="nb-mhead">
          <div className="nb-mtitle">
            <h2>Add a hotel to the itinerary</h2>
            <span>Pick a hotel and a room - it is added to the itinerary and the proposal; nothing is booked</span>
          </div>
          <button type="button" className="nb-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        {err ? <div className="taw-banner taw-banner--danger">{errText(err)}</div> : null}
        <NewBookingHotel mode="itinerary" initial={search} autoSearch findName={findName} onBack={onClose} onError={setErr} onAddToItinerary={onAdd} />
      </div>
    </div>,
    document.body,
  );
}
