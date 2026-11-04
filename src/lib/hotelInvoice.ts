/* Turns whatever Tripsure sends for a hotel tax invoice into something an advisor can read and print.
   The guide says "Download Tax Invoice" but not what the body looks like, so every shape is handled:
   a base64 PDF, an HTML document, a link, or plain structured data (shown as sections and tables). */

export type InvoiceRow = { label: string; value: string };
export type InvoiceTable = { columns: string[]; rows: string[][] };
export type InvoiceSection = { title: string; rows: InvoiceRow[]; tables: { title: string; table: InvoiceTable }[] };

const MONEY = /(amount|total|fare|tax|gst|cgst|sgst|igst|cess|charge|rate|price|discount|fee|payable|paid|balance)/i;

export function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\b(gst|cgst|sgst|igst|utgst|pan|id|gstin|hsn|sac)\b/gi, (m) => m.toUpperCase())
    .replace(/^./, (c) => c.toUpperCase());
}

/** A presigned storage link carries its own login (X-Amz-Signature): never print it on a page or a PDF. */
const isSignedLink = (s: string) => /X-Amz-(Signature|Credential|Security-Token)=/i.test(s);

export function fmtValue(key: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string" && isSignedLink(v)) return "Temporary download link (hidden)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return MONEY.test(key) ? "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(v);
  if (typeof v === "string") {
    if (MONEY.test(key) && /^-?\d+(\.\d+)?$/.test(v.trim())) return "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
    if (/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(v) && !Number.isNaN(Date.parse(v))) {
      return new Date(v).toLocaleDateString("en-IN", { dateStyle: "medium" });
    }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => fmtValue(key, x)).join(", ");
  return JSON.stringify(v);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** First string anywhere in the data that satisfies `test`. */
function deepFind(v: unknown, test: (s: string, key: string) => boolean, key = "", depth = 0): string | null {
  if (depth > 6 || v == null) return null;
  if (typeof v === "string") return test(v, key) ? v : null;
  if (Array.isArray(v)) { for (const x of v) { const f = deepFind(x, test, key, depth + 1); if (f) return f; } return null; }
  if (isObj(v)) { for (const [k, x] of Object.entries(v)) { const f = deepFind(x, test, k, depth + 1); if (f) return f; } }
  return null;
}

export function findPdfBase64(data: unknown): string | null {
  return deepFind(data, (s) => /^(data:application\/pdf;base64,)?JVBERi/.test(s.slice(0, 40)));
}
export function findHtml(data: unknown): string | null {
  return deepFind(data, (s) => s.length > 80 && /<(html|table|body|div)[\s>]/i.test(s));
}
export function findLink(data: unknown): string | null {
  return deepFind(data, (s) => /^https?:\/\//i.test(s.trim()) && !/\s/.test(s.trim()));
}

/** A temporary storage link in the answer that has no web address in front of it, so it can't be opened as is. */
export function findHostlessLink(data: unknown): string | null {
  return deepFind(data, (s) => s.trim().startsWith("/") && !s.trim().startsWith("//") && isSignedLink(s));
}

export function pdfBlob(b64: string): Blob {
  const raw = b64.replace(/^data:application\/pdf;base64,/, "");
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}

function tableOf(arr: Record<string, unknown>[]): InvoiceTable {
  const cols: string[] = [];
  for (const r of arr) for (const k of Object.keys(r)) if (!cols.includes(k) && !isObj(r[k]) && !Array.isArray(r[k])) cols.push(k);
  return { columns: cols.map(humanize), rows: arr.map((r) => cols.map((c) => fmtValue(c, r[c]))) };
}

/** Structured data -> a "Details" section plus one section per nested object / table per list. */
export function toSections(data: unknown): InvoiceSection[] {
  let root: unknown = data;
  if (isObj(root) && isObj(root.response)) root = root.response;
  if (isObj(root) && isObj(root.invoice) && Object.keys(root).length <= 2) root = root.invoice;
  if (!isObj(root)) return [{ title: "Invoice", rows: [{ label: "Invoice", value: fmtValue("", root) }], tables: [] }];

  const build = (title: string, o: Record<string, unknown>, depth: number): InvoiceSection[] => {
    const sec: InvoiceSection = { title, rows: [], tables: [] };
    const nested: InvoiceSection[] = [];
    for (const [k, v] of Object.entries(o)) {
      if (v == null || v === "") continue;
      if (Array.isArray(v) && v.length && v.every(isObj)) sec.tables.push({ title: humanize(k), table: tableOf(v as Record<string, unknown>[]) });
      else if (isObj(v) && depth < 3) nested.push(...build(humanize(k), v, depth + 1));
      else sec.rows.push({ label: humanize(k), value: fmtValue(k, v) });
    }
    return [sec, ...nested].filter((s) => s.rows.length || s.tables.length);
  };
  return build("Invoice details", root, 0);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A self-contained printable page: the browser's Print dialog saves it as a PDF. */
export function printableHtml(title: string, sub: string, sections: InvoiceSection[]): string {
  const body = sections.map((s) => `
    <h2>${esc(s.title)}</h2>
    ${s.rows.length ? `<table class="kv">${s.rows.map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(r.value)}</td></tr>`).join("")}</table>` : ""}
    ${s.tables.map((t) => `<h3>${esc(t.title)}</h3><table class="grid"><thead><tr>${t.table.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${t.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`).join("")}`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:13px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1a17;margin:32px;}
    h1{font-size:20px;margin:0 0 2px}.sub{color:#6b6459;margin-bottom:18px}
    h2{font-size:14px;margin:20px 0 6px;padding-bottom:4px;border-bottom:1px solid #d9d2c5}h3{font-size:13px;margin:14px 0 6px}
    table{border-collapse:collapse;width:100%}.kv th{width:34%;text-align:left;font-weight:500;color:#6b6459;padding:4px 8px 4px 0;vertical-align:top}
    .kv td{padding:4px 0;font-weight:600}.grid th,.grid td{border:1px solid #d9d2c5;padding:5px 8px;text-align:left}.grid th{background:#f4efe6;font-weight:600}
  </style></head><body><h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div>${body}</body></html>`;
}
