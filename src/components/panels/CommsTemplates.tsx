"use client";
/* =============================================================================
 * TripAgent — src/components/panels/CommsTemplates.tsx
 * Ported from web/js/advisor.js: CommsTemplates (line ~3924). Templates
 * sub-view: catalogue ⇄ render preview.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { cx } from "../../lib/cx";
import { errText, commsChannelClass } from "../../lib/advisorHelpers";
import { Empty, Icon, Spinner } from "../ui";
import { CommsTemplatePreview } from "./CommsTemplatePreview";

export function CommsTemplates(props: any) {
  const callComms = props.callComms;

  const [rows, setRows] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    callComms({ action: "templates", limit: 100 })
      .then((res: any) => {
        const list = (res && res.templates) || [];
        setRows(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch((e: any) => {
        const msg = errText(e);
        if (/403|forbidden|not permitted|unavailable|not found|404/i.test(msg)) {
          setRows([]);
          setNotice("The template catalogue is not live yet.");
        } else {
          setErr(msg);
          setRows([]);
        }
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (selected) {
    return <CommsTemplatePreview template={selected} callComms={callComms} onBack={() => setSelected(null)} />;
  }

  const visible = rows || [];

  return (
    <div>
      <div className="taw-icrow" style={{ gap: 10, marginBottom: 12 }}>
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh templates">
          {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
        </button>
      </div>
      {err ? (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : null}
      {notice ? (
        <div className="taw-banner taw-banner--info">
          <Icon name="bell" size={16} />
          {notice}
        </div>
      ) : null}

      {loading && rows == null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="taw-skel" style={{ height: 56 }} />
          ))}
        </div>
      ) : visible.length ? (
        <div className="taw-qlist">
          {visible.map((tpl: any, i: number) => {
            const key = tpl.key || tpl.name || "tpl_" + i;
            return (
              <div
                key={key}
                className="taw-qrow"
                style={{ cursor: "pointer" }}
                onClick={() => setSelected(tpl)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    setSelected(tpl);
                  }
                }}
              >
                <div className="taw-qrow-main">
                  <div className="taw-qrow-top">
                    <span className="taw-icrow">
                      <Icon name="note" size={13} />
                      {tpl.name || tpl.key}
                    </span>
                    {tpl.channel ? <span className={cx("taw-qstate", commsChannelClass(tpl.channel))}>{String(tpl.channel)}</span> : null}
                    {tpl.status ? <span className={cx("taw-qstate", String(tpl.status).toLowerCase() === "active" ? "ok" : "muted")}>{String(tpl.status)}</span> : null}
                  </div>
                  <div className="taw-qrow-meta">
                    {tpl.category ? <span>{String(tpl.category).replace(/_/g, " ")}</span> : null}
                    {tpl.language ? <span className="taw-muted">{String(tpl.language).toUpperCase()}</span> : null}
                    {tpl.sendable === false ? <span className="taw-muted">not sendable</span> : null}
                  </div>
                </div>
                <div className="taw-qrow-actions">
                  <button
                    className="taw-btn taw-btn--ghost taw-btn--sm"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setSelected(tpl);
                    }}
                  >
                    <Icon name="compass" size={13} />
                    Preview
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon={<Icon name="note" size={28} />}>No templates in the catalogue.</Empty>
      )}
    </div>
  );
}
