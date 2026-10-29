"use client";
/* The advisor's notification bell (left rail, above the account menu): who is talking to Tara right now,
   on the website or WhatsApp. Polls every 10s; a customer is "unread" until the advisor opens them (or marks
   all read). A new chat also pops a toast, and a desktop notification when the tab is in the background and
   the advisor allowed them. Click a customer to open their Conversation. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./ui";
import { getChatNotifications } from "../services/api";
import { client as supabaseClient } from "../services/auth";
import { toast } from "../lib/advisorHelpers";
import { relTime } from "../lib/relTime";

// Live: chatbot-be adds a row to public.desk_chat_events for every new customer message
// (adminbe db/154) and this listens to it with Supabase Realtime, so a new chat refreshes the
// bell at once. As a backup it also checks every 6 hours and whenever the bell is opened. The
// last answer is kept in the browser, so reloads and other tabs within 6 hours don't call again.
const POLL_MS = 6 * 3600 * 1000;
const OPEN_FRESH_MS = 60 * 1000;          // opening the bell re-checks at most once a minute
const LAST_KEY = "ta-bell-last";          // { at, items } of the last good check
const WINDOW_MS = 24 * 3600 * 1000;      // chats from the last day
const NEW_CHAT_GAP_MS = 30 * 60 * 1000;  // silence this long, then a message, is "started chatting"
const ONLINE_MS = 5 * 60 * 1000;         // wrote within 5 minutes: "chatting now"
const READ_KEY = "ta.notif.read.v1";

type Item = { code: string; name: string; channel: string; text: string; at: number; first_at: number; count: number };

function loadRead(): { all: number; by: Record<string, number> } {
  try {
    const v = JSON.parse(window.localStorage.getItem(READ_KEY) || "null");
    if (v && typeof v === "object") return { all: Number(v.all) || 0, by: v.by && typeof v.by === "object" ? v.by : {} };
  } catch { /* storage blocked: nothing read yet */ }
  return { all: 0, by: {} };
}
function saveRead(r: { all: number; by: Record<string, number> }) {
  try { window.localStorage.setItem(READ_KEY, JSON.stringify(r)); } catch { /* not critical */ }
}

