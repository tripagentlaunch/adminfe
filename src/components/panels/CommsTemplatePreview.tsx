"use client";
/* =============================================================================
 * TripAgent — src/components/panels/CommsTemplatePreview.tsx
 * Ported from web/js/advisor.js: CommsTemplatePreview (line ~3998). Template
 * render preview: vars form + rendered output (read-only).
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { cx } from "../../lib/cx";
import { errText, commsChannelClass } from "../../lib/advisorHelpers";
import { Field, Icon, Spinner } from "../ui";

export function CommsTemplatePreview(props: any) {
  const template = props.template || {};
  const callComms = props.callComms;
  const onBack = props.onBack || (() => {});

  const tplKey = template.key || template.name;
  const declared = Array.isArray(template.variables) ? template.variables : [];

  const [vars, setVars] = useState<any>({});
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<any>(null);

  function setVar(k: string, v: any) {
    setVars((o: any) => ({ ...o, [k]: v }));
  }

  const render = useCallback(() => {
    setLoading(true);
    setErr(null);
    const payload: any = { action: "render", variables: vars };
    if (tplKey) payload.template_key = tplKey;
    else if (template.kind) payload.kind = template.kind;
    if (template.channel) payload.channel = template.channel;
    if (template.language) payload.locale = template.language;
    callComms(payload)
      .then((res: any) => {
        setData(res || {});
        setLoading(false);
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplKey, vars]);

  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplKey]);

  const missing = (data && data.missing_variables) || [];

  return (
    <div>
      <div className="taw-icrow" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={onBack} aria-label="Back to templates">
          <Icon name="chevron" size={14} style={{ transform: "rotate(90deg)" }} />
          Templates
        </button>
        <span className="taw-icrow">
          <Icon name="note" size={13} />
          {template.name || tplKey}
        </span>
        {template.channel ? <span className={cx("taw-qstate", commsChannelClass(template.channel))}>{String(template.channel)}</span> : null}
      </div>

      {declared.length ? (
        <div style={{ marginBottom: 14 }}>
          <div className="taw-muted" style={{ marginBottom: 8 }}>
            Variables
          </div>
          <div className="taw-grid taw-cols-2">
            {declared.map((v: any) => {
              const name = typeof v === "string" ? v : v.name || v.key;
              return (
                <Field key={name} label={name} htmlFor={"taw-tplvar-" + name}>
                  <input className="taw-input" value={vars[name] || ""} placeholder={name} onChange={(e) => setVar(name, e.target.value)} />
                </Field>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="taw-icrow" style={{ gap: 10, marginBottom: 12 }}>
        <button className="taw-btn taw-btn--accent taw-btn--sm" onClick={render} disabled={loading}>
          {loading ? <Spinner /> : <Icon name="refresh" size={13} />}
          Preview
        </button>
      </div>

      {err ? (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : null}

      {missing.length ? (
        <div className="taw-banner taw-banner--info">
          <Icon name="bell" size={16} />
          Missing variables: {missing.join(", ")}
        </div>
      ) : null}
      {data && data.sendable_out_of_window ? (
        <div className="taw-banner taw-banner--info">
          <Icon name="clock" size={16} />
          This would send outside the member's quiet hours / sending window.
        </div>
      ) : null}

      {data ? (
        <div className="taw-card" style={{ marginTop: 4 }}>
          <div className="taw-card-b">
            <div className="taw-icrow" style={{ gap: 8, marginBottom: 8 }}>
              <span className={cx("taw-qstate", data.complete ? "ok" : "warn")}>{data.complete ? "complete" : "incomplete"}</span>
              <span className="taw-muted" style={{ fontSize: 11 }}>
                Preview only — sending is not available here.
              </span>
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 13 }}>{data.rendered || ""}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
