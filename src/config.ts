/**
 * config.ts — ALL tunable numbers live here.
 *
 * Tweak thresholds, mappings, colors and sizes in one place. Nothing in here
 * is computed from anything else at import time, so it stays easy to reason
 * about. Later phases add more sections (audio, gestures, particles, …).
 */

export const CONFIG = {
  /** Camera capture. 640x480 is plenty for hand tracking and keeps latency low. */
  camera: {
    width: 640,
    height: 480,
    /** "user" = front/selfie camera (what we want on phones and laptops). */
    facingMode: "user" as const,
    frameRate: 60,
  },

  /** HandLandmarker model + WASM (served locally from /public, no CDN). */
  vision: {
    /** Directory that contains the copied MediaPipe vision WASM files. */
    wasmBasePath: "mediapipe",
    /** Path to the downloaded float16 model. */
    modelAssetPath: "models/hand_landmarker.task",
    numHands: 2,
    /** Try GPU first; handTracker falls back to CPU automatically on failure. */
    delegate: "GPU" as "GPU" | "CPU",
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },

  /**
   * Visual style. An intentional teal + warm-amber pair (one primary accent,
   * one considered complement) — not the default cyan/magenta neon.
   */
  colors: {
    background: "#080b0f",
    /** Right hand = melody = primary mint/teal accent. */
    right: "#5fe3c8",
    /** Left hand = accompaniment = warm amber. */
    left: "#ffab5e",
    fingertip: "#f4fff9",
  },

  /** Neon skeleton drawing. */
  skeleton: {
    lineWidth: 3,
    /** Glow blur radius in px (via shadowBlur). */
    glow: 14,
    jointRadius: 4,
    fingertipRadius: 7,
    /** Landmark indices whose dots we emphasize as glowing fingertips. */
    fingertips: [4, 8, 12, 16, 20],
  },

  /** Camera feed rendering. */
  feed: {
    /** Opacity of the live camera behind the visuals (0..1). */
    opacity: 0.35,
    /** Toggle: draw the camera feed at all. */
    show: true,
  },

  /** Debug overlay defaults. */
  debug: {
    /** Show the FPS / timing overlay on load. Toggle with D. */
    show: false,
  },

  /** Gesture thresholds. Distances are normalized by handSize. */
  gestures: {
    /** Pinch turns ON below this normalized distance… */
    pinchOn: 0.28,
    /** …and OFF above this one (hysteresis prevents flicker). */
    pinchOff: 0.4,
    /** Extended-finger count must be stable this long before it changes. */
    countDebounceMs: 80,
  },

  /** One Euro filter params, tuned for normalized landmarks at ~30–60 fps. */
  oneEuro: {
    minCutoff: 1.4,
    beta: 0.05,
    dCutoff: 1.0,
  },

  /** Audio engine, master FX chain, melody + accompaniment. */
  audio: {
    /** Master lowpass (right-hand X controls the cutoff). */
    filter: { min: 320, max: 9000, q: 0.7 },
    melody: {
      /** Legato glide time between lanes (seconds). */
      portamento: 0.055,
      /** Melody synth level (dB). */
      volume: -9,
    },
    /** Octave of the scale's root note (e.g. baseOctave 3 → A3 for key A). */
    baseOctave: 3,
    /**
     * Master FX chain:
     * filter → distortion → bitcrusher → phaser → chorus → delay → reverb → limiter.
     * The color FX default to wet 0 (transparent) and are dialed in via the panel.
     */
    distortion: { amount: 0.45 },
    bitcrush: { bits: 5 },
    phaser: { frequency: 0.6, octaves: 3, baseFrequency: 380 },
    chorus: { frequency: 1.2, depth: 0.5, wet: 0.3 },
    delay: { note: "8n", feedback: 0.32, wet: 0.2 },
    reverb: { decay: 3.2, wet: 0.28 },
    limiter: { threshold: -1 },
    /** Selectable tempo-synced delay subdivisions (label → note value). */
    delayDivisions: [
      { value: "4n", label: "1/4" },
      { value: "8n.", label: "1/8 dotted" },
      { value: "8n", label: "1/8" },
      { value: "16n", label: "1/16" },
    ],
    /** Left-hand chord pad. Sits an octave below the melody root. */
    chords: {
      octaveOffset: -1,
      attack: 0.15,
      release: 0.4,
      crossfade: 0.15,
      volume: -13,
    },
    /** Tanpura drone (raag scales). */
    drone: {
      octaveOffset: -1,
      volume: -14,
      /** Beat interval for the plucked cycle. */
      note: "4n",
    },
    /** Default BPM (delay is tempo-synced to this). */
    bpm: 90,
  },

  /** THEREMIN mode. */
  theremin: {
    /** Lowest pitch (Hz) at the bottom of the range. */
    baseFreq: 130.81, // C3
    /** How many octaves the vertical range spans. */
    octaves: 3,
    /** Right hand must show at least this many fingers to sound. */
    openFingers: 3,
    vibratoRate: 5,
    vibratoDepth: 0.12,
    volume: -8,
    /** Portamento so pitch slides smoothly (seconds). */
    glide: 0.04,
    /** Default snap-to-scale amount (0 = free, 1 = fully quantized). */
    snapDefault: 0.5,
  },

  /** AIR DRUMS mode. */
  drums: {
    volume: -5,
    /** Velocity is derived from fingertip closing speed, mapped into this range. */
    velMin: 0.35,
    velMax: 1,
    /** Normalized closing speed (per second) that maps to full velocity. */
    velFullSpeed: 3.5,
    /** Frames of distance history used to estimate approach speed. */
    historyLen: 5,
  },

  /** Object-pooled particle system + visual FX. */
  particles: {
    cap: 1500,
    /** Particles spawned per note-on burst (scaled by velocity). */
    burst: 22,
    gravity: 260, // px/s^2, pulls particles down
    drag: 0.9,
    minLife: 0.5,
    maxLife: 1.3,
    /** Trail length (number of recent pinch points kept). */
    trailLen: 26,
    /** Max concurrent drum shockwaves. */
    shockwaves: 24,
  },

  /** Aurora background wash (tinted by chord/drone root). */
  aurora: {
    /** How fast the hue/intensity ease toward their targets (0..1 per frame). */
    lerp: 0.06,
    maxIntensity: 0.55,
  },

  /** Vertical 9:16 reel stage. */
  reel: {
    width: 1080,
    height: 1920,
    watermarkSize: 34,
  },

  /** Recording via MediaRecorder. First supported mime wins (mp4 preferred). */
  record: {
    fps: 60,
    filenamePrefix: "hawa",
    mimeCandidates: [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ],
    /** 3-2-1 countdown length (seconds) before recording starts. */
    countdown: 3,
  },

  /** Event looper. */
  looper: {
    bars: 2,
    beatsPerBar: 4,
    maxLayers: 3,
    metronomeVolume: -14,
    /** Note/chord/drum playback levels for looped layers (dB). */
    melodyVolume: -10,
    chordVolume: -15,
  },

  /** Scale-mode note lanes. */
  lanes: {
    /** Vertical padding as a fraction of stage height (top and bottom). */
    padTop: 0.05,
    padBottom: 0.05,
    labelSize: 15,
  },

  /** Default user settings (persisted to localStorage; editable in the panel). */
  defaults: {
    mode: "scale" as "scale" | "theremin" | "drums",
    /** Key as a pitch class 0..11 (C=0 … A=9 … B=11). Default A. */
    key: 9,
    scale: "minorPentatonic",
    labelStyle: "western" as "western" | "sargam",
    octaveRange: 2,
    swapHands: false,
    preset: "pluck" as
      | "softPad" | "pluck" | "lead" | "glass" | "eightBit" | "piano"
      | "organ" | "marimba" | "brass" | "bass" | "flute" | "sitar" | "choir",
    bpm: 90,
    reverbWet: 0.28,
    delayWet: 0.2,
    delayDivision: "8n",
    distortionWet: 0,
    crushWet: 0,
    phaserWet: 0,
    /** Transport swing (0 = straight, ~0.5 = hard shuffle). Grooves looped parts. */
    swing: 0,
    thereminSnap: 0.5,
    reelMode: false,
    watermark: "",
    metronome: false,
  },
} as const;

/**
 * MediaPipe hand landmark indices (21 per hand). Named for readability.
 * See https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
 */
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;
