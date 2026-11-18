/* Turns anything an API call can throw into a plain string that is safe to
   render. FastAPI's 422 `detail` is an array of {type, loc, msg, input}; React
   crashes if that object reaches JSX, so every error display goes through here. */
export function detailToText(detail: unknown): string {
  if (detail == null || detail === "") return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (d && typeof d === "object" && "msg" in (d as any)) {
          const loc = Array.isArray((d as any).loc) ? (d as any).loc.filter((x: any) => x !== "body").join(".") : "";
          return (loc ? loc + ": " : "") + String((d as any).msg);
        }
        return detailToText(d);
      })
      .filter(Boolean)
      .join("; ");
  }
  if (typeof detail === "object") {
    const o = detail as any;
    if (typeof o.msg === "string") return o.msg;
    if (typeof o.message === "string") return o.message;
    if (o.detail != null) return detailToText(o.detail);
    try { return JSON.stringify(detail); } catch { return "Request failed."; }
  }
  return String(detail);
}

const HTML_HINT = /<!doctype|<html|<head|<body|<!--\[if|<\/?(?:div|p|h1|title|center|span)\b/i;

/** A supplier's whole HTML error page ("502 Bad gateway") sometimes rides inside an upstream message. Shown raw it is a
 *  wall of markup: keep what a person can use (who failed, with what status) and say it is usually temporary.
 *  Text with no markup in it is returned unchanged. */
export function readableError(text: string): string {
  const hit = HTML_HINT.exec(text);
  if (!hit) return text;
  const head = text.slice(0, hit.index).replace(/^[\s:\-—]+|[\s:\-—]+$/g, "");
  const found = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text);
  const page = found ? found[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const note = `the supplier's server answered with an error page${page ? ` (${page})` : ""} — this is usually temporary, so try again in a minute`;
  return head ? `${head}: ${note}` : note.charAt(0).toUpperCase() + note.slice(1);
}

export function errText(e: unknown, fallback = "Something went wrong."): string {
  if (e == null) return fallback;
  if (typeof e === "string") return readableError(e) || fallback;
  const any = e as any;
  return readableError(detailToText(any.message) || detailToText(any.detail) || detailToText(any.body && any.body.detail) || fallback);
}
