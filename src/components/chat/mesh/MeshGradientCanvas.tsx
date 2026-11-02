"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { Gradient } from "./gradient";

// angle (radians) is optional — it drives a real diagonal tilt of the plane
// (u_vertDeform.incline = tan(angle)) on top of the shader's default
// front-to-back tilt. Omit for the library's default (0, no added tilt).
export type MeshTuning = { amp: number; freqX: number; freqY: number; angle?: number; noiseSpeed?: number; noiseFlow?: number };

// Reusable animated mesh-gradient surface (Splash, dark hero sections, …) —
// one instance per mounted canvas id. Colors and tuning are passed in by
// each caller rather than shared from one config, since each surface gets
// tweaked independently (e.g. Splash and the Home hero deliberately diverge
// over time, not stay in lockstep).
export default function MeshGradientCanvas({
  id,
  colors,
  tuning,
  className = "absolute inset-0 h-full w-full",
}: {
  id: string;
  colors: CSSProperties;
  tuning: MeshTuning;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const gradient = new Gradient();
    gradient.amp = tuning.amp;
    gradient.freqX = tuning.freqX;
    gradient.freqY = tuning.freqY;
    if (tuning.angle !== undefined) gradient.angle = tuning.angle;
    if (tuning.noiseSpeed !== undefined) gradient.noiseSpeed = tuning.noiseSpeed;
    if (tuning.noiseFlow !== undefined) gradient.noiseFlow = tuning.noiseFlow;
    gradient.initGradient(`#${id}`);
    return () => gradient.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return <canvas id={id} ref={canvasRef} className={className} style={colors} />;
}
