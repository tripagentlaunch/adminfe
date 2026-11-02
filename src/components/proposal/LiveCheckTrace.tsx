"use client";
/* Testing a proposal link (open it with ?debug=1 while signed in as an advisor): what the live
   check — and any swap or payment — asked our travel partner, and what came back, call by call.
   Comes from the server's own record (GET .../pay/flights/trace): request summary without
   passenger details, HTTP status, time, and the answer or error. Never shown to customers. */
import { useEffect, useState } from "react";
import { proposalFlightPayTrace } from "../../services/api";

type Call = { method: string; path: string; query?: any; request?: any; http?: number; ok: boolean; ms: number; response?: any; error?: string };
type Run = { what: string; at: string; outcome: string; calls: Call[] };

const pretty = (v: any) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));

export function LiveCheckTrace({ token, version, onRerun, busy }: { token: string; version: string; onRerun: () => void; busy: boolean }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    proposalFlightPayTrace(token)
      .then((r: any) => { if (live) { setRuns(r.runs || []); setErr(null); } })
      .catch((e: any) => { if (live) setErr(e?.status === 401 ? "Sign in to the admin console in this browser to see the live check details." : String(e?.message || e)); });
    return () => { live = false; };
  }, [token, version]);
  return (
    <div className="pv-trace">
      <div className="pv-trace-head">
        <b>Live check details</b>
        <span>testing only — not shown to customers</span>
        <button type="button" className="pv-linkbtn" onClick={onRerun} disabled={busy}>{busy ? "Checking…" : "Run the live check again"}</button>
      </div>
      {err ? <div className="pv-trace-err">{err}</div> : null}
      {runs && !runs.length ? <div className="pv-trace-sub">No live check recorded on this server yet.</div> : null}
      {(runs || []).map((run, i) => (
        <details key={run.at + i} className="pv-trace-run" open={i === 0}>
          <summary>
            <span className={/^HTTP|Error|error/.test(run.outcome) ? "bad" : "good"}>{run.what}</span>
            {" · "}{new Date(run.at).toLocaleTimeString("en-GB")}{" · "}{run.outcome}{" · "}{run.calls.length} call{run.calls.length === 1 ? "" : "s"}
          </summary>
          {run.calls.map((c, j) => (
            <details key={j} className={"pv-trace-call" + (c.ok ? "" : " is-bad")}>
              <summary>
                <code>{c.method} {c.path}</code> · {c.http ?? "no answer"} · {c.ms} ms {c.ok ? "✓" : "✕"}
                {c.error ? <span className="pv-trace-errline"> — {c.error}</span> : null}
              </summary>
              {c.query ? <><div className="pv-trace-label">Query</div><pre>{pretty(c.query)}</pre></> : null}
              {c.request != null ? <><div className="pv-trace-label">Sent</div><pre>{pretty(c.request)}</pre></> : null}
              {c.response != null ? <><div className="pv-trace-label">Answer</div><pre>{pretty(c.response)}</pre></> : null}
            </details>
          ))}
        </details>
      ))}
    </div>
  );
}
