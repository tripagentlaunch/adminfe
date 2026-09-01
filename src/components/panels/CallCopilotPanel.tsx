"use client";
/* =============================================================================
 * TripAgent — src/components/panels/CallCopilotPanel.tsx
 * Ported from web/js/copilot.js's TA_COPILOT.View — browser mic capture (Web
 * Speech API) + manual-entry fallback, client-side buffer/debounce, real
 * FastAPI call-assist backend (callAssistRun -> POST /call-assist) instead of
 * the legacy anon-key edge function, and the Share action wired to the real
 * FastAPI enquiries endpoint (enquiryCreate -> POST /enquiries).
 *
 * The consent toggle is preserved exactly as the legacy UI's hard gate: the
 * mic never starts without it, a mic-denied/no-mic error flips it back off
 * and degrades to the manual textarea, and nothing leaves the browser except
 * the transcript delta sent to call-assist and (only on an explicit advisor
 * tap) the Share message sent to enquiries. No raw audio is ever captured;
 * Web Speech does ASR in-browser and only stabilized text leaves, transiently.
 *
 * Built from this panel family's existing primitives (Card/Empty/Icon/
 * Spinner, taw-* / rfq-* classes) rather than porting copilot.js's bespoke
 * injected `tac-*` CSS block — same choice TrendingDealsPanel.jsx already
 * made over its own legacy pulse.js CSS.
 * ===========================================================================*/
import { useCallback, useEffect, useRef, useState } from "react";
import { callAssistRun, enquiryCreate, members, inr } from "../../services/api";
import { errText, toast } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner } from "../ui";

// ===========================================================================
// STT ADAPTER — one interface, swappable engines, manual fallback always.
// Ported verbatim from copilot.js: pure browser-API glue, no backend
// dependency, so it moves over unchanged from the vanilla-JS original.
// ===========================================================================

function getSpeechRecognition(): any {
  return typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null : null;
}

function webSpeechSupported() {
  return !!getSpeechRecognition();
}

function makeEmitter() {
  const cbs: any = { partial: null, final: null, error: null, state: null };
  return {
    onPartial: (cb: any) => { cbs.partial = cb; },
    onFinal: (cb: any) => { cbs.final = cb; },
    onError: (cb: any) => { cbs.error = cb; },
    onStateChange: (cb: any) => { cbs.state = cb; },
    emitPartial: (t: any) => { if (cbs.partial) try { cbs.partial(t); } catch (e) { /* noop */ } },
    emitFinal: (t: any) => { if (cbs.final && t && t.trim()) try { cbs.final(t.trim()); } catch (e) { /* noop */ } },
    emitError: (o: any) => { if (cbs.error) try { cbs.error(o); } catch (e) { /* noop */ } },
    emitState: (s: any) => { if (cbs.state) try { cbs.state(s); } catch (e) { /* noop */ } },
  };
}

function makeWebSpeechAdapter(opts: any) {
  opts = opts || {};
  const em = makeEmitter();
  const SR = getSpeechRecognition();
  let rec: any = null;
  let wantOn = false;
  let running = false;

  function build() {
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = opts.lang || "en-IN";
    r.maxAlternatives = 1;

    r.onresult = (ev: any) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const txt = res[0] && res[0].transcript ? res[0].transcript : "";
        if (res.isFinal) em.emitFinal(txt);
        else interim += txt;
      }
      em.emitPartial(interim);
    };

    r.onstart = () => { running = true; em.emitState("listening"); };

    r.onerror = (ev: any) => {
      const code = (ev && ev.error) || "unknown";
      if (code === "no-speech" || code === "aborted") return;
      if (code === "not-allowed" || code === "service-not-allowed") {
        wantOn = false;
        em.emitError({ code: "not-allowed", message: "Microphone permission was denied." });
        em.emitState("error");
        return;
      }
      if (code === "audio-capture") {
        wantOn = false;
        em.emitError({ code: "audio-capture", message: "No microphone was found." });
        em.emitState("error");
        return;
      }
      if (code === "network") {
        em.emitError({ code: "network", message: "Speech service network error." });
        return;
      }
      em.emitError({ code: "network", message: "Speech recognition error: " + code });
    };

    r.onend = () => {
      running = false;
      if (wantOn) {
        try { r.start(); } catch (e) {
          setTimeout(() => { if (wantOn && !running) try { r.start(); } catch (e2) { /* noop */ } }, 350);
        }
      } else {
        em.emitState("idle");
      }
    };

    return r;
  }

  return {
    mode: "webspeech",
    isSupported: () => !!SR,
    onPartial: em.onPartial,
    onFinal: em.onFinal,
    onError: em.onError,
    onStateChange: em.onStateChange,
    start: () => {
      if (!SR) { em.emitError({ code: "unsupported", message: "Web Speech API unavailable." }); return; }
      wantOn = true;
      if (!rec) rec = build();
      if (!running) try { rec.start(); } catch (e) { /* already starting */ }
    },
    stop: () => {
      wantOn = false;
      if (rec) try { rec.stop(); } catch (e) { /* noop */ }
      em.emitPartial("");
      em.emitState("idle");
    },
  };
}

