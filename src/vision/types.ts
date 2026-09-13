/**
 * types.ts — shared hand data shapes, used across vision/state/modes.
 * Kept in one place to avoid import cycles.
 */

/** Physical hand (after handedness normalization + swap toggle). */
export type Handedness = "Left" | "Right";

/** In HAWA, the right hand plays melody and the left hand plays chords/drone. */
export type HandRole = "melody" | "chords";

/** A minimal 2D/3D point (matches MediaPipe's NormalizedLandmark subset). */
export interface Pt {
  x: number;
  y: number;
  z: number;
}

/** Raw detection for one hand, straight from MediaPipe (label as reported). */
export interface RawHand {
  handedness: Handedness;
  score: number;
  landmarks: Pt[];
}

/**
 * Fully processed per-frame gesture state for one hand: smoothed landmarks plus
 * derived, normalized metrics. All coordinates are in the ORIGINAL (unmirrored)
 * normalized video space; the renderer mirrors them for display.
 */
export interface HandMetrics {
  /** Physical handedness (normalized against our unmirrored input + swap). */
  handedness: Handedness;
  role: HandRole;
  score: number;
  /** Smoothed 21 landmarks. */
  landmarks: Pt[];
  /** dist(wrist, middle_mcp); the scale we normalize other distances by. */
  handSize: number;
  /** Midpoint of thumb tip + index tip (the melody control point). */
  pinchPoint: { x: number; y: number };
  /** dist(thumb_tip, index_tip) / handSize. */
  pinchDist: number;
  /** Debounced index↔thumb pinch (with hysteresis). */
  pinch: boolean;
  /** 0..5 extended fingers, debounced. */
  fingerCount: number;
  /** Thumb-to-other-finger pinches for drum mode. */
  pinchMiddle: boolean;
  pinchRing: boolean;
  pinchPinky: boolean;
  /** Normalized thumb→finger distances [index, middle, ring, pinky] for velocity. */
  pinchDistances: [number, number, number, number];
}
