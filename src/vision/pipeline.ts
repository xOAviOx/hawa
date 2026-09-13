/**
 * pipeline.ts — turns raw detections into processed, smoothed HandMetrics and
 * publishes them into shared state.
 *
 * Handedness is normalized to the physical hand (see resolvePhysicalHandedness),
 * then each physical hand gets its own GestureTracker so One Euro smoothing and
 * hysteresis stay continuous across frames. Trackers for absent hands are reset
 * so a returning hand re-locks cleanly.
 */

import { state } from "../state";
import { GestureTracker, resolvePhysicalHandedness } from "./gestures";
import type { Handedness, HandMetrics, Pt, RawHand } from "./types";

export class HandPipeline {
  private readonly trackers = new Map<Handedness, GestureTracker>();

  private tracker(h: Handedness): GestureTracker {
    let t = this.trackers.get(h);
    if (!t) {
      t = new GestureTracker();
      this.trackers.set(h, t);
    }
    return t;
  }

  /** Process real detections (from the camera detection loop). */
  process(raw: RawHand[], tsMs: number): void {
    const tSec = tsMs / 1000;
    const out: HandMetrics[] = [];
    const seen = new Set<Handedness>();

    for (const rh of raw) {
      const physical = resolvePhysicalHandedness(rh.handedness, state.settings.swapHands);
      if (seen.has(physical)) continue; // ignore a duplicate same-hand label
      seen.add(physical);
      out.push(this.tracker(physical).update(rh.landmarks, tSec, tsMs, physical, rh.score));
    }

    // Reset trackers for hands that vanished this frame.
    for (const h of ["Left", "Right"] as Handedness[]) {
      if (!seen.has(h)) this.trackers.get(h)?.reset();
    }

    this.publish(out);
  }

  /**
   * Publish a set of already-built metrics (used by the sim, which fabricates
   * HandMetrics directly rather than going through detection + smoothing).
   */
  publish(hands: HandMetrics[]): void {
    state.hands = hands;
    state.melodyHand = hands.find((m) => m.role === "melody") ?? null;
    state.chordHand = hands.find((m) => m.role === "chords") ?? null;
  }
}

/** Build a flat 21-landmark array from a single point (used by the sim). */
export function fabricateLandmarks(cx: number, cy: number): Pt[] {
  const lm: Pt[] = [];
  for (let i = 0; i < 21; i++) lm.push({ x: cx, y: cy, z: 0 });
  return lm;
}