const channelLabel = (c: string) => (c === "whatsapp" ? "WhatsApp" : "Website");

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [read, setRead] = useState<{ all: number; by: Record<string, number> }>({ all: 0, by: {} });
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [perm, setPerm] = useState<string>("unsupported");
  const seen = useRef<Record<string, number> | null>(null); // code -> newest message time known (null until the first poll)
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRead(loadRead());
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
  }, []);

  const isUnread = useCallback((it: Item) => it.at > Math.max(read.all, read.by[it.code] || 0), [read]);

  const pollRef = useRef<(force?: boolean) => void>(() => undefined);

  useEffect(() => {
    let cancelled = false;
    const lastAt = () => { try { return Number(JSON.parse(localStorage.getItem(LAST_KEY) || "{}").at) || 0; } catch { return 0; } };
    // Show the last check's answer straight away (no call) when it is recent enough.
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_KEY) || "null");
      if (saved && Date.now() - saved.at < POLL_MS && Array.isArray(saved.items)) {
        setNow(saved.at);
        setItems(saved.items);
        seen.current = Object.fromEntries(saved.items.map((it: Item) => [it.code, it.at]));
      }
    } catch { /* storage blocked: the first check fills the bell */ }
    async function poll(force = false) {
      if (!force && Date.now() - lastAt() < POLL_MS) return; // checked recently (in this or another tab)
      if (document.hidden && seen.current) return; // a background tab: wait until it is back (the first poll always runs)
      const t = Date.now();
      const r: any = await getChatNotifications(t - WINDOW_MS);
      if (cancelled) return;
      if (r.unavailable) return; // chatbot-be did not answer: keep what is shown, and treat the next good answer as the first
      const list: Item[] = (r.items || []).slice().sort((a: Item, b: Item) => b.at - a.at);
      setNow(t);
      setItems(list);
      try { localStorage.setItem(LAST_KEY, JSON.stringify({ at: t, items: list })); } catch { /* not kept: next load checks again */ }
      const prev = seen.current;
      const next: Record<string, number> = {};
      for (const it of list) next[it.code] = it.at;
      seen.current = next;
      if (!prev) return; // first poll: just the badge, no alerts for what was already there
      const mine = loadRead();
      for (const it of list) {
        const before = prev[it.code];
        if (before !== undefined && it.at <= before) continue;
        if (it.at <= Math.max(mine.all, mine.by[it.code] || 0)) continue; // already read
        const started = before === undefined || it.at - before >= NEW_CHAT_GAP_MS;
        const title = it.name + (started ? " started chatting" : " sent a new message") + " on " + channelLabel(it.channel);
        toast(title + (it.text ? ': "' + it.text.slice(0, 80) + '"' : ""), "info");
        try {
          if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(title, { body: it.text.slice(0, 120), tag: "ta-chat-" + it.code });
          }
        } catch { /* notifications blocked: the toast and badge still show */ }
      }
    }
    pollRef.current = (force?: boolean) => { void poll(force); };
    void poll();
    const t = setInterval(() => { void poll(); }, POLL_MS);

    // Live updates: one refresh per burst of new messages (a customer typing several lines
    // quickly is one check). In a background tab it waits and catches up when shown again.
    let missed = false;
    let burst: ReturnType<typeof setTimeout> | null = null;
    const onEvent = () => {
      if (document.hidden) { missed = true; return; }
      if (burst) clearTimeout(burst);
      burst = setTimeout(() => { burst = null; void poll(true); }, 1500);
    };
    const sb: any = supabaseClient();
    const live = sb
      ? sb.channel("desk-chat-events")
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "desk_chat_events" }, onEvent)
          .subscribe()
      : null;

    const onVisible = () => {
      if (document.hidden) return;
      if (missed) { missed = false; void poll(true); } else void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(t);
      if (burst) clearTimeout(burst);
      if (live) sb.removeChannel(live);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const unread = items.filter(isUnread);

  function openChat(it: Item) {
    const next = { ...read, by: { ...read.by, [it.code]: it.at } };
    setRead(next); saveRead(next); setOpen(false);
    router.push("/console/conversation?code=" + encodeURIComponent(it.code));
    // Already on the Conversation tab: it listens for this and switches customer.
    window.dispatchEvent(new CustomEvent("ta:open-conversation", { detail: it.code }));
  }
  function markAllRead() {
    const next = { all: Date.now(), by: read.by };
    setRead(next); saveRead(next);
  }
  function enableDesktop() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((p) => setPerm(p)).catch(() => {});
  }

  return (
    <div className="ta-bell" ref={box}>
      <button
        type="button"
        className={"ta-bell-btn" + (unread.length ? " has-unread" : "")}
        onClick={() => {
          if (!open) {
            // Opening the bell: a fresh check, unless one ran in the last minute.
            let last = 0;
            try { last = Number(JSON.parse(localStorage.getItem(LAST_KEY) || "{}").at) || 0; } catch { /* no record: check */ }
            if (Date.now() - last > OPEN_FRESH_MS) pollRef.current(true);
          }
          setOpen((v) => !v);
          setNow(Date.now());
        }}
        aria-label={unread.length ? unread.length + " customers chatting with Tara" : "Notifications"}
        aria-expanded={open}
        title="Customers chatting with Tara"
      >
        <Icon name="bell" size={18} />
        {unread.length ? <span className="ta-bell-badge">{unread.length > 9 ? "9+" : unread.length}</span> : null}
      </button>
      {open ? (
        <div className="ta-bell-pop" role="dialog" aria-label="Customers chatting with Tara">
          <div className="ta-bell-head">
            <strong>Customers chatting</strong>
            {unread.length ? <button type="button" onClick={markAllRead}>Mark all read</button> : null}
          </div>
          <div className="ta-bell-list">
            {items.length === 0 ? <div className="ta-bell-empty">No customer messages in the last 24 hours.</div> : null}
            {items.map((it) => {
              const live = now - it.at <= ONLINE_MS;
              return (
                <button key={it.code} type="button" className={"ta-bell-item" + (isUnread(it) ? " is-unread" : "")} onClick={() => openChat(it)}>
                  <span className="ta-bell-ava">{(it.name || "?").trim().charAt(0).toUpperCase()}</span>
                  <span className="ta-bell-main">
                    <span className="ta-bell-top">
                      <span className="ta-bell-name">{it.name}</span>
                      <span className={"ta-bell-chan ch-" + it.channel}>{channelLabel(it.channel)}</span>
                    </span>
                    <span className="ta-bell-text">{it.text || "…"}</span>
                    <span className="ta-bell-meta">
                      {live ? <span className="ta-bell-live">● Chatting now</span> : relTime(it.at, now)}
                      {it.count > 1 ? " · " + it.count + " messages" : ""}
                    </span>
                  </span>
                  {isUnread(it) ? <span className="ta-bell-dot" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
          {perm === "default" ? (
            <button type="button" className="ta-bell-desktop" onClick={enableDesktop}>Turn on desktop alerts for new chats</button>
          ) : perm === "denied" ? (
            <div className="ta-bell-note">Desktop alerts are blocked in this browser.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