// ManualAdapter — no mic at all: the advisor types/pastes what the customer
// said. The downstream pipeline is identical; it doesn't care about source.
function makeManualAdapter() {
  const em = makeEmitter();
  let listening = false;
  return {
    mode: "manual",
    isSupported: () => true,
    onPartial: em.onPartial,
    onFinal: em.onFinal,
    onError: em.onError,
    onStateChange: em.onStateChange,
    start: () => { listening = true; em.emitState("listening"); },
    stop: () => { listening = false; em.emitPartial(""); em.emitState("idle"); },
    submit: (text: any) => { if (listening) em.emitFinal(text); },
  };
}

function makeSTT(opts: any) {
  opts = opts || {};
  if (opts.force === "manual") return makeManualAdapter();
  if (webSpeechSupported()) return makeWebSpeechAdapter(opts);
  return makeManualAdapter();
}

// ===========================================================================
// CLIENT BUFFER / DEBOUNCE — onFinal segments -> callAssistRun(). Ported
// verbatim from copilot.js: fire on ~250 chars / 2 utterances OR a 4s pause,
// hard floor of 6s between calls. Only the delta since the last call is
// sent, plus a short context tail for coreference.
// ===========================================================================
const BUF = { CHAR_TRIGGER: 250, UTTER_TRIGGER: 2, PAUSE_MS: 4000, FLOOR_MS: 6000, CONTEXT_TAIL: 160 };

function lastSentenceTail(s: any, max: any) {
  if (!s) return "";
  const t = s.slice(-max * 2);
  const m = t.match(/[^.!?]*[.!?]?\s*$/);
  const tail = m ? m[0] : t;
  return tail.slice(-max).trim();
}

function makeBuffer(cfg: any) {
  cfg = cfg || {};
  const onFlush = cfg.onFlush || (() => Promise.resolve());
  let pendingSegs: any[] = [];
  let priorTail = "";
  let lastSentAt = 0;
  let pauseTimer: any = null;
  let inFlight = false;
  let disposed = false;

  function pendingText() { return pendingSegs.join(" ").trim(); }
  function clearPause() { if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; } }

  function flush() {
    if (disposed || inFlight) return;
    const chunk = pendingText();
    if (!chunk) return;
    const now = Date.now();
    if (now - lastSentAt < BUF.FLOOR_MS) {
      clearPause();
      pauseTimer = setTimeout(flush, BUF.FLOOR_MS - (now - lastSentAt));
      return;
    }
    clearPause();
    const context = priorTail;
    pendingSegs = [];
    priorTail = lastSentenceTail(chunk, BUF.CONTEXT_TAIL);
    lastSentAt = now;
    inFlight = true;
    Promise.resolve()
      .then(() => onFlush({ chunk, context }))
      .catch(() => { /* surfaced by caller's onFlush */ })
      .then(() => {
        inFlight = false;
        if (disposed) return;
        if (pendingText()) { clearPause(); pauseTimer = setTimeout(flush, BUF.PAUSE_MS); }
      });
  }

  return {
    isInFlight: () => inFlight,
    push: (segment: any) => {
      if (disposed || !segment || !segment.trim()) return;
      pendingSegs.push(segment.trim());
      clearPause();
      if (pendingText().length >= BUF.CHAR_TRIGGER || pendingSegs.length >= BUF.UTTER_TRIGGER) flush();
      else pauseTimer = setTimeout(flush, BUF.PAUSE_MS);
    },
    reset: () => { clearPause(); pendingSegs = []; priorTail = ""; lastSentAt = 0; },
    dispose: () => { disposed = true; clearPause(); pendingSegs = []; },
  };
}

