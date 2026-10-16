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

export function errText(e: unknown, fallback = "Something went wrong."): string {
  if (e == null) return fallback;
  if (typeof e === "string") return e || fallback;
  const any = e as any;
  return detailToText(any.message) || detailToText(any.detail) || detailToText(any.body && any.body.detail) || fallback;
}
