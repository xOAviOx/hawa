/**
 * gestures.ts — hand metrics and gesture detection.
 *
 * The exported functions at the top are PURE (unit-tested). `GestureTracker`
 * wraps them with the small amount of per-hand state needed across frames:
 * One Euro smoothing, pinch hysteresis, and finger-count debouncing.
 *
 * All landmark coordinates are normalized ([0,1]) in the ORIGINAL (unmirrored)
 * video space. Distances are normalized by handSize so gestures work at any
 * distance from the camera.
 */

import { CONFIG, LM } from "../config";
import { OneEuroFilter } from "./oneEuro";
import type { Handedness, HandMetrics, HandRole, Pt } from "./types";

// ---- Pure math -------------------------------------------------------------

/** 2D distance (image plane). Z is noisy and not needed for our gestures. */
export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Reference size for normalization: wrist → middle-finger MCP. */
export function handSize(lm: Pt[]): number {
  const w = lm[LM.WRIST];
  const m = lm[LM.MIDDLE_MCP];
  if (!w || !m) return 0;
  // Guard against a degenerate size so we never divide by ~0.
  return Math.max(dist(w, m), 1e-4);
}

/** Normalized distance between two landmark indices (by handSize). */
export function normDistBetween(lm: Pt[], i: number, j: number, size: number): number {
  const a = lm[i];
  const b = lm[j];
  if (!a || !b) return Infinity;
  return dist(a, b) / size;
}

/** Midpoint of thumb tip + index tip — the melody control point. */
export function pinchPoint(lm: Pt[]): { x: number; y: number } {
  const t = lm[LM.THUMB_TIP];
  const i = lm[LM.INDEX_TIP];
  if (!t || !i) return { x: 0.5, y: 0.5 };
  return { x: (t.x + i.x) / 2, y: (t.y + i.y) / 2 };
}

/**
 * Per-finger extension test. Returns [thumb, index, middle, ring, pinky].
 * - Fingers: tip is farther from the wrist than the PIP joint.
 * - Thumb: tip is farther from the PINKY MCP than the thumb IP (sideways splay).
 */
export function fingerStates(lm: Pt[]): [boolean, boolean, boolean, boolean, boolean] {
  const wrist = lm[LM.WRIST];
  const pinkyMcp = lm[LM.PINKY_MCP];
  const finger = (tip: number, pip: number): boolean => {
    const t = lm[tip];
    const p = lm[pip];
    if (!wrist || !t || !p) return false;
    return dist(t, wrist) > dist(p, wrist);
  };
  const thumbTip = lm[LM.THUMB_TIP];
  const thumbIp = lm[LM.THUMB_IP];
  const thumb =
    !!pinkyMcp && !!thumbTip && !!thumbIp
      ? dist(thumbTip, pinkyMcp) > dist(thumbIp, pinkyMcp)
      : false;
  return [
    thumb,
    finger(LM.INDEX_TIP, LM.INDEX_PIP),
    finger(LM.MIDDLE_TIP, LM.MIDDLE_PIP),
    finger(LM.RING_TIP, LM.RING_PIP),
    finger(LM.PINKY_TIP, LM.PINKY_PIP),
  ];
}

/** Count of extended fingers, 0..5. */
export function countExtended(lm: Pt[]): number {
  return fingerStates(lm).reduce((n, on) => n + (on ? 1 : 0), 0);
}

/** Hysteretic on/off: ON below `onT`, OFF above `offT`, sticky in between. */
export function pinchHysteresis(prev: boolean, normDist: number, onT: number, offT: number): boolean {
  if (prev) return normDist <= offT;
  return normDist < onT;
}

/** Flip a handedness label. */
export function flipHand(h: Handedness): Handedness {
  return h === "Left" ? "Right" : "Left";
}

/**
 * Normalize MediaPipe's handedness to the PHYSICAL hand.
 *
 * MediaPipe's docs say handedness assumes a MIRRORED (selfie) image, but in
 * practice this build reports the physical hand correctly for our raw
 * (unmirrored) feed — verified on real hardware — so we trust the label as-is.
 * The `swap` toggle inverts it for setups where that doesn't hold (the
 * documented fallback; bound to the "swap hands" control / S key).
 */
export function resolvePhysicalHandedness(reported: Handedness, swap: boolean): Handedness {
  return swap ? flipHand(reported) : reported;
}

/** Role assignment: right hand plays melody, left hand plays chords/drone. */
export function roleFor(handedness: Handedness): HandRole {
  return handedness === "Right" ? "melody" : "chords";
}

