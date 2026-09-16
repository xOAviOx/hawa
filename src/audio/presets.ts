/**
 * presets.ts — melody instruments behind a small uniform `MelodyVoice` API.
 *
 * The scale mode doesn't care which synth is playing; it just calls
 * attack/glide/release. Monophonic synths glide (portamento); the sampled piano
 * can't glide, so it flags `retriggerOnChange` and the mode retriggers instead.
 *
 * The piano uses the free Salamander Grand Piano samples that Tone.js hosts
 * publicly, lazy-loaded only when that preset is chosen.
 */

import * as Tone from "tone";
import { CONFIG } from "../config";

export type PresetName =
  | "softPad" | "pluck" | "lead" | "glass" | "eightBit" | "piano"
  | "organ" | "marimba" | "brass" | "bass" | "flute" | "sitar" | "choir";

export const PRESETS: { name: PresetName; label: string }[] = [
  { name: "softPad", label: "Soft Pad" },
  { name: "pluck", label: "Pluck" },
  { name: "lead", label: "Lead" },
  { name: "glass", label: "Glass" },
  { name: "eightBit", label: "8-bit" },
  { name: "piano", label: "Piano" },
  { name: "organ", label: "Organ" },
  { name: "marimba", label: "Marimba" },
  { name: "brass", label: "Brass" },
  { name: "bass", label: "Sub Bass" },
  { name: "flute", label: "Flute" },
  { name: "sitar", label: "Sitar" },
  { name: "choir", label: "Choir" },
];

export interface MelodyVoice {
  connect(dst: Tone.InputNode): void;
  attack(freq: number, time: number, velocity?: number): void;
  /** Legato move to a new pitch without re-attacking (portamento). */
  glide(freq: number, time: number): void;
  release(time: number): void;
  /** If true, the mode should retrigger on note change instead of gliding. */
  readonly retriggerOnChange: boolean;
  /** Resolves once ready to play (samplers load asynchronously). */
  ready(): Promise<void>;
  dispose(): void;
}

/** Wraps any Tone monophonic synth (Synth/MonoSynth/FMSynth). */
class MonoVoice implements MelodyVoice {
  readonly retriggerOnChange = false;
  // The concrete type differs per preset but the trigger API is shared; kept
  // loose here so one wrapper serves all monophonic synths.
  constructor(private readonly synth: any) {}
  connect(dst: Tone.InputNode): void {
    this.synth.connect(dst);
  }
  attack(freq: number, time: number, velocity = 0.9): void {
    this.synth.triggerAttack(freq, time, velocity);
  }
  glide(freq: number, time: number): void {
    this.synth.setNote(freq, time);
  }
  release(time: number): void {
    this.synth.triggerRelease(time);
  }
  ready(): Promise<void> {
    return Promise.resolve();
  }
  dispose(): void {
    this.synth.dispose();
  }
}

/** Wraps the Salamander piano Sampler (polyphonic, no glide). */
class SamplerVoice implements MelodyVoice {
  readonly retriggerOnChange = true;
  private current: number | null = null;
  private readonly loaded: Promise<void>;

  constructor(private readonly sampler: Tone.Sampler, loaded: Promise<void>) {
    this.loaded = loaded;
  }
  connect(dst: Tone.InputNode): void {
    this.sampler.connect(dst);
  }
  attack(freq: number, _time: number, velocity = 0.9): void {
    this.sampler.triggerAttack(freq, undefined, velocity);
    this.current = freq;
  }
  glide(freq: number, _time: number): void {
    // No true glide on a sampler — retrigger the new note (mode gates this).
    if (this.current !== null) this.sampler.triggerRelease(this.current);
    this.sampler.triggerAttack(freq);
    this.current = freq;
  }
  release(_time: number): void {
    if (this.current !== null) this.sampler.triggerRelease(this.current);
    this.current = null;
  }
  ready(): Promise<void> {
    return this.loaded;
  }
  dispose(): void {
    this.sampler.dispose();
  }
}

/** Wraps a Karplus-Strong PluckSynth (plucked string; retriggers, no glide). */
class PluckVoice implements MelodyVoice {
  readonly retriggerOnChange = true;
  constructor(private readonly pluck: Tone.PluckSynth) {}
  connect(dst: Tone.InputNode): void {
    this.pluck.connect(dst);
  }
  attack(freq: number, time: number): void {
    this.pluck.triggerAttack(freq, time);
  }
  glide(freq: number, time: number): void {
    this.pluck.triggerAttack(freq, time); // re-pluck the new note
  }
  release(): void {
    /* a plucked string decays on its own */
  }
  ready(): Promise<void> {
    return Promise.resolve();
  }
  dispose(): void {
    this.pluck.dispose();
  }
}

const P = CONFIG.audio.melody.portamento;

