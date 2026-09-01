"use client";
/* =============================================================================
 * TripAgent — src/components/panels/VisaDesk.tsx
 * Ported from web/js/advisor.js: VisaDesk (line ~1404) + VisaChecklist
 * (line ~1385, colocated here — only ever used by VisaDesk in the original
 * module too).
 * ===========================================================================*/
import { useState } from "react";
import { searchVisa, inr } from "../../services/api";
import { errText, toast, visaCartItem } from "../../lib/advisorHelpers";
import { Empty, Field, Spinner, SkeletonResults, Icon } from "../ui";

// CX-023 — visa document checklist the advisor works through with the member.
// All required documents (not a truncated preview), each tickable as collected,
// with a running progress count. Local state — a working collection aid.
function VisaChecklist(props: any) {
  const docs = props.documents || [];
  const [checked, setChecked] = useState<any>({});
  function toggle(i: number) {
    setChecked((c: any) => ({ ...c, [i]: !c[i] }));
  }
  const done = docs.filter((_: any, i: number) => checked[i]).length;
  return (
    <div className="taw-vchk">
      <div className="taw-vchk-h">
        <span className="taw-vchk-lbl taw-icrow">
          <Icon name="note" size={13} />
          Document checklist
        </span>
        <span className="taw-vchk-prog ta-num">
          {done} / {docs.length} collected
        </span>
      </div>
      <div className="taw-vchk-list">
        {docs.map((doc: any, i: number) => {
          const on = !!checked[i];
          return (
            <button
              key={i}
              type="button"
              className={"taw-vchk-item" + (on ? " is-on" : "")}
              onClick={() => toggle(i)}
              aria-pressed={on ? "true" : "false"}
            >
              <span className="taw-vchk-box">{on ? <Icon name="check" size={12} /> : null}</span>
              <span className="taw-vchk-txt">{doc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Phase 3: OneVasco's get_product_cost() (behind GET /visa/vendor/search)
// requires a visa category — this endpoint has no dev-mode fallback for a
// missing one, it just silently falls through to local data (see
// visa_service.vendor_search()). Confirmed live (2026-08-10) as the only
// two case-sensitive values that return real products.
const VISA_CATEGORIES = ["Tourist", "Business"];

export function VisaDesk(props: any) {
  const member = props.member;
  const natDefault = member && member.nationality === "IN" ? "India" : (member && member.nationality) || "India";
  const [form, setForm] = useState({ nationality: natDefault, destination: "UAE", pax: 2, category: VISA_CATEGORIES[0] });
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  function set(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function run() {
    setErr(null);
    setLoading(true);
    setRes(null);
    // adult/child/infant split isn't collected in this form yet — every pax
    // counted as an adult is the simplest mapping onto get_product_cost()'s
    // required adult/child/infant counts until this form grows one.
    const params = {
      nationality: form.nationality.trim(),
      destination: form.destination.trim(),
      adult: Number(form.pax) || 1,
      child: 0,
      infant: 0,
      category: form.category,
    };
    searchVisa(params)
      .then((r: any) => {
        setRes(r);
        setLoading(false);
        toast("Visa requirement resolved", "success");
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
        toast("Visa lookup failed", "error");
      });
  }
  const offers = (res && res.offers) || [];
  const dests = ["UAE", "UK", "USA", "Schengen", "Singapore", "Thailand", "Bali"];
  return (
    <div className="taw-fade-in">
      <div className="taw-row taw-row-4" style={{ marginBottom: 13 }}>
        <Field label="Nationality" htmlFor="taw-vi-nat">
          <input className="taw-input" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
        </Field>
        <Field label="Destination" htmlFor="taw-vi-dest">
          <select className="taw-select" value={form.destination} onChange={(e) => set("destination", e.target.value)}>
            {dests.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pax" htmlFor="taw-vi-pax">
          <input className="taw-input" type="number" min={1} value={form.pax} onChange={(e) => set("pax", e.target.value)} />
        </Field>
        <Field label="Category" htmlFor="taw-vi-cat">
          <select className="taw-select" value={form.category} onChange={(e) => set("category", e.target.value)}>
            {VISA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button className="taw-btn taw-btn--primary taw-btn--block" disabled={loading} onClick={run} style={{ marginBottom: 13 }}>
        {loading ? <Spinner /> : <Icon name="visa" size={16} />}
        {loading ? "Checking…" : "Check Visa Requirement"}
      </button>
      {err ? (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : null}
      {loading ? <SkeletonResults /> : null}
      {!loading && res ? (
        <div className="taw-results">
          {offers.length ? (
            offers.map((o: any) => {
              const d = o.detail || {};
              const net = Number(o.base_net != null ? o.base_net : o.baseNet) || 0;
              return (
                <div key={o.id} className="taw-res">
                  <div className="taw-res-main">
                    <div className="taw-res-title">
                      <Icon name="visa" size={18} /> {d.destination || "Visa"} visa
                      {d.visa_required ? <span className="taw-chip taw-chip--visa">Required</span> : <span className="taw-chip taw-chip--ref">Visa-free</span>}
                    </div>
                    <div className="taw-res-sub">
                      {d.visa_type ? (
                        <span>
                          <b>{d.visa_type}</b>
                        </span>
                      ) : null}
                      {d.processing_days ? (
                        <span className="taw-icrow">
                          <Icon name="clock" size={13} />
                          {d.processing_days + " days"}
                        </span>
                      ) : null}
                      {/* OneVasco-only fields (Phase 3) — absent on the local-fallback
                          path, where processing_days carries the equivalent info instead. */}
                      {d.visa_duration && d.visa_duration !== "NA" ? <span>{d.visa_duration}</span> : null}
                      {d.entries_allowed && d.entries_allowed !== "NA" ? <span>{d.entries_allowed + " entry"}</span> : null}
                      {d.pax ? <span>{d.pax + " applicants"}</span> : null}
                      {d.source ? <span className="taw-muted">src: {d.source}</span> : null}
                    </div>
                    {d.documents && d.documents.length ? <VisaChecklist documents={d.documents} /> : null}
                  </div>
                  <div className="taw-res-side">
                    <div className="taw-res-net ta-num">
                      {inr(net)}
                      <small>fee total</small>
                    </div>
                    <button className="taw-btn taw-btn--accent taw-btn--sm" onClick={() => props.onAdd(visaCartItem(o))}>
                      <Icon name="plus" size={13} />
                      Add
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <Empty icon={<Icon name="visa" size={28} />}>No visa offer returned.</Empty>
          )}
        </div>
      ) : null}
      {!loading && !res && !err ? <Empty icon={<Icon name="visa" size={28} />}>Resolve a visa requirement to add it to the itinerary.</Empty> : null}
    </div>
  );
}
