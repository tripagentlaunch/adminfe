"use client";
/* The legs of a multi-city trip on the New booking search screen: one row per flight (From, To, date), 2 to 5 of them.
 * A new row starts where the last one ended, a few days later (lib/multiCity.ts). The airport suggestions are the same as the
 * one-way search's, passed in by the screen. */
import type { ReactNode } from "react";
import { Icon } from "../ui";
import { AutosuggestInput } from "../AutosuggestInput";
import { MC_MAX_LEGS, MC_MIN_LEGS, addLeg, removeLeg, type McLeg } from "../../lib/multiCity";

interface Props {
  legs: McLeg[];
  onChange: (legs: McLeg[]) => void;
  /** earliest date that can be picked (today) */
  min: string;
  fetchSuggestions: (q: string) => Promise<any[]>;
  renderSuggestion: (a: any) => ReactNode;
  getKey: (a: any) => string;
  disabled?: boolean;
}

export function MultiCityLegs({ legs, onChange, min, fetchSuggestions, renderSuggestion, getKey, disabled }: Props) {
  const patch = (i: number, p: Partial<McLeg>) => onChange(legs.map((l, j) => (j === i ? { ...l, ...p } : l)));

  function airport(i: number, side: "from" | "to") {
    const l = legs[i];
    const code = l[side], city = side === "from" ? l.fromCity : l.toCity, name = side === "from" ? l.fromName : l.toName;
    const label = side === "from" ? "From" : "To";
    return (
      <label className={`ow-pill ow-pill--field nb-mc-air${code.length === 3 && city ? " set" : ""}`}>
        <span className="ow-pill-l"><i className="nb-dot" /> {label}</span>
        <AutosuggestInput
          className="ow-pill-input"
          value={code}
          onChange={(v: any) => patch(i, side === "from" ? { from: String(v).toUpperCase(), fromCity: "", fromName: "" } : { to: String(v).toUpperCase(), toCity: "", toName: "" })}
          onSelect={(a: any) => patch(i, side === "from"
            ? { from: a.airport_code, fromCity: a.city, fromName: a.airport_name || "" }
            : { to: a.airport_code, toCity: a.city, toName: a.airport_name || "" })}
          fetchSuggestions={fetchSuggestions}
          floating
          renderSuggestion={renderSuggestion}
          getKey={getKey}
          isHeading={(a: any) => !!a.heading}
          maxResults={24}
          listClassName="nb-airport-list"
          placeholder="City or airport"
        />
        {code.length === 3 && city ? (
          <span className="ow-pill-s nb-place" title={[city, name].filter(Boolean).join(" · ")}>
            <b>{city}</b>{name ? ` · ${name}` : ""}
          </span>
        ) : null}
      </label>
    );
  }

  return (
    <div className="nb-mc" role="group" aria-label="Flights of the trip">
      {legs.map((l, i) => (
        <div className="nb-mc-row" key={i}>
          <span className="nb-mc-n">Flight {i + 1}</span>
          {airport(i, "from")}
          {airport(i, "to")}
          <label className="ow-pill ow-pill--field nb-mc-date">
            <span className="ow-pill-l"><i className="nb-dot" /> Date</span>
            <input
              type="date"
              className="ow-pill-input"
              value={l.date}
              min={i > 0 && legs[i - 1].date > min ? legs[i - 1].date : min}
              disabled={disabled}
              aria-label={`Date of flight ${i + 1}`}
              onChange={(e) => patch(i, { date: e.target.value })}
            />
          </label>
          <button type="button" className="ow-swap nb-mc-x" disabled={disabled || legs.length <= MC_MIN_LEGS}
            aria-label={`Remove flight ${i + 1}`} title={legs.length <= MC_MIN_LEGS ? "A multi-city trip needs at least 2 flights" : "Remove this flight"}
            onClick={() => onChange(removeLeg(legs, i))}>
            <Icon name="minus" size={14} />
          </button>
        </div>
      ))}
      <div className="nb-mc-add">
        <button type="button" className="taw-btn taw-btn--sm" disabled={disabled || legs.length >= MC_MAX_LEGS} onClick={() => onChange(addLeg(legs))}>
          <Icon name="plus" size={13} /> Add another flight
        </button>
        <span className="ow-sub">{legs.length} of {MC_MAX_LEGS} flights · each starts where the last one ended unless you change it</span>
      </div>
    </div>
  );
}
