/* =============================================================================
 * TripAgent — src/lib/useQuotePricing.ts
 * Extracted from QuoteBuilder.tsx (2026-09-08) — the Proposal PDF's cost
 * breakdown must reflect the SAME real priced quote Quote Builder shows,
 * not a second independent price() call against the same cart (which
 * could race, double-hit the backend, or drift if `inclusive` differs).
 * Proposal Composer now owns this single call and passes the result down
 * to both QuoteBuilder (controlled props) and the PDF preview.
 * ===========================================================================*/
import { useEffect, useMemo, useRef, useState } from "react";
import { price } from "../services/api";
import { errText } from "./advisorHelpers";

export function useQuotePricing(cart: any[], member: any, advisorId: any, inclusive: boolean) {
  const [pricing, setPricing] = useState<any>(null);
  const [quoteId, setQuoteId] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<any>(null);

  const reqRef = useRef(0);

  const sig = useMemo(
    () => cart.map((i: any) => i.type + ":" + i.baseNet + ":" + (i.international ? 1 : 0)).join("|") + "|incl:" + (inclusive ? 1 : 0),
    [cart, inclusive]
  );

  useEffect(() => {
    if (!cart.length) {
      setPricing(null);
      setQuoteId(null);
      setErr(null);
      return;
    }
    const myReq = ++reqRef.current;
    setLoading(true);
    setErr(null);
    const items = cart.map((it: any) => {
      const copy: any = {};
      for (const k in it) {
        if (k.charAt(0) !== "_") copy[k] = it[k];
      }
      return copy;
    });
    const payload: any = { cart: { items: items, inclusive: inclusive } };
    if (member && member.id) payload.member_id = member.id;
    if (advisorId) payload.advisor_id = advisorId;
    price(payload)
      .then((r: any) => {
        if (myReq !== reqRef.current) return;
        setPricing(r.pricing || null);
        setQuoteId(r.quote_id || null);
        setLoading(false);
      })
      .catch((e: any) => {
        if (myReq !== reqRef.current) return;
        setErr(errText(e));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return { pricing, quoteId, loading, err };
}
