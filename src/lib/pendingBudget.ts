/* A budget typed on the "Start this itinerary" screen, before the itinerary exists. It waits here, by enquiry,
   until the Itinerary Builder opens for that enquiry and takes it onto the itinerary. */
import type { Budget } from "./tripBudget";

const waiting = new Map<string, Budget>();

export function setPendingBudget(enquiryId: string, b: Budget | null) {
  if (!enquiryId) return;
  if (b) waiting.set(enquiryId, b); else waiting.delete(enquiryId);
}
export function takePendingBudget(enquiryId: string): Budget | null {
  const b = waiting.get(enquiryId) || null;
  waiting.delete(enquiryId);
  return b;
}
