/**
 * drone.ts — tanpura-style drone for raag scales.
 *
 * Plays a slow plucked cycle of Sa and Pa (root + fifth) using a Karplus-Strong
 * PluckSynth, so it sounds like a real tanpura without any samples. The cycle
 * runs on the Transport (started by the audio engine). Hand height sets volume;
 * a fist fades it out.
 */

import * as Tone from "tone";
import { CONFIG } from "../config";
import { midiToFreq } from "./scales";

export class Drone {
  private readonly gain: Tone.Gain;
  private readonly pluck: Tone.PluckSynth;
  private loop: Tone.Loop | null = null;
  private cycle: number[] = [220];
  private idx = 0;
  private rootPc = -1;
  private readonly octaveBase: number;

  constructor(dst: Tone.InputNode) {
    this.octaveBase = CONFIG.audio.baseOctave + CONFIG.audio.drone.octaveOffset;
    this.gain = new Tone.Gain(0).connect(dst);
    this.pluck = new Tone.PluckSynth({
      attackNoise: 1,
      dampening: 3000,
      resonance: 0.95,
      volume: CONFIG.audio.drone.volume,
    }).connect(this.gain);
  }

  /** Set the drone root (pitch class). Cycle = Pa, Sa, Sa, Sa (tanpura-like). */
  setRoot(pc: number): void {
    if (pc === this.rootPc) return;
    this.rootPc = pc;
    const saMidi = (this.octaveBase + 1) * 12 + (pc % 12);
    const sa = midiToFreq(saMidi);
    const pa = midiToFreq(saMidi + 7); // perfect fifth
    this.cycle = [pa, sa, sa, sa];
  }

  /** Begin the plucked cycle (idempotent). Requires the Transport to be running. */
  start(): void {
    if (this.loop) return;
    this.loop = new Tone.Loop((time) => {
      const f = this.cycle[this.idx % this.cycle.length] ?? 220;
      this.pluck.triggerAttack(f, time);
      this.idx++;
    }, CONFIG.audio.drone.note).start(0);
  }

  /** 0..1 volume from hand height (0 = silent). */
  setVolume(v: number): void {
    this.gain.gain.rampTo(Math.max(0, Math.min(1, v)), 0.2);
  }

  dispose(): void {
    this.loop?.dispose();
    this.pluck.dispose();
    this.gain.dispose();
  }
}
