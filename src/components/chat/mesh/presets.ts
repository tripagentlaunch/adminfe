import type { CSSProperties } from "react";
import type { MeshTuning } from "./MeshGradientCanvas";

// Dark navy hero (HDFC Life page heroes)
export const DARK_HERO_COLORS = {
  "--gradient-color-1": "#0E2C73",
  "--gradient-color-2": "#123E8F",
  "--gradient-color-3": "#1749A6",
  "--gradient-color-4": "#1E59C2",
} as CSSProperties;
export const DARK_HERO_TUNING: MeshTuning = { amp: 190.575, freqX: 17.26725e-5, freqY: 35.86275e-5, noiseFlow: 12, noiseSpeed: 20 };

// Light splash screen
export const SPLASH_COLORS = {
  "--gradient-color-1": "#F5F9FF",
  "--gradient-color-2": "#CDDEFE",
  "--gradient-color-3": "#EBF2FF",
  "--gradient-color-4": "#C2D7FF",
} as CSSProperties;
export const SPLASH_TUNING: MeshTuning = { amp: 198, freqX: 18.4e-5, freqY: 35.65e-5, noiseFlow: 12, noiseSpeed: 20 };

// Tara's chat — mostly dark, with a few large, soft glows: a warm orange-brown
// and a blue-grey, joined by a dark warm bridge so they pass through it rather
// than blending into mud. Both glows are held low in value; the field is meant
// to sit behind the type, not compete with it. Low frequency keeps the shapes
// big and slow instead of striped.
export const TARA_COLORS = {
  "--gradient-color-1": "#080605",
  "--gradient-color-2": "#9A5A30",
  "--gradient-color-3": "#1E1615",
  "--gradient-color-4": "#53667A",
} as CSSProperties;
export const TARA_TUNING: MeshTuning = { amp: 150, freqX: 9e-5, freqY: 16e-5, noiseFlow: 8, noiseSpeed: 10 };
