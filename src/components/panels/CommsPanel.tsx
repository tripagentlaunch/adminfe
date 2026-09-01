"use client";
/* =============================================================================
 * TripAgent — src/components/panels/CommsPanel.tsx
 * Ported from web/js/advisor.js: CommsPanel (line ~3602). The advisor-side
 * surface for the always-on communications spine. Three sub-views, all
 * READ / PREVIEW only (the panel itself never sends, prices, or books —
 * CommsThread's reply composer is the one live write, via comms-orchestrate):
 *   Inbox     — comms-read 'inbox' (advisor-scoped) → threads; click a row to
 *               open the transcript.
 *   Templates — comms-read 'templates' catalogue; click a template to preview
 *               it ('render').
 *   Delivery  — comms-read 'delivery_status' for an order id (or the selected
 *               member) → the outbox table.
 * ===========================================================================*/
import { useState } from "react";
import { commsRead, call as apiCall } from "../../services/api";
import { cx } from "../../lib/cx";
import { Card, Icon } from "../ui";
import { CommsInbox } from "./CommsInbox";
import { CommsTemplates } from "./CommsTemplates";
import { CommsDelivery } from "./CommsDelivery";

export function CommsPanel(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;
  const member = props.member || null;
  const membersById = props.membersById || {};

  const [sub, setSub] = useState("inbox"); // sub-view: inbox | templates | delivery

  // Transport — prefer the thin wrapper, else the generic function transport
  // (the MyDayPanel/DisruptionQueue pattern). comms-read is authoritative on
  // scope; the client only reads.
  function callComms(payload: any) {
    if (typeof commsRead === "function") return commsRead(payload);
    if (typeof apiCall === "function") return apiCall("comms-read", payload);
    return Promise.reject(new Error("comms-read transport unavailable"));
  }

  function SubBtn(key: string, label: string, icon: string) {
    return (
      <button key={key} className={cx("taw-desk-tab", sub === key && "is-active")} role="tab" aria-selected={sub === key ? "true" : "false"} onClick={() => setSub(key)}>
        <Icon name={icon} size={15} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div className="taw-queue taw-fade-in">
      <Card title="Communications" icon={<Icon name="inbox" size={18} />} sub={member ? "member · " + member.name : "advisor inbox"}>
        <div style={{ padding: 16 }}>
          <div className="taw-desk-tabs" role="tablist" aria-label="Communications view" style={{ marginBottom: 14 }}>
            {SubBtn("inbox", "Inbox", "inbox")}
            {SubBtn("templates", "Templates", "note")}
            {SubBtn("delivery", "Delivery", "shield")}
          </div>
          {sub === "inbox" ? <CommsInbox advisorId={advisorId} membersById={membersById} callComms={callComms} /> : null}
          {sub === "templates" ? <CommsTemplates callComms={callComms} /> : null}
          {sub === "delivery" ? <CommsDelivery member={member} callComms={callComms} /> : null}
        </div>
      </Card>
    </div>
  );
}
