/**
 * state.ts — shared, mutable app state.
 *
 * A single plain object read by the render loop and written by the detection
 * loop, gesture pipeline, modes and UI. Mutated in place to stay allocation-free
 * in the render hot path.
 */

import { CONFIG } from "./config";
import type { HandMetrics } from "./vision/types";

export type ModeName = "scale" | "theremin" | "drums";
export type LabelStyle = "western" | "sargam";
export type PresetName =
  | "softPad" | "pluck" | "lead" | "glass" | "eightBit" | "piano"
  | "organ" | "marimba" | "brass" | "bass" | "flute" | "sitar" | "choir";

/** User-tunable settings, persisted to localStorage. */
export interface Settings {
  mode: ModeName;
  /** Key as pitch class 0..11. */
  key: number;
  /** Scale key from SCALES. */
  scale: string;
  labelStyle: LabelStyle;
  octaveRange: number;
  swapHands: boolean;
  preset: PresetName;
  bpm: number;
  reverbWet: number;
  delayWet: number;
  /** Tempo-synced delay subdivision (Tone note value, e.g. "8n"). */
  delayDivision: string;
  /** Color-FX wet amounts (0..1). */
  distortionWet: number;
  crushWet: number;
  phaserWet: number;
  /** Transport swing (0..~0.6). Grooves looped/transport parts. */
  swing: number;
  /** Theremin snap-to-scale amount (0 = free, 1 = fully quantized). */
  thereminSnap: number;
  /** 9:16 vertical stage for reels. */
  reelMode: boolean;
  /** Optional watermark text drawn into the recorded frame. */
  watermark: string;
  metronome: boolean;
}

/**
 * Musical actions emitted by modes for the looper to record. These describe
 * what to play (modes already play them live); the looper replays them on its
 * own instruments so live and looped voices never fight.
 */
export type AudioEvent =
  | { type: "note"; freq: number; vel: number }
  | { type: "chord"; freqs: number[] }
  | { type: "drum"; name: string; vel: number };

/** Transient visual cues emitted by modes and consumed by the render layer. */
export type VisualEvent =
  | {
      type: "note";
      nx: number;
      ny: number;
      pitchClass: number;
      velocity: number;
      label: string;
    }
  | { type: "drum"; nx: number; ny: number; velocity: number; hue: number };

/** Live performance metrics for the debug overlay. */
export interface Metrics {
  detectFps: number;
  detectMs: number;
  renderFps: number;
  landmarksDrawn: number;
  delegate: "GPU" | "CPU" | "…";
}

/** What the lane renderer needs to draw the current scale ladder. */
export interface ScaleView {
  labels: string[];
  activeIndex: number | null;
}

export interface AppState {
  /** Latest processed hands (most recent detection or sim frame). */
  hands: HandMetrics[];
  /** Convenience role handles into `hands` (null when that hand is absent). */
  melodyHand: HandMetrics | null;
  chordHand: HandMetrics | null;

  settings: Settings;
  scaleView: ScaleView;

  /** Queue of visual cues to spawn this frame (drained by the renderer). */
  events: VisualEvent[];
  /** Queue of musical actions this frame (tapped by the looper when recording). */
  audioEvents: AudioEvent[];
  /** True while a MediaRecorder capture is running. */
  recording: boolean;
  /** Aurora background wash, tinted by the current chord/drone root. */
  aurora: { hue: number; intensity: number; targetHue: number; targetIntensity: number };

  showCamera: boolean;
  showDebug: boolean;
  panelOpen: boolean;
  metrics: Metrics;
  started: boolean;
  /** True when running via ?sim=1 (mouse/keyboard instead of camera). */
  sim: boolean;
}

const SETTINGS_KEY = "hawa.settings.v2";

/** Load persisted settings, falling back to CONFIG defaults. */
export function loadSettings(): Settings {
  const d = CONFIG.defaults;
  const base: Settings = {
    mode: d.mode,
    key: d.key,
    scale: d.scale,
    labelStyle: d.labelStyle,
    octaveRange: d.octaveRange,
    swapHands: d.swapHands,
    preset: d.preset,
    bpm: d.bpm,
    reverbWet: d.reverbWet,
    delayWet: d.delayWet,
    delayDivision: d.delayDivision,
    distortionWet: d.distortionWet,
    crushWet: d.crushWet,
    phaserWet: d.phaserWet,
    swing: d.swing,
    thereminSnap: d.thereminSnap,
    reelMode: d.reelMode,
    watermark: d.watermark,
    metronome: d.metronome,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    return { ...base, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return base;
  }
}

/** Persist current settings (best-effort). */
export function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    /* storage may be unavailable (private mode) — ignore */
  }
}

export const state: AppState = {
  hands: [],
  melodyHand: null,
  chordHand: null,
  settings: loadSettings(),
  scaleView: { labels: [], activeIndex: null },
  events: [],
  audioEvents: [],
  recording: false,
  aurora: { hue: 200, intensity: 0, targetHue: 200, targetIntensity: 0 },
  showCamera: CONFIG.feed.show,
  showDebug: CONFIG.debug.show,
  panelOpen: false,
  metrics: {
    detectFps: 0,
    detectMs: 0,
    renderFps: 0,
    landmarksDrawn: 0,
    delegate: "…",
  },
  started: false,
  sim: false,
};
