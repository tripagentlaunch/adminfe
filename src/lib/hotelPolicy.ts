/* Reads Tripsure's cancellation schedule whatever shape it arrives in. The guide shows the
   structured form (cancellationRules[].rules[] with value / valueType / start / end) and a
   plain-text policy, but not the cancellation-fee or booking-details bodies, so every known
   shape is understood and anything else falls back to its own text. */

const day = (v: unknown) => {
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? String(v) : new Date(t).toLocaleDateString("en-IN", { dateStyle: "medium" });
};
const rupees = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** One entry -> sentences (an entry holding `rules` expands to one line per rule). */
export function policyLines(p: unknown): string[] {
  if (p == null || p === "") return [];
  if (typeof p === "string") return [p.trim()].filter(Boolean);
  if (typeof p !== "object") return [String(p)];
  if (Array.isArray(p)) return p.flatMap(policyLines);
  const o = p as Record<string, any>;
  if (Array.isArray(o.rules)) return o.rules.flatMap(policyLines);
  const text = o.policy || o.description || o.text || o.message;
  if (typeof text === "string" && text) return [text.trim()];
  const from = o.fromDate || o.from || o.start;
  const to = o.toDate || o.to || o.end;
  const fee = o.estimatedValue ?? o.charges ?? o.cancellationCharges ?? o.penalty ?? o.value ?? o.amount;
  const window = from && to ? `${day(from)} – ${day(to)}` : from ? `From ${day(from)}` : to ? `Until ${day(to)}` : "";
  let cost = "";
  if (fee != null && fee !== "") {
    const n = Number(fee);
    cost = !Number.isFinite(n) ? String(fee) : n === 0 ? "free cancellation" : o.valueType === "Percentage" ? `fee ${n}%` : `fee ${rupees(n)}`;
  }
  const line = [window, cost].filter(Boolean).join(" · ");
  return line ? [line] : [];
}

/** Every cancellation schedule found on a booking / quote object, de-duplicated. */
export function collectPolicies(o: unknown): string[] {
  if (!o || typeof o !== "object") return [];
  const r = o as Record<string, any>;
  const found = [r.cancellationPolicies, r.cancellationPolicy, r.cancellationRules, r.policies, r.cancellation]
    .flatMap((v) => policyLines(v));
  return found.filter((l, i) => l && found.indexOf(l) === i);
}

/** JSON for the "raw response" viewer, with personal and secret values masked. */
export function maskedJson(v: unknown): string {
  const secret = /(pan|passport|gst|email|mobile|phone|token|key|password|secret|address)/i;
  try {
    return JSON.stringify(v, (k, val) => (k && secret.test(k) && val != null && typeof val !== "object" ? "••••" : val), 2);
  } catch {
    return "";
  }
}
