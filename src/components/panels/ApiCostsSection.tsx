/**
 * API costs (2026-10-12, direct request): what every paid API costs us —
 * Claude, Gemini, Google Places, Zyte, search, email, WhatsApp, TripSure —
 * in total, by feature, by day and per customer (what each user consumed),
 * so we can see the average cost of serving a customer before pricing it.
 *
 * Every backend writes one api_usage row per paid call; adminbe's
 * /admin/api-usage aggregates them. Costs are estimates from the backends'
 * rate tables, not the providers' invoices.
 */
import { useEffect, useState } from "react";
import { adminApiUsage, adminApiUsageCustomer } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, fmtDate, fmtTime } from "../../lib/advisorHelpers";
import { Card, Empty, Spinner, Icon } from "../ui";

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Claude",
  gemini: "Gemini",
  google_places: "Google Places",
  google_search: "Google Search",
  serper: "Serper search",
  zyte: "Zyte",
  apify: "Apify",
  tripsure_hotel: "TripSure hotels",
  tripsure_flight: "TripSure flights",
  resend: "Email (Resend)",
  whatsapp: "WhatsApp",
  onevasco: "OneVasco visas",
};

const SERVICE_LABEL: Record<string, string> = {
  adminbe: "Admin panel",
  customerbe: "Website",
  chatbot: "Tara chatbot",
  sourcing: "Sourcing engine",
};

const RANGES = [7, 30, 90];

function usd(n: any): string {
  const v = Number(n) || 0;
  if (v === 0) return "$0";
  if (v < 0.01) return "$" + v.toFixed(4);
  if (v < 100) return "$" + v.toFixed(2);
  return "$" + Math.round(v).toLocaleString("en-US");
}

function num(n: any): string {
  return (Number(n) || 0).toLocaleString("en-US");
}

function tokens(input: any, output: any): string {
  const i = Number(input) || 0;
  const o = Number(output) || 0;
  if (!i && !o) return "—";
  const k = (x: number) => (x >= 1e6 ? (x / 1e6).toFixed(1) + "M" : x >= 1e3 ? (x / 1e3).toFixed(1) + "k" : String(x));
  return k(i) + " in · " + k(o) + " out";
}

const provider = (p: string) => PROVIDER_LABEL[p] || p;

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6, borderBottom: "1px solid var(--taw-line, rgba(0,0,0,.08))", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, borderBottom: "1px solid var(--taw-line, rgba(0,0,0,.06))", verticalAlign: "top" };
const tdNum: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

function Table(props: { head: string[]; numeric?: number[]; children: any }) {
  const numeric = new Set(props.numeric || []);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {props.head.map((h, i) => (
              <th key={h} style={numeric.has(i) ? { ...th, textAlign: "right" } : th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{props.children}</tbody>
      </table>
    </div>
  );
}

function Kpi(props: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ flex: "1 1 160px", padding: "12px 14px", border: "1px solid var(--taw-line, rgba(0,0,0,.08))", borderRadius: 10 }}>
      <div style={{ fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6 }}>{props.label}</div>
      <div className="ta-num" style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{props.value}</div>
      {props.hint ? <div className="taw-muted" style={{ fontSize: 11, marginTop: 2 }}>{props.hint}</div> : null}
    </div>
  );
}

// Share-of-total bar, for the provider breakdown.
function Bar(props: { value: number; max: number }) {
  const pct = props.max > 0 ? Math.max(2, (props.value / props.max) * 100) : 0;
  return (
    <div style={{ height: 6, borderRadius: 3, background: "var(--taw-line, rgba(0,0,0,.06))", minWidth: 80 }}>
      <div style={{ width: pct + "%", height: "100%", borderRadius: 3, background: "var(--taw-accent, #6E2A38)" }} />
    </div>
  );
}

// Cost per day as a row of columns, newest on the right.
function DayChart(props: { days: any[] }) {
  const days = props.days || [];
  const max = Math.max(0, ...days.map((d) => Number(d.costUsd) || 0));
  if (!days.length) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}>
        {days.map((d) => {
          const v = Number(d.costUsd) || 0;
          return (
            <div
              key={d.day}
              title={d.day + " · " + usd(v) + " · " + num(d.calls) + " calls"}
              style={{ flex: 1, minWidth: 3, height: max > 0 ? Math.max(v > 0 ? 3 : 1, (v / max) * 90) : 1, background: "var(--taw-accent, #6E2A38)", opacity: v > 0 ? 0.85 : 0.2, borderRadius: "2px 2px 0 0" }}
            />
          );
        })}
      </div>
      <div className="taw-muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
        <span>{days[0].day}</span>
        <span>{days[days.length - 1].day}</span>
      </div>
    </div>
  );
}

