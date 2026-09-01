/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev-only "N" indicator overlaps the AccountMenu pinned to the bottom of
  // the new sidebar (ShellChrome) — moved out of the way. Never shows in prod.
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
