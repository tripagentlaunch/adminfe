/* A stand-in picture for a restaurant whose photo can't be shown (the customer site's photo server refuses it, Google's quota is used up,
   the restaurant has no photo). An inline SVG, so it needs no network; the same name always gets the same colours, like the website's own
   placeholders (Customerfe src/lib/placeholderPhoto.ts), with a fork and knife on it. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function eatPlaceholder(seed: string, width = 900, height = 600): string {
  const hue = hashString(seed || "restaurant") % 360;
  const c1 = `hsl(${hue},32%,34%)`;
  const c2 = `hsl(${(hue + 24) % 360},34%,54%)`;
  const cx = width / 2, cy = height / 2, u = Math.min(width, height) / 10;
  // a fork (left) and a knife (right), drawn with strokes
  const icon =
    `<g stroke="rgba(255,255,255,.72)" stroke-width="${u * 0.22}" stroke-linecap="round" fill="none">` +
    `<path d="M${cx - u * 1.6} ${cy - u * 2} v${u * 1.6} a${u * 0.6} ${u * 0.6} 0 0 0 ${u * 1.2} 0 v${-u * 1.6}"/>` +
    `<path d="M${cx - u} ${cy - u * 2} v${u * 4.2}"/>` +
    `<path d="M${cx + u * 1.3} ${cy + u * 2.2} v${-u * 4.2} c${u * 1.2} ${u * 0.4} ${u * 1.2} ${u * 2.4} 0 ${u * 2.8}"/>` +
    `</g>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#g)"/>${icon}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
