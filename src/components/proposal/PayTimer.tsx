"use client";
/* Countdown to the end of the customer's payment window (server's `pay_by`).
   Calls onExpire once when it reaches zero. */
import { useEffect, useRef, useState } from "react";

export const secondsLeft = (payBy?: string | null) => (payBy ? Math.max(0, Math.floor((new Date(payBy).getTime() - Date.now()) / 1000)) : null);

export function PayTimer({ payBy, onExpire }: { payBy?: string | null; onExpire: () => void }) {
  const [left, setLeft] = useState<number | null>(() => secondsLeft(payBy));
  const fired = useRef(false);
  useEffect(() => {
    fired.current = false;
    setLeft(secondsLeft(payBy));
    const t = setInterval(() => setLeft(secondsLeft(payBy)), 1000);
    return () => clearInterval(t);
  }, [payBy]);
  useEffect(() => {
    if (left === 0 && !fired.current) { fired.current = true; onExpire(); }
  }, [left, onExpire]);
  if (left == null) return null;
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 12, fontSize: 13, background: left < 120 ? "#fdecea" : "#eef4ff", color: left < 120 ? "#a3261a" : "#1d3d7a" }}>
      Your room is held for <b>{mm}:{ss}</b>. Complete payment before the time runs out or the booking is released.
    </div>
  );
}