// ===========================================================================
// Card rendering — the backend's cards are already pre-screened (guard_output)
// and pre-ranked; this just renders them, matching SupplierBroadcastPanel's/
// TrendingDealsPanel's existing bid/deal card treatment.
// ===========================================================================
const TYPE_LABEL: any = { kb: "Knowledge", deal: "Deal", destination: "Trending" };

function cardKey(c: any, i: any) {
  return (c && c.type ? c.type : "x") + ":" + (c && (c.id != null ? c.id : i));
}

function SuggestionCard({ card, state, onShare, disabled, style }: any) {
  const meta = card.meta || {};
  const label = TYPE_LABEL[card.type] || (card.type ? card.type.toUpperCase() : "Content");
  const shareLabel = state === "sharing" ? "Sharing…" : state === "shared" ? "Shared" : "Share with member";

  return (
    <div className="rfq-bid" style={style}>
      <div className="rfq-bid-h">
        <div>
          <div className="taw-muted" style={{ fontSize: "11px", textTransform: "uppercase" }}>{label}</div>
          <div className="rfq-bid-name">{card.title}</div>
        </div>
        {meta.price_from != null ? <div className="rfq-bid-price">{inr(meta.price_from)}</div> : null}
      </div>
      {card.snippet ? <p className="taw-muted" style={{ fontSize: "12.5px" }}>{card.snippet}</p> : null}
      {meta.discount_pct ? (
        <span className="taw-qbadge" style={{ marginBottom: "8px" }}>{meta.discount_pct}% off</span>
      ) : null}
      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
        <button
          className={"taw-btn taw-btn--sm" + (state === "shared" ? " taw-btn--ghost" : " taw-btn--primary")}
          disabled={disabled || state === "sharing" || state === "shared"}
          onClick={onShare}
        >
          {state === "sharing" ? <Spinner /> : <Icon name={state === "shared" ? "check" : "send"} size={13} />} {shareLabel}
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// THE PANEL
// ===========================================================================
export function CallCopilotPanel(props: any) {
  void props;
  const [memberList, setMemberList] = useState<any>([]);
  const [memberId, setMemberId] = useState("");

  const [consent, setConsent] = useState(false);
  const [listenState, setListenState] = useState("idle"); // 'idle'|'listening'|'error'
  const [micErr, setMicErr] = useState<any>(null);

  const [segments, setSegments] = useState<any>([]);
  const [interim, setInterim] = useState("");

  const [cards, setCards] = useState<any>([]);
  const [topic, setTopic] = useState("");
  const [thinking, setThinking] = useState(false);
  const [shares, setShares] = useState<any>({});

  const [manualText, setManualText] = useState("");

  const sttRef = useRef<any>(null);
  const bufRef = useRef<any>(null);
  const transcriptElRef = useRef<any>(null);
  const manualDebounceRef = useRef<any>(null);

  const supportRef = useRef(webSpeechSupported());
  const supported = supportRef.current;

  // --- load members for the picker ----------------------------------------
  useEffect(() => {
    let alive = true;
    members("select=id,name&order=name.asc&limit=100")
      .then((rows: any) => {
        if (!alive || !Array.isArray(rows)) return;
        setMemberList(rows);
      })
      .catch(() => { /* picker simply stays empty */ });
    return () => { alive = false; };
  }, []);

  // --- the backend pipeline call -------------------------------------------
  const runAssist = useCallback((payload: any) => {
    setThinking(true);
    return callAssistRun({ chunk: payload.chunk, context: payload.context || "", member_id: memberId || null })
      .then((res: any) => {
        res = res || {};
        const incoming = Array.isArray(res.cards) ? res.cards : [];
        if (res.topic_summary) setTopic(res.topic_summary);
        if (incoming.length) {
          setCards((prev: any) => {
            const seen: any = {};
            const merged: any[] = [];
            incoming.concat(prev).forEach((c: any, i: any) => {
              if (!c) return;
              const k = cardKey(c, i);
              if (seen[k]) return;
              seen[k] = true;
              merged.push(c);
            });
            return merged.slice(0, 6);
          });
        }
      })
      .catch((e: any) => {
        // never throw into the live call — a slow/failed chunk is silent.
        console.warn("[copilot] call-assist failed:", errText(e));
      })
      .then(() => setThinking(false));
  }, [memberId]);

  // --- wire the STT adapter + buffer once ----------------------------------
  useEffect(() => {
    const stt = makeSTT({ lang: "en-IN" });
    sttRef.current = stt;
    const buf = makeBuffer({ onFlush: (p: any) => runAssist(p) });
    bufRef.current = buf;

    stt.onPartial((t: any) => setInterim(t || ""));
    stt.onFinal((t: any) => {
      setInterim("");
      setSegments((prev: any) => prev.concat([t]));
      buf.push(t);
    });
    stt.onStateChange((s: any) => setListenState(s));
    stt.onError((o: any) => {
      if (o && (o.code === "not-allowed" || o.code === "audio-capture")) {
        setMicErr(o);
        setConsent(false);
        try { stt.stop(); } catch (e) { /* noop */ }
        if (bufRef.current) bufRef.current.reset();
        supportRef.current = false;
      }
    });

    return () => {
      try { stt.stop(); } catch (e) { /* noop */ }
      if (buf) buf.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runAssist]);

  // --- consent gate: the ONLY thing that starts/stops the mic --------------
  useEffect(() => {
    const stt = sttRef.current;
    if (!stt) return;
    if (consent) {
      setMicErr(null);
      try { stt.start(); } catch (e) { /* noop */ }
    } else {
      try { stt.stop(); } catch (e) { /* noop */ }
      if (bufRef.current) bufRef.current.reset();
      setInterim("");
      setThinking(false);
    }
  }, [consent]);

  // --- auto-scroll the transcript ------------------------------------------
  useEffect(() => {
    const el = transcriptElRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [segments, interim]);

  // --- manual submit (Enter or 1.5s debounce) -------------------------------
  function submitManual(text: any) {
    const t = (text || "").trim();
    if (!t) return;
    const stt = sttRef.current;
    setSegments((prev: any) => prev.concat([t]));
    if (stt && typeof stt.submit === "function") stt.submit(t);
    else if (bufRef.current) bufRef.current.push(t);
    setManualText("");
  }

  function onManualChange(ev: any) {
    const v = ev.target.value;
    setManualText(v);
    if (manualDebounceRef.current) clearTimeout(manualDebounceRef.current);
    manualDebounceRef.current = setTimeout(() => {
      const cur = (v || "").trim();
      if (cur.length >= 8) submitManual(cur);
    }, 1500);
  }

  function onManualKeyDown(ev: any) {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      if (manualDebounceRef.current) clearTimeout(manualDebounceRef.current);
      submitManual(ev.target.value);
    }
  }

  // --- share action (advisor-gated — the ONLY way anything leaves) ---------
  function onShare(card: any, key: any) {
    if (!memberId) { toast("Select the member you're on a call with first.", "warn"); return; }
    if (shares[key] === "sharing" || shares[key] === "shared") return;
    setShares((p: any) => ({ ...p, [key]: "sharing" }));

    const sp = card.share || {};
    const message = sp.message || "Sharing with you: " + (card.title || "a suggestion") + (card.snippet ? " — " + card.snippet : "");

    enquiryCreate({ member_id: memberId, channel: "advisor", message, intent: sp.intent || {} })
      .then(() => {
        setShares((p: any) => ({ ...p, [key]: "shared" }));
        toast("Shared — it's in the member's enquiry rail.", "success");
      })
      .catch((e: any) => {
        setShares((p: any) => { const n = { ...p }; delete n[key]; return n; });
        toast("Couldn't share: " + errText(e), "danger");
      });
  }

  const isListening = consent && listenState === "listening";
  const hasContent = cards.length > 0;
  const memberPicked = !!memberId;

  return (
    <div className="rfq-panel">
      <div className="rfq-panel-head">
        <div>
          <h2>Call Copilot</h2>
          <p className="taw-muted">
            While you're on a call, Copilot listens with consent, hears what your customer needs, and
            surfaces content you can share in one tap. Nothing leaves until you choose to share it.
          </p>
        </div>
      </div>

      <Card title="On this call" sub="Consent is required before Copilot listens">
        <div className="taw-row" style={{ marginBottom: "13px" }}>
          <label className="taw-muted" style={{ fontSize: "11px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
            On a call with
          </label>
          <select className="taw-select" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">{memberList.length ? "Select member…" : "No members loaded"}</option>
            {memberList.map((m: any) => (
              <option key={String(m.id)} value={String(m.id)}>{m.name || "Member " + m.id}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            className={"taw-btn taw-btn--sm" + (consent ? " taw-btn--primary" : " taw-btn--ghost")}
            onClick={() => {
              if (!memberPicked) { toast("Select the member you're on a call with first.", "warn"); return; }
              setConsent((v) => !v);
            }}
          >
            <Icon name="shield" size={13} /> {consent ? "Customer consented — assist is on" : "Toggle on: customer consented to AI assist"}
          </button>
          {isListening ? (
            <span className="taw-qbadge" style={{ color: "var(--danger-ink, #a33)" }}>● Listening</span>
          ) : consent ? (
            <span className="taw-muted" style={{ fontSize: "12px" }}><Spinner /> Warming up the line…</span>
          ) : null}
        </div>

        {micErr ? (
          <div className="taw-banner taw-banner--err" style={{ marginTop: "10px" }}>
            <Icon name="alert" size={14} />
            <span>{micErr.message} Use the manual entry below to keep assisting.</span>
          </div>
        ) : null}
      </Card>

      <div className="taw-row-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "start", marginTop: "16px" }}>
        <Card title="Live transcript" sub={segments.length ? segments.length + " segments" : ""}>
          {!consent ? (
            <Empty icon="shield" title="Consent required" message="Toggle “Customer consented to AI assist” to begin live assist." />
          ) : !supported || (micErr && (micErr.code === "not-allowed" || micErr.code === "audio-capture")) ? (
            <div>
              {segments.length ? (
                <div ref={transcriptElRef} style={{ maxHeight: 280, overflowY: "auto", marginBottom: "10px" }}>
                  {segments.map((s: any, i: number) => <div key={"m" + i} style={{ fontSize: "13px", marginBottom: "6px" }}>{s}</div>)}
                </div>
              ) : null}
              <textarea
                className="taw-input"
                style={{ minHeight: 96, width: "100%", resize: "vertical" }}
                value={manualText}
                onChange={onManualChange}
                onKeyDown={onManualKeyDown}
                placeholder="Type what the customer said…"
              />
              <p className="taw-muted" style={{ fontSize: "11px", marginTop: "6px" }}>
                Press Enter to capture a line. Speech capture isn't available in this browser — manual entry
                feeds the same suggestions.
              </p>
            </div>
          ) : !segments.length && !interim ? (
            <Empty icon="chat" title="Listening" message="Listening for what your customer needs…" />
          ) : (
            <div ref={transcriptElRef} style={{ maxHeight: 400, overflowY: "auto" }}>
              {segments.map((s: any, i: number) => <div key={"s" + i} style={{ fontSize: "13px", marginBottom: "6px" }}>{s}</div>)}
              {interim ? <div style={{ fontSize: "13px", fontStyle: "italic", color: "var(--muted, #888)" }}>{interim}</div> : null}
            </div>
          )}
        </Card>

        <Card title="Suggested to share" sub={topic || (hasContent ? cards.length + " cards" : "")}>
          {!consent ? (
            <Empty icon="sparkle" title="Suggestions appear here" message="Once consent is on, relevant content to share will surface as your customer speaks." />
          ) : !hasContent && !thinking ? (
            <Empty icon="search" title="Listening for needs" message="As the conversation develops, ranked content you can share will appear here." />
          ) : (
            <div className="rfq-board taw-stagger">
              {thinking ? <div className="taw-muted" style={{ fontSize: "12px" }}><Spinner /> Thinking…</div> : null}
              {cards.map((c: any, i: number) => {
                const k = cardKey(c, i);
                return (
                  <SuggestionCard
                    key={k}
                    card={c}
                    state={shares[k] || "idle"}
                    disabled={!memberPicked}
                    onShare={() => onShare(c, k)}
                    style={{ "--i": i }}
                  />
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <p className="taw-muted" style={{ fontSize: "11px", marginTop: "14px" }}>
        <Icon name="shield" size={12} /> No audio is recorded. The transcript stays in this browser and
        clears when you leave this tab. Only what you explicitly share is saved to the member's enquiry rail.
      </p>
    </div>
  );
}
