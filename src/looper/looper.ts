/**
 * looper.ts — records musical EVENTS (not audio) and loops them.
 *
 * Events are captured in loop-position space (ms since the loop origin), so a
 * layer always spans the whole loop regardless of when you started recording.
 * Layers replay on the looper's OWN instruments so they never fight the live
 * mono voices. Up to `maxLayers`, with undo and clear. A metronome with a 1-bar
 * count-in keeps everything in time.
 *
 * The clock is driven from the render loop (update(now)), which is plenty
 * accurate for loop playback (live input latency is handled elsewhere).
 */

import * as Tone from "tone";
import { CONFIG } from "../config";
import { state, type AudioEvent } from "../state";
import { AudioEngine } from "../audio/engine";
import { DrumKit, type DrumName } from "../audio/drums";

interface LoopEvent {
  /** Position within the loop, in ms [0, loopLen). */
  t: number;
  ev: AudioEvent;
}

type Phase = "idle" | "countIn" | "recording";

export class Looper {
  private readonly melody: Tone.PolySynth;
  private readonly pad: Tone.PolySynth;
  private readonly kit: DrumKit;
  private readonly click: Tone.MembraneSynth;

  private layers: LoopEvent[][] = [];
  private buffer: LoopEvent[] = [];
  private phase: Phase = "idle";

  private t0 = 0; // loop origin (ms)
  private prevPos = 0;
  private countInEnd = 0;
  private recEnd = 0;
  private lastBeat = -1;

  constructor(engine: AudioEngine) {
    const L = CONFIG.looper;
    this.melody = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0, release: 0.3 },
      volume: L.melodyVolume,
    }).connect(engine.output);
    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.15, decay: 0.3, sustain: 0.7, release: 0.5 },
      volume: L.chordVolume,
    }).connect(engine.output);
    this.kit = new DrumKit(engine.output);
    this.click = new Tone.MembraneSynth({
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
      volume: L.metronomeVolume,
    }).connect(engine.output);
  }

  // ---- Derived timing ------------------------------------------------------

  private get beatMs(): number {
    return (60 / state.settings.bpm) * 1000;
  }
  private get loopLenMs(): number {
    return this.beatMs * CONFIG.looper.beatsPerBar * CONFIG.looper.bars;
  }

  // ---- Public status (for the HUD) -----------------------------------------

  get layerCount(): number {
    return this.layers.length;
  }
  get isRecording(): boolean {
    return this.phase === "recording";
  }
  get isCountingIn(): boolean {
    return this.phase === "countIn";
  }
  get isActive(): boolean {
    return this.layers.length > 0 || this.phase !== "idle" || state.settings.metronome;
  }
  /** 0..1 position within the current loop, for the progress ring. */
  get progress(): number {
    if (!this.isActive) return 0;
    return this.prevPos / this.loopLenMs;
  }

  // ---- Controls ------------------------------------------------------------

  /** Toggle recording: arm (1-bar count-in) or stop + commit the take. */
  toggleRecord(now: number): void {
    if (this.phase === "recording" || this.phase === "countIn") {
      this.commit();
      return;
    }
    if (this.layers.length >= CONFIG.looper.maxLayers) return;
    if (!this.isActive) {
      this.t0 = now;
      this.prevPos = 0;
      this.lastBeat = -1;
    }
    this.phase = "countIn";
    this.countInEnd = now + this.beatMs * CONFIG.looper.beatsPerBar;
    this.buffer = [];
  }

  undo(): void {
    this.layers.pop();
    if (this.layers.length === 0 && this.phase === "idle") this.reset();
  }

  clear(): void {
    this.layers = [];
    this.buffer = [];
    this.phase = "idle";
    this.reset();
  }

  private reset(): void {
    this.prevPos = 0;
    this.lastBeat = -1;
  }

  /** Called by the app for each live audio event while recording. */
  record(ev: AudioEvent, now: number): void {
    if (this.phase !== "recording") return;
    this.buffer.push({ t: (now - this.t0) % this.loopLenMs, ev });
  }

  private commit(): void {
    if (this.phase === "recording" && this.buffer.length > 0) {
      this.layers.push(this.buffer);
    }
    this.buffer = [];
    this.phase = "idle";
  }

  // ---- Per-frame update ----------------------------------------------------

  update(now: number): void {
    if (!this.isActive) return;

    // Count-in → recording transition. For the very first layer, realign the
    // loop origin to the downbeat so the recording starts exactly at pos 0.
    if (this.phase === "countIn" && now >= this.countInEnd) {
      if (this.layers.length === 0) {
        this.t0 = now;
        this.prevPos = 0;
        this.lastBeat = -1;
      }
      this.phase = "recording";
      this.recEnd = now + this.loopLenMs;
    }
    if (this.phase === "recording" && now >= this.recEnd) {
      this.commit();
    }

    const loopLen = this.loopLenMs;
    const pos = (now - this.t0) % loopLen;
    const wrapped = pos < this.prevPos;

    // Metronome (during count-in, recording, or when explicitly enabled).
    const clickOn = state.settings.metronome || this.phase !== "idle";
    if (clickOn) {
      const beat = Math.floor(pos / this.beatMs);
      if (beat !== this.lastBeat) {
        const downbeat = beat % CONFIG.looper.beatsPerBar === 0;
        this.click.triggerAttackRelease(downbeat ? "C3" : "C2", "32n", Tone.now(), downbeat ? 0.9 : 0.5);
        this.lastBeat = beat;
      }
    }

    // Replay committed layers for events crossed this frame (swing-aware).
    for (const layer of this.layers) {
      for (const e of layer) {
        const et = this.swung(e.t, loopLen);
        const crossed = wrapped
          ? et > this.prevPos || et <= pos
          : et > this.prevPos && et <= pos;
        if (crossed) this.trigger(e.ev);
      }
    }

    this.prevPos = pos;
  }

  /** Shift off-beat eighth notes later by the swing amount (Tone convention). */
  private swung(t: number, loopLen: number): number {
    const s = state.settings.swing;
    if (s <= 0) return t;
    const eighth = this.beatMs / 2;
    const isOffbeat = Math.floor(t / eighth) % 2 === 1;
    if (!isOffbeat) return t;
    return Math.min(t + s * eighth * 0.5, loopLen - 1);
  }

  private trigger(ev: AudioEvent): void {
    const t = Tone.now();
    if (ev.type === "note") {
      this.melody.triggerAttackRelease(ev.freq, "8n", t, ev.vel);
    } else if (ev.type === "chord") {
      this.pad.triggerAttackRelease(ev.freqs, "2n", t, 0.6);
    } else {
      this.kit.trigger(ev.name as DrumName, ev.vel);
    }
  }

  dispose(): void {
    this.melody.dispose();
    this.pad.dispose();
    this.kit.dispose();
    this.click.dispose();
  }
}
