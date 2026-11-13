// Small pure helpers for the Itinerary Builder's city guide panel (components/panels/CityGuidePanel.tsx).
export type Pick = { name: string; area?: string | null; tier?: string | null; credentials?: string[]; description?: string | null };

/** The cities an itinerary is about: its destination, listed cities, each stay's city and each day's route. */
export function itineraryCityTexts(data: any): string[] {
  const out: string[] = [];
  const add = (v: any) => { if (typeof v === "string" && v.trim() && v.trim().length <= 160) out.push(v.trim()); };
  add(data && data.destination);
  ((data && data.cities) || []).forEach(add);
  ((data && data.days) || []).forEach((d: any) => {
    add(d.city);
    add(d.route);
    (d.items || []).forEach((it: any) => { if (it.type === "hotel") { add(it.city); add(it.sub); } });
  });
  return Array.from(new Set(out));
}

/** "A restful base. More words." -> "A restful base." */
export const firstSentence = (s?: string | null): string => {
  const t = String(s || "").trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  return (m ? m[1] : t).slice(0, 220);
};

/** What goes into a day's description for a pick: "Quay (Circular Quay): Peter Gilmore's signature tasting menu." */
export const pickLine = (p: Pick): string => `${p.name}${p.area ? " (" + p.area + ")" : ""}${p.description ? ": " + firstSentence(p.description) : "."}`;

