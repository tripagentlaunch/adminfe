// Type shim for the vendored gradient.js (Stripe/Kevin Hufnagl mesh gradient).
// Its public API is assigned dynamically inside the constructor, so
// TypeScript can't infer it — declared here instead of editing the
// vendored script further.
export declare class Gradient {
  height: number;
  amp: number;
  freqX: number;
  freqY: number;
  angle: number;
  noiseSpeed: number;
  noiseFlow: number;
  initGradient(selector: string): this;
  disconnect(): void;
  pause(): void;
  play(): void;
}
