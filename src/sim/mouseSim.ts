/**
 * mouseSim.ts — camera-free testing via ?sim=1.
 *
 * Mouse = right-hand pinch point, mouse button = pinch, number keys 0–5 =
 * left-hand finger count (for chords in Phase 3). Fabricates HandMetrics
 * directly and publishes them through the same pipeline the camera uses, so the
 * whole app is testable without a webcam.
 */

import { fabricateLandmarks, HandPipeline } from "../vision/pipeline";
import type { HandMetrics } from "../vision/types";

export class MouseSim {
  // Pointer position in DISPLAY (mirrored) space, normalized 0..1.
  private mx = 0.5;
  private my = 0.5;
  private down = false;
  private leftCount = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly pipeline: HandPipeline,
  ) {
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("pointerdown", (e) => {
      this.onMove(e);
      this.down = true;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener("pointerup", () => (this.down = false));
    window.addEventListener("keydown", (e) => {
      if (e.key >= "0" && e.key <= "5") this.leftCount = Number(e.key);
    });
  }

  private onMove(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.mx = (e.clientX - r.left) / Math.max(1, r.width);
    this.my = (e.clientY - r.top) / Math.max(1, r.height);
  }

  /** Build synthetic hands and publish. Call once per render frame. */
  update(): void {
    // Display space is mirrored; convert to raw (unmirrored) normalized coords.
    const rawX = 1 - this.mx;
    const rawY = this.my;

    const hands: HandMetrics[] = [
      {
        handedness: "Right",
        role: "melody",
        score: 1,
        landmarks: fabricateLandmarks(rawX, rawY),
        handSize: 0.2,
        pinchPoint: { x: rawX, y: rawY },
        pinchDist: this.down ? 0.12 : 0.5,
        pinch: this.down,
        fingerCount: this.down ? 1 : 5,
        pinchMiddle: false,
        pinchRing: false,
        pinchPinky: false,
        pinchDistances: [this.down ? 0.12 : 0.5, 0.5, 0.5, 0.5],
      },
    ];

    if (this.leftCount > 0) {
      // Park the left hand on the (display) left = raw x ~0.8.
      const lx = 0.8;
      const ly = 0.5;
      hands.push({
        handedness: "Left",
        role: "chords",
        score: 1,
        landmarks: fabricateLandmarks(lx, ly),
        handSize: 0.2,
        pinchPoint: { x: lx, y: ly },
        pinchDist: 0.5,
        pinch: false,
        fingerCount: this.leftCount,
        pinchMiddle: false,
        pinchRing: false,
        pinchPinky: false,
        pinchDistances: [0.5, 0.5, 0.5, 0.5],
      });
    }

    this.pipeline.publish(hands);
  }
}

/** True when the app was opened with ?sim=1. */
export function simEnabled(): boolean {
  return new URLSearchParams(location.search).get("sim") === "1";
}
