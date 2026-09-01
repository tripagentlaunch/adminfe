import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TripAgent Advisor Workbench",
  description: "TripAgent — invite-only HNI travel concierge advisor desk.",
};

// Root layout — just the html/body shell + metadata. Type comes entirely
// from tokens.css's --serif/--eyebrow/--sans (IBM Plex Serif/Sans
// Condensed/Sans, loaded via styles.css's @import) — no next/font here.
// The scaffold's original Geist/Geist Mono next/font loading was removed:
// it downloaded two font families that no CSS rule in this app ever
// referenced (the whole design system routes through the three tokens
// above), so it was pure dead weight, not an actual second type system.
//
// The AdvisorLoginGate wrapping (App.jsx's <AdvisorLoginGate render={...} />)
// lives one level down, in app/(authenticated)/layout.tsx — see that
// file's docblock for why it moved: /join needs to render OUTSIDE the gate,
// and a root layout can't selectively skip itself for one child route.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
