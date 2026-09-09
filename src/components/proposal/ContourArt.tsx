/* =============================================================================
 * TripAgent — src/components/proposal/ContourArt.tsx
 * Decorative topographic-contour motif reused across the Proposal PDF
 * (cover background + stay thumbnails in the sample template). This is a
 * generated stand-in, not real photography — there's no per-destination
 * image data source in the app yet, and "decorative reusable motif" was
 * the explicit scope call for MVP rather than requiring real photos.
 * A seeded pseudo-random keeps rings reproducible (same look every
 * render) rather than jittering on every export.
 * ===========================================================================*/
import { Svg, Ellipse } from "@react-pdf/renderer";

function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function ContourArt({
  width,
  height,
  stroke,
  strokeOpacity = 1,
  seed = 7,
}: {
  width: number;
  height: number;
  stroke: string;
  strokeOpacity?: number;
  seed?: number;
}) {
  const rand = seededRand(seed);
  const cx = width / 2 + (rand() - 0.5) * width * 0.15;
  const cy = height / 2 + (rand() - 0.5) * height * 0.15;
  const rings = 16;
  const maxR = Math.max(width, height) * 0.62;

  const items = [];
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    const rx = maxR * t * (0.55 + rand() * 0.15);
    const ry = maxR * t * (0.32 + rand() * 0.1);
    items.push(
      <Ellipse
        key={i}
        cx={cx + (rand() - 0.5) * 14}
        cy={cy + (rand() - 0.5) * 10}
        rx={rx}
        ry={ry}
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeWidth={0.6}
        fill="none"
      />
    );
  }

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {items}
    </Svg>
  );
}
