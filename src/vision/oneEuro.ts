/**
 * oneEuro.ts — the 1€ (One Euro) filter, implemented from scratch.
 *
 * A tiny, adaptive low-pass filter that removes jitter at low speeds while
 * staying responsive at high speeds (so quick hand moves aren't laggy).
 * Reference: Casiez, Roussel, Vogel — "1€ Filter" (CHI 2012).
 *
 * Pure and dependency-free so it's unit-testable. Time is in SECONDS.
 */

/** Simple exponential low-pass filter that also remembers its last raw input. */
export class LowPassFilter {
  private raw = 0;
  private hat = 0;
  private initialized = false;

  hasLastRawValue(): boolean {
    return this.initialized;
  }

  lastRawValue(): number {
    return this.raw;
  }

  /** alpha in [0,1]: higher = less smoothing (follows input faster). */
  filter(x: number, alpha: number): number {
    const hat = this.initialized ? alpha * x + (1 - alpha) * this.hat : x;
    this.raw = x;
    this.hat = hat;
    this.initialized = true;
    return hat;
  }

  reset(): void {
    this.initialized = false;
    this.raw = 0;
    this.hat = 0;
  }
}

export interface OneEuroParams {
  /** Baseline cutoff frequency (Hz). Lower = smoother but laggier at rest. */
  minCutoff: number;
  /** Speed coefficient. Higher = more responsive to fast motion. */
  beta: number;
  /** Cutoff for the derivative (Hz). Usually ~1.0. */
  dCutoff: number;
}

export class OneEuroFilter {
  private readonly xFilt = new LowPassFilter();
  private readonly dxFilt = new LowPassFilter();
  private lastTime: number | null = null;

  constructor(private readonly p: OneEuroParams) {}

  /** Smoothing factor for a given cutoff and time delta. */
  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /**
   * Filter one sample taken at absolute time `tSec` (seconds).
   * If timestamps don't advance, we fall back to an assumed 60 Hz step.
   */
  filter(x: number, tSec: number): number {
    let dt = 1 / 60;
    if (this.lastTime !== null && tSec > this.lastTime) dt = tSec - this.lastTime;
    this.lastTime = tSec;

    const dx = this.xFilt.hasLastRawValue()
      ? (x - this.xFilt.lastRawValue()) / dt
      : 0;
    const edx = this.dxFilt.filter(dx, this.alpha(this.p.dCutoff, dt));
    const cutoff = this.p.minCutoff + this.p.beta * Math.abs(edx);
    return this.xFilt.filter(x, this.alpha(cutoff, dt));
  }

  reset(): void {
    this.xFilt.reset();
    this.dxFilt.reset();
    this.lastTime = null;
  }
}
