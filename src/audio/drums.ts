/**
 * drums.ts — fully synthesized drum kit (no samples).
 *
 * Right hand: index=kick, middle=snare, ring=closed hat, pinky=clap.
 * Left hand:  index=low tom, middle=high tom, ring=open hat, pinky=rimshot.
 * Built from MembraneSynth / NoiseSynth / MetalSynth (+ filters). Each hit is
 * triggered live at Tone.now() with a velocity supplied by the caller.
 */

import * as Tone from "tone";
import { CONFIG } from "../config";

export type DrumName =
  | "kick"
  | "snare"
  | "hatClosed"
  | "clap"
  | "lowTom"
  | "highTom"
  | "hatOpen"
  | "rimshot";

export class DrumKit {
  private readonly out: Tone.Gain;
  private readonly kick: Tone.MembraneSynth;
  private readonly lowTom: Tone.MembraneSynth;
  private readonly highTom: Tone.MembraneSynth;
  private readonly snare: Tone.NoiseSynth;
  private readonly clap: Tone.NoiseSynth;
  private readonly hatClosed: Tone.MetalSynth;
  private readonly hatOpen: Tone.MetalSynth;
  private readonly rimshot: Tone.MetalSynth;

  constructor(dst: Tone.InputNode) {
    this.out = new Tone.Gain(Tone.dbToGain(CONFIG.drums.volume)).connect(dst);

    this.kick = new Tone.MembraneSynth({
      octaves: 6,
      pitchDecay: 0.05,
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.0, release: 0.2 },
    }).connect(this.out);

    this.lowTom = new Tone.MembraneSynth({
      octaves: 4,
      pitchDecay: 0.08,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 },
    }).connect(this.out);

    this.highTom = new Tone.MembraneSynth({
      octaves: 4,
      pitchDecay: 0.06,
      envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.15 },
    }).connect(this.out);

    // Snare = filtered white noise (bright, snappy).
    const snareHp = new Tone.Filter(1200, "highpass").connect(this.out);
    this.snare = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.14, sustain: 0 },
    }).connect(snareHp);

    // Clap = band-passed noise with a slightly longer tail.
    const clapBp = new Tone.Filter({ type: "bandpass", frequency: 1500, Q: 1.2 }).connect(this.out);
    this.clap = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.002, decay: 0.2, sustain: 0 },
    }).connect(clapBp);

    // Hats = metallic, high-passed. Closed = short, open = long.
    const hatHp = new Tone.Filter(6000, "highpass").connect(this.out);
    this.hatClosed = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.05, release: 0.02 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
      volume: -14,
    }).connect(hatHp);
    this.hatOpen = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.4, release: 0.2 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
      volume: -16,
    }).connect(hatHp);

    // Rimshot = very short metallic click.
    this.rimshot = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.03, release: 0.02 },
      harmonicity: 8,
      modulationIndex: 20,
      resonance: 3000,
      octaves: 1,
      volume: -12,
    }).connect(this.out);
  }

  /** Trigger a drum with velocity 0..1 at the current time. */
  trigger(name: DrumName, velocity: number): void {
    const t = Tone.now();
    const v = Math.max(0, Math.min(1, velocity));
    switch (name) {
      case "kick":
        this.kick.triggerAttackRelease("C1", "8n", t, v);
        break;
      case "lowTom":
        this.lowTom.triggerAttackRelease("G1", "8n", t, v);
        break;
      case "highTom":
        this.highTom.triggerAttackRelease("C2", "8n", t, v);
        break;
      case "snare":
        this.snare.triggerAttackRelease("16n", t, v);
        break;
      case "clap":
        this.clap.triggerAttackRelease("8n", t, v);
        break;
      case "hatClosed":
        this.hatClosed.triggerAttackRelease("C4", "32n", t, v);
        break;
      case "hatOpen":
        this.hatOpen.triggerAttackRelease("C4", "8n", t, v);
        break;
      case "rimshot":
        this.rimshot.triggerAttackRelease("C5", "32n", t, v);
        break;
    }
  }

  dispose(): void {
    for (const n of [
      this.kick, this.lowTom, this.highTom, this.snare, this.clap,
      this.hatClosed, this.hatOpen, this.rimshot, this.out,
    ]) {
      n.dispose();
    }
  }
}
