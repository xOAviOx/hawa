/**
 * theremin.ts — Mode 2: THEREMIN.
 *
 * Right-hand height = continuous pitch (exponential, ~3 octaves) with a gentle
 * vibrato; sound is on while the right hand is open (≥ openFingers) and silent
 * on a fist. Left-hand height = volume. A snap-to-scale amount (0 = free,
 * 1 = fully quantized) blends the free pitch toward the nearest in-scale note.
 */

import * as Tone from "tone";
import { CONFIG } from "../config";
import { state } from "../state";
import { AudioEngine } from "../audio/engine";
import { midiToFreq, snapMidiToScale } from "../audio/scales";
import type { Mode } from "./mode";

export class ThereminMode implements Mode {
  private readonly synth: Tone.Synth;
  private readonly vibrato: Tone.Vibrato;
  private readonly gain: Tone.Gain;
  private playing = false;

  constructor(private readonly engine: AudioEngine) {
    const t = CONFIG.theremin;
    this.gain = new Tone.Gain(0).connect(this.engine.output);
    this.vibrato = new Tone.Vibrato(t.vibratoRate, t.vibratoDepth).connect(this.gain);
    this.synth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.06, decay: 0, sustain: 1, release: 0.25 },
      portamento: t.glide,
      volume: t.volume,
    }).connect(this.vibrato);
  }

  enter(): void {
    this.engine.setCutoff(CONFIG.audio.filter.max); // open the master filter
  }

  exit(): void {
    this.stop();
    state.aurora.targetIntensity = 0;
  }

  update(): void {
    const t = CONFIG.theremin;
    const right = state.melodyHand;
    const left = state.chordHand;
    const open = !!right && right.fingerCount >= t.openFingers;

    if (!right || !open) {
      this.stop();
      state.aurora.targetIntensity = 0;
      return;
    }

    // Height → pitch (exponential). Top of frame = highest.
    const h = Math.max(0, Math.min(1, 1 - right.pinchPoint.y));
    const free = t.baseFreq * Math.pow(2, h * t.octaves);

    // Blend toward the nearest in-scale note (in log space) by the snap amount.
    const midiFloat = 69 + 12 * Math.log2(free / 440);
    const snappedFreq = midiToFreq(snapMidiToScale(midiFloat, state.settings.key, state.settings.scale));
    const snap = state.settings.thereminSnap;
    const freq = Math.exp((1 - snap) * Math.log(free) + snap * Math.log(snappedFreq));

    const now = Tone.now();
    if (!this.playing) {
      this.synth.triggerAttack(freq, now);
      this.playing = true;
    } else {
      this.synth.frequency.rampTo(freq, t.glide);
    }

    // Left height → volume (defaults to a healthy level if there's no left hand).
    const vol = left ? Math.max(0, Math.min(1, 1 - left.pinchPoint.y)) : 0.7;
    this.gain.gain.rampTo(vol, 0.05);

    // Aurora tint follows the pitch class.
    const pc = ((Math.round(midiFloat) % 12) + 12) % 12;
    state.aurora.targetHue = (pc / 12) * 360;
    state.aurora.targetIntensity = (0.35 + vol * 0.5) * CONFIG.aurora.maxIntensity;
  }

  private stop(): void {
    if (this.playing) {
      this.synth.triggerRelease(Tone.now());
      this.playing = false;
    }
    this.gain.gain.rampTo(0, 0.1);
  }

  dispose(): void {
    this.synth.dispose();
    this.vibrato.dispose();
    this.gain.dispose();
  }
}