function CustomerDetail(props: { customer: any; days: number; onClose: () => void }) {
  const c = props.customer;
  const key = c.memberCode || c.memberId;
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    adminApiUsageCustomer(key, Math.max(props.days, 90))
      .then(setData)
      .catch((e: any) => setErr(errText(e)));
  }, [key, props.days]);

  return (
    <div style={{ border: "1px solid var(--taw-line, rgba(0,0,0,.1))", borderRadius: 10, padding: 14, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <b>{c.name || key}</b>{" "}
          <span className="taw-muted" style={{ fontFamily: "monospace", fontSize: 12 }}>{c.memberCode || ""}</span>
        </div>
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={props.onClose} aria-label="Close customer detail">
          <Icon name="x" size={12} />
        </button>
      </div>
      {err ? (
        <div className="taw-banner taw-banner--err" style={{ marginTop: 10 }}>
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : !data ? (
        <div className="taw-skel" style={{ height: 120, marginTop: 10 }} />
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            <Kpi label={"Spent · " + Math.max(props.days, 90) + " days"} value={usd(data.totalUsd)} />
            <Kpi label="Paid API calls" value={num(data.calls)} />
            {(data.byProvider || []).slice(0, 3).map((p: any) => (
              <Kpi key={p.provider} label={provider(p.provider)} value={usd(p.costUsd)} hint={num(p.calls) + " calls"} />
            ))}
          </div>
          <h4 style={{ margin: "16px 0 6px" }}>What they used</h4>
          <Table head={["API", "Feature", "Calls", "Tokens", "Cost"]} numeric={[2, 4]}>
            {(data.byOperation || []).map((o: any, i: number) => (
              <tr key={i}>
                <td style={td}>{provider(o.provider)}</td>
                <td style={td}>
                  {o.operation || "—"}
                  {o.model ? <div className="taw-muted" style={{ fontSize: 11 }}>{o.model}</div> : null}
                </td>
                <td style={tdNum}>{num(o.calls)}</td>
                <td style={tdNum}>{tokens(o.inputTokens, o.outputTokens)}</td>
                <td style={tdNum}>{usd(o.costUsd)}</td>
              </tr>
            ))}
          </Table>
          {data.recent && data.recent.length ? (
            <>
              <h4 style={{ margin: "16px 0 6px" }}>Latest calls</h4>
              <Table head={["When", "Where", "API", "Feature", "Tokens", "Cost"]} numeric={[5]}>
                {data.recent.slice(0, 30).map((r: any, i: number) => (
                  <tr key={i} style={r.ok === false ? { opacity: 0.6 } : undefined}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(r.created_at) + " " + fmtTime(r.created_at)}</td>
                    <td style={td}>{SERVICE_LABEL[r.service] || r.service}</td>
                    <td style={td}>{provider(r.provider)}</td>
                    <td style={td}>
                      {r.operation || "—"}
                      {r.ok === false ? <span className="taw-status taw-status--danger" style={{ marginLeft: 6 }}>failed</span> : null}
                    </td>
                    <td style={tdNum}>{tokens(r.input_tokens, r.output_tokens)}</td>
                    <td style={tdNum}>{usd(r.cost_usd)}</td>
                  </tr>
                ))}
              </Table>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

export function ApiCostsSection() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [open, setOpen] = useState<any>(null);
  const [query, setQuery] = useState("");

  function load() {
    setLoading(true);
    setErr(null);
    adminApiUsage(days)
      .then((d: any) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
      });
  }
  useEffect(load, [days]);

  const providers: any[] = (data && data.byProvider) || [];
  const maxProvider = Math.max(0, ...providers.map((p) => Number(p.costUsd) || 0));
  const q = query.trim().toLowerCase();
  const customers: any[] = ((data && data.byCustomer) || []).filter(
    (c: any) => !q || (c.name || "").toLowerCase().includes(q) || (c.memberCode || "").toLowerCase().includes(q),
  );
  const cs = (data && data.customers) || {};

  return (
    <Card
      title="API costs"
      icon={<Icon name="trend" size={18} />}
      sub={data && data.tableReady !== false ? usd(data.totalUsd) + " in the last " + days + " days · estimated" : ""}
      actions={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {RANGES.map((r) => (
            <button key={r} className={cx("taw-btn taw-btn--sm", r === days ? "" : "taw-btn--ghost")} onClick={() => setDays(r)} aria-pressed={r === days}>
              {r}d
            </button>
          ))}
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh API costs">
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          </button>
        </div>
      }
    >
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        {err ? (
          <div className="taw-banner taw-banner--err">
            <Icon name="alert" size={16} />
            {err}
          </div>
        ) : null}

        {loading && !data ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="taw-skel" style={{ height: 70 }} />
            ))}
          </div>
        ) : data && data.tableReady === false ? (
          <Empty icon={<Icon name="trend" size={28} />}>
            Cost tracking isn&rsquo;t switched on for this database yet: the api_usage table doesn&rsquo;t exist. Once it&rsquo;s created, every paid API call is recorded here.
          </Empty>
        ) : data ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Kpi label={"Total · " + days + " days"} value={usd(data.totalUsd)} hint={num(data.calls) + " paid calls"} />
              <Kpi label="Customers using APIs" value={num(cs.count)} />
              <Kpi label="Average per customer" value={usd(cs.avgUsd)} hint={"median " + usd(cs.medianUsd)} />
              <Kpi label="Avg per customer per active day" value={usd(cs.avgPerActiveDayUsd)} />
              <Kpi label="Not tied to a customer" value={usd(data.unattributedUsd)} hint="sourcing, admin tools, public pages" />
            </div>

            <div>
              <h4 style={{ margin: "0 0 8px" }}>By API</h4>
              {providers.length ? (
                <Table head={["API", "", "Calls", "Tokens", "Cost"]} numeric={[2, 4]}>
                  {providers.map((p) => (
                    <tr key={p.provider}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{provider(p.provider)}</td>
                      <td style={{ ...td, width: "40%" }}>
                        <Bar value={Number(p.costUsd) || 0} max={maxProvider} />
                      </td>
                      <td style={tdNum}>{num(p.calls)}</td>
                      <td style={tdNum}>{tokens(p.inputTokens, p.outputTokens)}</td>
                      <td style={tdNum}>{usd(p.costUsd)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty icon={<Icon name="trend" size={28} />}>No paid API calls recorded in this period.</Empty>
              )}
            </div>

            {data.byDay && data.byDay.length ? (
              <div>
                <h4 style={{ margin: "0 0 8px" }}>By day</h4>
                <DayChart days={data.byDay} />
              </div>
            ) : null}

            <div>
              <h4 style={{ margin: "0 0 8px" }}>Per customer — what each user consumed</h4>
              <input
                className="taw-input"
                placeholder="Search by name or invitation code"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: "100%", maxWidth: 320, marginBottom: 8 }}
              />
              {customers.length ? (
                <Table head={["Customer", "Calls", "Claude", "Other APIs", "Total", "Last used"]} numeric={[1, 2, 3, 4]}>
                  {customers.map((c) => {
                    const key = c.memberCode || c.memberId;
                    const claude = Number((c.byProvider || {}).anthropic) || 0;
                    const isOpen = open && (open.memberCode || open.memberId) === key;
                    return (
                      <tr key={key} onClick={() => setOpen(isOpen ? null : c)} style={{ cursor: "pointer", background: isOpen ? "var(--taw-hover, rgba(0,0,0,.03))" : undefined }}>
                        <td style={td}>
                          <b>{c.name || "Unknown member"}</b>
                          <div className="taw-muted" style={{ fontFamily: "monospace", fontSize: 11 }}>{c.memberCode || c.memberId}</div>
                        </td>
                        <td style={tdNum}>{num(c.calls)}</td>
                        <td style={tdNum}>{usd(claude)}</td>
                        <td style={tdNum}>{usd((Number(c.costUsd) || 0) - claude)}</td>
                        <td style={tdNum}><b>{usd(c.costUsd)}</b></td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{c.lastAt ? fmtDate(c.lastAt) : "—"}</td>
                      </tr>
                    );
                  })}
                </Table>
              ) : (
                <Empty icon={<Icon name="user" size={28} />}>{q ? "No customer matches." : "No customer-linked API usage in this period."}</Empty>
              )}
              {open ? <CustomerDetail customer={open} days={days} onClose={() => setOpen(null)} /> : null}
            </div>

            {data.byActor && data.byActor.length ? (
              <div>
                <h4 style={{ margin: "0 0 8px" }}>By staff member</h4>
                <Table head={["Advisor / admin", "Calls", "Cost"]} numeric={[1, 2]}>
                  {data.byActor.map((a: any) => (
                    <tr key={a.actor}>
                      <td style={td}>{a.actor}</td>
                      <td style={tdNum}>{num(a.calls)}</td>
                      <td style={tdNum}>{usd(a.costUsd)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            ) : null}

            <div>
              <h4 style={{ margin: "0 0 8px" }}>By feature</h4>
              <Table head={["Where", "API", "Feature", "Calls", "Cost"]} numeric={[3, 4]}>
                {(data.byOperation || []).map((o: any, i: number) => (
                  <tr key={i}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{SERVICE_LABEL[o.service] || o.service}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{provider(o.provider)}</td>
                    <td style={td}>
                      {o.operation || "—"}
                      {o.model ? <div className="taw-muted" style={{ fontSize: 11 }}>{o.model}</div> : null}
                    </td>
                    <td style={tdNum}>{num(o.calls)}</td>
                    <td style={tdNum}>{usd(o.costUsd)}</td>
                  </tr>
                ))}
              </Table>
            </div>

            <p className="taw-muted" style={{ fontSize: 11.5, margin: 0 }}>
              Costs are estimates from each backend&rsquo;s price list (Claude and Gemini by tokens; Google, Zyte, email and WhatsApp per call), not the providers&rsquo; invoices. Google Maps loaded in visitors&rsquo; browsers isn&rsquo;t included — check Google Cloud billing for that.
            </p>
          </>
        ) : null}
      </div>
    </Card>
  );
}
