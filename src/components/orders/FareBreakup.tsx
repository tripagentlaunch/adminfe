"use client";
import { fareBreakup } from "../../lib/fareBreakup";
import { inr } from "../../services/api";

/* "Price breakup" on a flight's price: Base fare, Taxes & fees, Other charges, Total. Opens on hover or
   keyboard focus; there is nothing to show (and nothing is drawn) when Tripsure sent no base fare / tax. */

export function FareBreakup({ price, children }: { price: any; children: React.ReactNode }) {
  const b = fareBreakup(price);
  if (!b) return <>{children}</>;
  return (
    <span className="ow-bk" tabIndex={0} aria-label="Price breakup">
      <span className="ow-bk-trigger">{children}</span>
      <span className="ow-bk-pop" role="tooltip">
        <b className="ow-bk-t">Price breakup</b>
        {b.lines.map((l) => (
          <span key={l.key} className={`ow-bk-row${l.key === "total" ? " total" : ""}`}>
            <span>{l.label}</span>
            <span>{l.key === "taxes" || l.key === "other" ? "+" : ""}{inr(l.amount)}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
