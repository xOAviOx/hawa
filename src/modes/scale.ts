/**
 * scale.ts — Mode 1: SCALE (default).
 *
 * Right hand = melody (pinch to play, vertical = pitch, glide between lanes,
 * X = filter cutoff). Left hand = accompaniment: for normal scales it holds a
 * soft chord pad chosen by finger count (1=I 2=IV 3=V 4=vi 5=ii, minor-type
 * shifts to i/iv/v/VI/VII); for raag scales it plays a tanpura drone instead.
 * Left-hand height sets the accompaniment volume; a fist fades it out.
 */

import * as Tone from "tone";
import { CONFIG } from "../config";
import { state } from "../state";
import { AudioEngine, cutoffFromNorm } from "../audio/engine";
import {
  buildChord,
  buildScaleNotes,
  labelForMidi,
  midiToFreq,
  SCALES,
  yToNoteIndex,
} from "../audio/scales";
import { createMelodyVoice, type MelodyVoice, type PresetName } from "../audio/presets";
import { Drone } from "../audio/drone";
import type { Mode } from "./mode";

export class ScaleMode implements Mode {
  // Melody
  private voice: MelodyVoice;
  private voicePreset: PresetName;
  private notes: number[] = [];
  private ladderSig = "";
  private currentIndex: number | null = null;
  private playing = false;

  // Chords
  private readonly pad: Tone.PolySynth;
  private readonly chordGain: Tone.Gain;
  private chordNotes: number[] = [];
  private chordFinger = 0;

  // Drone
  private readonly drone: Drone;

  constructor(private readonly engine: AudioEngine) {
    this.voicePreset = state.settings.preset;
    this.voice = createMelodyVoice(this.voicePreset);
    this.voice.connect(this.engine.output);

    const c = CONFIG.audio.chords;
    this.chordGain = new Tone.Gain(0).connect(this.engine.output);
    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: c.attack, decay: 0.3, sustain: 0.8, release: c.release },
      volume: c.volume,
    }).connect(this.chordGain);

    this.drone = new Drone(this.engine.output);
  }

  enter(): void {
    this.drone.start();
  }

  exit(): void {
    this.releaseMelody();
    this.releaseChord();
    this.drone.setVolume(0);
    state.scaleView.activeIndex = null;
    state.aurora.targetIntensity = 0;
  }

  update(): void {
    this.ensurePreset();
    this.ensureLadder();
    this.updateMelody();
    this.updateAccompaniment();
  }

  // ---- Melody --------------------------------------------------------------

  private ensurePreset(): void {
    if (state.settings.preset === this.voicePreset) return;
    this.releaseMelody();
    this.voice.dispose();
    this.voicePreset = state.settings.preset;
    this.voice = createMelodyVoice(this.voicePreset);
    this.voice.connect(this.engine.output);
    this.currentIndex = null;
  }

  private ensureLadder(): void {
    const s = state.settings;
    const sig = `${s.key}|${s.scale}|${s.octaveRange}|${s.labelStyle}`;
    if (sig === this.ladderSig) return;
    this.ladderSig = sig;
    this.notes = buildScaleNotes(s.key, s.scale, CONFIG.audio.baseOctave, s.octaveRange);
    state.scaleView.labels = this.notes.map((m) => labelForMidi(m, s.key, s.labelStyle));
    this.currentIndex = null;
  }

  private updateMelody(): void {
    const hand = state.melodyHand;
    if (!hand || this.notes.length === 0) {
      this.releaseMelody();
      state.scaleView.activeIndex = null;
      return;
    }

    // X → cutoff (mirror: on-screen X = 1 - rawX). Left dark, right bright.
    this.engine.setCutoff(cutoffFromNorm(1 - hand.pinchPoint.x));

    if (hand.pinch) {
      const idx = yToNoteIndex(hand.pinchPoint.y, this.notes.length);
      const midi = this.notes[idx]!;
      const freq = midiToFreq(midi);
      const t = Tone.now();
      if (!this.playing) {
        this.voice.attack(freq, t, 0.85);
        this.playing = true;
        this.currentIndex = idx;
        this.emitNote(hand.pinchPoint.x, hand.pinchPoint.y, midi, freq);
      } else if (idx !== this.currentIndex) {
        if (this.voice.retriggerOnChange) this.voice.attack(freq, t, 0.85);
        else this.voice.glide(freq, t);
        this.currentIndex = idx;
        this.emitNote(hand.pinchPoint.x, hand.pinchPoint.y, midi, freq);
      }
      state.scaleView.activeIndex = idx;
    } else {
      this.releaseMelody();
      state.scaleView.activeIndex = null;
    }
  }

  private emitNote(nx: number, ny: number, midi: number, freq: number): void {
    state.events.push({
      type: "note",
      nx,
      ny,
      pitchClass: ((midi % 12) + 12) % 12,
      velocity: 0.85,
      label: labelForMidi(midi, state.settings.key, state.settings.labelStyle),
    });
    state.audioEvents.push({ type: "note", freq, vel: 0.85 });
  }

  private releaseMelody(): void {
    if (this.playing) {
      this.voice.release(Tone.now());
      this.playing = false;
      this.currentIndex = null;
    }
  }

  // ---- Chords / drone ------------------------------------------------------

  private updateAccompaniment(): void {
    const s = state.settings;
    const isRaag = SCALES[s.scale]?.raagDrone === true;
    const hand = state.chordHand;
    const height = hand ? Math.max(0, Math.min(1, 1 - hand.pinchPoint.y)) : 0;

    if (isRaag) {
      // Drone path (chords silent).
      this.releaseChord();
      this.drone.setRoot(s.key);
      const on = !!hand && hand.fingerCount > 0;
      this.drone.setVolume(on ? height : 0);
      state.aurora.targetHue = (s.key / 12) * 360;
      state.aurora.targetIntensity = on ? height * CONFIG.aurora.maxIntensity : 0;
      return;
    }

    // Chord path (drone silent).
    this.drone.setVolume(0);
    if (!hand || hand.fingerCount === 0) {
      this.releaseChord();
      state.aurora.targetIntensity = 0;
      return;
    }

    const finger = hand.fingerCount;
    if (finger !== this.chordFinger) {
      const octaveBase = CONFIG.audio.baseOctave + CONFIG.audio.chords.octaveOffset;
      const next = buildChord(s.key, s.scale, finger, octaveBase);
      this.crossfadeChord(next);
      this.chordFinger = finger;
      state.aurora.targetHue = ((next[0]! % 12) / 12) * 360;
    }
    this.chordGain.gain.rampTo(height, CONFIG.audio.chords.crossfade);
    state.aurora.targetIntensity = height * CONFIG.aurora.maxIntensity;
  }

  private crossfadeChord(next: number[]): void {
    const t = Tone.now();
    const freqs = next.map(midiToFreq);
    if (this.chordNotes.length) this.pad.triggerRelease(this.chordNotes.map(midiToFreq), t);
    this.pad.triggerAttack(freqs, t + 0.001);
    this.chordNotes = next;
    state.audioEvents.push({ type: "chord", freqs });
  }

  private releaseChord(): void {
    if (this.chordNotes.length) {
      this.pad.triggerRelease(this.chordNotes.map(midiToFreq), Tone.now());
      this.chordNotes = [];
    }
    this.chordFinger = 0;
    this.chordGain.gain.rampTo(0, CONFIG.audio.chords.crossfade);
  }

  dispose(): void {
    this.voice.dispose();
    this.pad.dispose();
    this.chordGain.dispose();
    this.drone.dispose();
  }
}