/** Build the melody voice for a preset (not yet connected to anything). */
export function createMelodyVoice(name: PresetName): MelodyVoice {
  switch (name) {
    case "softPad":
      return new MonoVoice(
        new Tone.Synth({
          oscillator: { type: "triangle" },
          envelope: { attack: 0.35, decay: 0.3, sustain: 0.85, release: 1.4 },
          portamento: P,
          volume: -12,
        }),
      );
    case "lead":
      return new MonoVoice(
        new Tone.MonoSynth({
          oscillator: { type: "sawtooth" },
          filter: { type: "lowpass", Q: 2 },
          filterEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.5, release: 0.4, baseFrequency: 400, octaves: 3 },
          envelope: { attack: 0.02, decay: 0.2, sustain: 0.7, release: 0.3 },
          portamento: P,
          volume: -13,
        }),
      );
    case "glass":
      return new MonoVoice(
        new Tone.FMSynth({
          harmonicity: 3,
          modulationIndex: 12,
          oscillator: { type: "sine" },
          envelope: { attack: 0.005, decay: 1.2, sustain: 0.1, release: 1.0 },
          modulation: { type: "sine" },
          modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.3 },
          portamento: P,
          volume: -10,
        }),
      );
    case "eightBit":
      return new MonoVoice(
        new Tone.Synth({
          oscillator: { type: "square" },
          envelope: { attack: 0.005, decay: 0.1, sustain: 0.6, release: 0.15 },
          portamento: P,
          volume: -17,
        }),
      );
    case "piano": {
      let resolve!: () => void;
      const loaded = new Promise<void>((r) => (resolve = r));
      const sampler = new Tone.Sampler({
        urls: {
          A0: "A0.mp3", C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3", A1: "A1.mp3",
          C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3", A2: "A2.mp3",
          C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3", A3: "A3.mp3",
          C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3", A4: "A4.mp3",
          C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3", A5: "A5.mp3",
          C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3", A6: "A6.mp3",
          C7: "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3", A7: "A7.mp3", C8: "C8.mp3",
        },
        baseUrl: "https://tonejs.github.io/audio/salamander/",
        release: 1,
        volume: -6,
        onload: () => resolve(),
      });
      return new SamplerVoice(sampler, loaded);
    }
    case "organ":
      return new MonoVoice(
        new Tone.Synth({
          oscillator: { type: "fatsquare", count: 3, spread: 18 },
          envelope: { attack: 0.02, decay: 0.0, sustain: 1.0, release: 0.22 },
          portamento: P,
          volume: -18,
        }),
      );
    case "marimba":
      return new MonoVoice(
        new Tone.FMSynth({
          harmonicity: 2,
          modulationIndex: 2.2,
          oscillator: { type: "sine" },
          envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.4 },
          modulation: { type: "sine" },
          modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
          portamento: P,
          volume: -8,
        }),
      );
    case "brass":
      return new MonoVoice(
        new Tone.MonoSynth({
          oscillator: { type: "sawtooth" },
          filter: { type: "lowpass", Q: 1 },
          filterEnvelope: { attack: 0.08, decay: 0.2, sustain: 0.7, release: 0.3, baseFrequency: 300, octaves: 2.5 },
          envelope: { attack: 0.06, decay: 0.1, sustain: 0.9, release: 0.25 },
          portamento: P,
          volume: -14,
        }),
      );
    case "bass":
      return new MonoVoice(
        new Tone.MonoSynth({
          oscillator: { type: "square" },
          filter: { type: "lowpass", Q: 1 },
          filterEnvelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.2, baseFrequency: 120, octaves: 2 },
          envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2 },
          portamento: P,
          volume: -10,
        }),
      );
    case "flute":
      return new MonoVoice(
        new Tone.Synth({
          oscillator: { type: "sine" },
          envelope: { attack: 0.09, decay: 0.1, sustain: 0.9, release: 0.3 },
          portamento: P,
          volume: -10,
        }),
      );
    case "choir":
      return new MonoVoice(
        new Tone.Synth({
          oscillator: { type: "fatsine", count: 3, spread: 30 },
          envelope: { attack: 0.4, decay: 0.2, sustain: 0.9, release: 1.2 },
          portamento: P,
          volume: -12,
        }),
      );
    case "sitar":
      return new PluckVoice(
        new Tone.PluckSynth({ attackNoise: 2, dampening: 1800, resonance: 0.9, volume: -6 }),
      );
    case "pluck":
    default:
      return new MonoVoice(
        new Tone.Synth({
          oscillator: { type: "triangle" },
          envelope: { attack: 0.005, decay: 0.28, sustain: 0.0, release: 0.3 },
          portamento: P,
          volume: -8,
        }),
      );
  }
}
