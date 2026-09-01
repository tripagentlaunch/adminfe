import { redirect } from "next/navigation";

// Root "/" -> "/orders" — was "/workbench" until 2026-08-31, when that
// route (Queue/Itinerary Builder/Traveller Profile/Summary) moved to
// console/queue/page.tsx (Enquiries' "Console" tab). Advisor Workbench's
// own default landing is now its first remaining tab, Orders Board.
export default function RootPage() {
  redirect("/orders");
}
