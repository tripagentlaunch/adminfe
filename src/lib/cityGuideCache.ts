/* The city guide for a piece of itinerary text ("Bengaluru", "BLR → Bengaluru", a hotel's city), asked once per text. Used to
   suggest where to eat (lib/diningPlan.ts). A text the website has no page for, or a failed lookup, is remembered as "none". */
import { cityGuide } from "../services/api";
import type { DiningGuide } from "./diningPlan";

const asked = new Map<string, DiningGuide | null>();

/** The guide each text names (texts with none are left out). All eat picks are asked for, not just the first few. */
export async function guidesForTexts(texts: string[]): Promise<Map<string, DiningGuide>> {
  const todo = Array.from(new Set(texts)).filter((t) => !asked.has(t)).slice(0, 12);
  await Promise.all(todo.map((t) =>
    cityGuide(t, 20).then((r: any) => asked.set(t, (r && r.guide) || null)).catch(() => asked.set(t, null))));
  const out = new Map<string, DiningGuide>();
  texts.forEach((t) => { const g = asked.get(t); if (g) out.set(t, g); });
  return out;
}