// ---- Finger-count debounce (pure reducer) ----------------------------------

export interface DebounceState {
  /** The currently committed value. */
  value: number;
  /** The value we're considering switching to. */
  candidate: number;
  /** Timestamp (ms) when `candidate` first appeared. */
  since: number;
}

/**
 * Commit a new count only after it's been stable for `holdMs`. Pure: returns
 * the next state given the raw reading and current time.
 */
export function debounceCount(
  st: DebounceState,
  raw: number,
  nowMs: number,
  holdMs: number,
): DebounceState {
  if (raw === st.value) {
    // Reading matches committed value: cancel any pending change.
    return { value: st.value, candidate: st.value, since: nowMs };
  }
  if (raw !== st.candidate) {
    // New candidate appeared; start its timer.
    return { value: st.value, candidate: raw, since: nowMs };
  }
  // Same candidate as last frame: commit if it has been stable long enough.
  if (nowMs - st.since >= holdMs) {
    return { value: raw, candidate: raw, since: nowMs };
  }
  return st;
}

// ---- Stateful per-hand tracker ---------------------------------------------

/** Holds the cross-frame state for one physical hand. */
export class GestureTracker {
  // One Euro filter per coordinate (x,y,z) of each of the 21 landmarks.
  private readonly filters: OneEuroFilter[] = [];
  private readonly smoothed: Pt[] = [];

  private pinchOn = false;
  private pinchMiddleOn = false;
  private pinchRingOn = false;
  private pinchPinkyOn = false;
  private count: DebounceState = { value: 0, candidate: 0, since: 0 };

  constructor() {
    for (let i = 0; i < 21 * 3; i++) {
      this.filters.push(new OneEuroFilter(CONFIG.oneEuro));
    }
    for (let i = 0; i < 21; i++) this.smoothed.push({ x: 0, y: 0, z: 0 });
  }

  /** Clear state when the hand disappears so it re-locks cleanly on return. */
  reset(): void {
    for (const f of this.filters) f.reset();
    this.pinchOn = false;
    this.pinchMiddleOn = false;
    this.pinchRingOn = false;
    this.pinchPinkyOn = false;
    this.count = { value: 0, candidate: 0, since: 0 };
  }

  /** Smooth landmarks and compute all metrics for this frame. */
  update(
    raw: Pt[],
    tSec: number,
    nowMs: number,
    handedness: Handedness,
    score: number,
  ): HandMetrics {
    // Smooth every coordinate in place (no per-frame allocation of the array).
    for (let i = 0; i < 21; i++) {
      const r = raw[i];
      const s = this.smoothed[i]!;
      if (!r) continue;
      s.x = this.filters[i * 3]!.filter(r.x, tSec);
      s.y = this.filters[i * 3 + 1]!.filter(r.y, tSec);
      s.z = this.filters[i * 3 + 2]!.filter(r.z ?? 0, tSec);
    }

    const lm = this.smoothed;
    const size = handSize(lm);
    const g = CONFIG.gestures;

    const pinchDist = normDistBetween(lm, LM.THUMB_TIP, LM.INDEX_TIP, size);
    this.pinchOn = pinchHysteresis(this.pinchOn, pinchDist, g.pinchOn, g.pinchOff);

    const dMid = normDistBetween(lm, LM.THUMB_TIP, LM.MIDDLE_TIP, size);
    const dRing = normDistBetween(lm, LM.THUMB_TIP, LM.RING_TIP, size);
    const dPinky = normDistBetween(lm, LM.THUMB_TIP, LM.PINKY_TIP, size);
    this.pinchMiddleOn = pinchHysteresis(this.pinchMiddleOn, dMid, g.pinchOn, g.pinchOff);
    this.pinchRingOn = pinchHysteresis(this.pinchRingOn, dRing, g.pinchOn, g.pinchOff);
    this.pinchPinkyOn = pinchHysteresis(this.pinchPinkyOn, dPinky, g.pinchOn, g.pinchOff);

    this.count = debounceCount(this.count, countExtended(lm), nowMs, g.countDebounceMs);

    return {
      handedness,
      role: roleFor(handedness),
      score,
      landmarks: this.smoothed,
      handSize: size,
      pinchPoint: pinchPoint(lm),
      pinchDist,
      pinch: this.pinchOn,
      fingerCount: this.count.value,
      pinchMiddle: this.pinchMiddleOn,
      pinchRing: this.pinchRingOn,
      pinchPinky: this.pinchPinkyOn,
      pinchDistances: [pinchDist, dMid, dRing, dPinky],
    };
  }
}
