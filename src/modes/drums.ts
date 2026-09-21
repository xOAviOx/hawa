/**
 * drums.ts — Mode 3: AIR DRUMS.
 *
 * Thumb touching a finger triggers a drum. Right hand: index=kick, middle=snare,
 * ring=closed hat, pinky=clap. Left hand: index=low tom, middle=high tom,
 * ring=open hat, pinky=rimshot. Velocity comes from how fast the fingertip was
 * closing toward the thumb over the last few frames.
 */

import { CONFIG, LM } from "../config";
import { state } from "../state";
import { AudioEngine } from "../audio/engine";
import { DrumKit, type DrumName } from "../audio/drums";
import type { Mode } from "./mode";
import type { Handedness } from "../vision/types";

// finger order used everywhere below: [index, middle, ring, pinky]
const RIGHT_MAP: DrumName[] = ["kick", "snare", "hatClosed", "clap"];
const LEFT_MAP: DrumName[] = ["lowTom", "highTom", "hatOpen", "rimshot"];
const TIP_INDEX = [LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP];
const HUES = [0, 40, 190, 300]; // per finger, for the shockwave color

interface FingerState {
  on: boolean;
  lastDist: number;
  lastTime: number;
  speed: number; // recent closing speed (normalized units / s)
}

function newHand(): FingerState[] {
  return Array.from({ length: 4 }, () => ({ on: false, lastDist: 0.5, lastTime: 0, speed: 0 }));
}

export class DrumsMode implements Mode {
  private readonly kit: DrumKit;
  private readonly hands: Record<Handedness, FingerState[]> = {
    Right: newHand(),
    Left: newHand(),
  };

  constructor(private readonly engine: AudioEngine) {
    this.kit = new DrumKit(this.engine.output);
  }

  enter(): void {
    this.engine.setCutoff(CONFIG.audio.filter.max);
  }

  exit(): void {
    state.aurora.targetIntensity = 0;
  }

  update(): void {
    const now = performance.now();
    for (const hand of state.hands) {
      const map = hand.handedness === "Right" ? RIGHT_MAP : LEFT_MAP;
      const states = this.hands[hand.handedness];
      const pinches = [hand.pinch, hand.pinchMiddle, hand.pinchRing, hand.pinchPinky];

      for (let i = 0; i < 4; i++) {
        const fs = states[i]!;
        const dist = hand.pinchDistances[i as 0 | 1 | 2 | 3];

        // Estimate closing speed (positive when the gap shrinks), with decay so
        // a fast approach still counts at the moment of contact.
        const dt = fs.lastTime ? (now - fs.lastTime) / 1000 : 0;
        const inst = dt > 0 ? (fs.lastDist - dist) / dt : 0;
        fs.speed = Math.max(inst, fs.speed * 0.6);
        fs.lastDist = dist;
        fs.lastTime = now;

        const on = pinches[i]!;
        if (on && !fs.on) {
          const vel =
            CONFIG.drums.velMin +
            (CONFIG.drums.velMax - CONFIG.drums.velMin) *
              Math.max(0, Math.min(1, fs.speed / CONFIG.drums.velFullSpeed));
          this.kit.trigger(map[i]!, vel);
          state.audioEvents.push({ type: "drum", name: map[i]!, vel });
          this.emitShockwave(hand.landmarks[TIP_INDEX[i]!], vel, HUES[i]!);
        }
        fs.on = on;
      }
    }
  }

  private emitShockwave(tip: { x: number; y: number } | undefined, velocity: number, hue: number): void {
    if (!tip) return;
    state.events.push({ type: "drum", nx: tip.x, ny: tip.y, velocity, hue });
  }

  dispose(): void {
    this.kit.dispose();
  }
}
