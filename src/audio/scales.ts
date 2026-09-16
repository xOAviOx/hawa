/**
 * scales.ts — keys, scales, note-array building, quantization, and labels.
 *
 * Everything here is PURE (no Tone.js), so it's fully unit-testable. Modes call
 * these to build the ladder of playable notes and to render lane labels.
 */

/** The 12 chromatic roots. `pc` is the pitch class (semitones above C). */
export const ROOTS: ReadonlyArray<{ name: string; pc: number }> = [
  { name: "C", pc: 0 },
  { name: "C#", pc: 1 },
  { name: "D", pc: 2 },
  { name: "D#", pc: 3 },
  { name: "E", pc: 4 },
  { name: "F", pc: 5 },
  { name: "F#", pc: 6 },
  { name: "G", pc: 7 },
  { name: "G#", pc: 8 },
  { name: "A", pc: 9 },
  { name: "A#", pc: 10 },
  { name: "B", pc: 11 },
];

export interface ScaleDef {
  /** Machine key used in settings. */
  key: string;
  /** Human label for the UI. */
  label: string;
  /** Semitone offsets from the root, ascending, within one octave. */
  intervals: number[];
  /** True for minor-type scales (affects chord flavor in Phase 3). */
  minorType: boolean;
  /** If true, the left hand plays a tanpura drone instead of chords. */
  raagDrone?: boolean;
}

/** All supported scales. Raag-inspired ones flag a drone accompaniment. */
export const SCALES: Record<string, ScaleDef> = {
  major: { key: "major", label: "Major", intervals: [0, 2, 4, 5, 7, 9, 11], minorType: false },
  naturalMinor: {
    key: "naturalMinor",
    label: "Natural Minor",
    intervals: [0, 2, 3, 5, 7, 8, 10],
    minorType: true,
  },
  majorPentatonic: {
    key: "majorPentatonic",
    label: "Major Pentatonic",
    intervals: [0, 2, 4, 7, 9],
    minorType: false,
  },
  minorPentatonic: {
    key: "minorPentatonic",
    label: "Minor Pentatonic",
    intervals: [0, 3, 5, 7, 10],
    minorType: true,
  },
  blues: { key: "blues", label: "Blues", intervals: [0, 3, 5, 6, 7, 10], minorType: true },
  dorian: { key: "dorian", label: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10], minorType: true },
  harmonicMinor: {
    key: "harmonicMinor",
    label: "Harmonic Minor",
    intervals: [0, 2, 3, 5, 7, 8, 11],
    minorType: true,
  },
  japaneseIn: {
    key: "japaneseIn",
    label: "Japanese In",
    intervals: [0, 1, 5, 7, 8],
    minorType: true,
  },
  // Raag-inspired (left hand = tanpura drone).
  yaman: {
    key: "yaman",
    label: "Raag Yaman",
    intervals: [0, 2, 4, 6, 7, 9, 11], // S R G M(tivra) P D N
    minorType: false,
    raagDrone: true,
  },
  bhairav: {
    key: "bhairav",
    label: "Raag Bhairav",
    intervals: [0, 1, 4, 5, 7, 8, 11], // S r(komal) G M P d(komal) N
    minorType: false,
    raagDrone: true,
  },
  bhupali: {
    key: "bhupali",
    label: "Raag Bhupali",
    intervals: [0, 2, 4, 7, 9], // S R G P D
    minorType: false,
    raagDrone: true,
  },
  kafi: {
    key: "kafi",
    label: "Raag Kafi",
    intervals: [0, 2, 3, 5, 7, 9, 10], // S R g(komal) M P D n(komal)
    minorType: true,
    raagDrone: true,
  },
};

/** Pure MIDI→Hz (A4 = 69 = 440 Hz). Avoids pulling in Tone for tests. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Build the ascending ladder of MIDI notes for a key+scale across `octaveRange`
 * octaves, low note first. Includes the final root on top so the ladder spans a
 * whole number of octaves. `baseOctave` follows the convention A3 = MIDI 57.
 */
export function buildScaleNotes(
  rootPc: number,
  scaleKey: string,
  baseOctave: number,
  octaveRange: number,
): number[] {
  const scale = SCALES[scaleKey] ?? SCALES.minorPentatonic!;
  // MIDI of the root at baseOctave. MIDI 12 = C0, so C3 = 48, A3 = 57.
  const baseMidi = (baseOctave + 1) * 12 + (rootPc % 12);
  const notes: number[] = [];
  for (let oct = 0; oct < octaveRange; oct++) {
    for (const interval of scale.intervals) {
      notes.push(baseMidi + oct * 12 + interval);
    }
  }
  notes.push(baseMidi + octaveRange * 12); // top root
  return notes;
}

/**
 * Map a normalized vertical position to a note index. y=1 is the BOTTOM of the
 * stage (lowest note), y=0 is the top (highest note).
 */
export function yToNoteIndex(y: number, count: number): number {
  if (count <= 0) return 0;
  const idx = Math.floor((1 - y) * count);
  return Math.max(0, Math.min(count - 1, idx));
}

// Diatonic parent scales used to build chords. Pentatonic/blues/raag scales
// borrow the appropriate 7-note parent so triads always sound in-key.
const MAJOR_PARENT = [0, 2, 4, 5, 7, 9, 11];
const MINOR_PARENT = [0, 2, 3, 5, 7, 8, 10];

// Left-hand finger count → scale degree (0-indexed) of the chord root.
// Major-type: 1=I 2=IV 3=V 4=vi 5=ii. Minor-type: 1=i 2=iv 3=v 4=VI 5=VII.
const DEGREE_MAJOR = [0, 3, 4, 5, 1];
const DEGREE_MINOR = [0, 3, 4, 5, 6];

/** MIDI note for a scale degree (may exceed 0..6; wraps octaves). */
function degreeToMidi(rootPc: number, intervals: number[], degree: number, octaveBase: number): number {
  const oct = Math.floor(degree / 7);
  const idx = ((degree % 7) + 7) % 7;
  return (octaveBase + 1) * 12 + (rootPc % 12) + intervals[idx]! + 12 * oct;
}

/**
 * Build a triad (3 MIDI notes) for the given finger count (1..5) in the current
 * key/scale. Uses the scale's minor/major parent so it works for pentatonic,
 * blues and raag scales too.
 */
export function buildChord(
  rootPc: number,
  scaleKey: string,
  finger: number,
  octaveBase: number,
): number[] {
  const def = SCALES[scaleKey] ?? SCALES.minorPentatonic!;
  const minor = def.minorType;
  const intervals = minor ? MINOR_PARENT : MAJOR_PARENT;
  const degMap = minor ? DEGREE_MINOR : DEGREE_MAJOR;
  const f = Math.max(1, Math.min(5, Math.round(finger)));
  const rootDeg = degMap[f - 1]!;
  return [rootDeg, rootDeg + 2, rootDeg + 4].map((d) =>
    degreeToMidi(rootPc, intervals, d, octaveBase),
  );
}

/** The pitch classes (0..11) that belong to a key+scale. */
export function scalePitchClasses(rootPc: number, scaleKey: string): number[] {
  const def = SCALES[scaleKey] ?? SCALES.minorPentatonic!;
  return def.intervals.map((i) => (((rootPc + i) % 12) + 12) % 12);
}

/**
 * Snap a fractional MIDI value to the nearest in-scale MIDI note. Used by the
 * theremin's snap-to-scale control. Pure and testable.
 */
export function snapMidiToScale(midiFloat: number, rootPc: number, scaleKey: string): number {
  const pcs = new Set(scalePitchClasses(rootPc, scaleKey));
  const center = Math.round(midiFloat);
  for (let d = 0; d <= 12; d++) {
    const candidates = d === 0 ? [0] : [-d, d];
    for (const off of candidates) {
      const m = center + off;
      if (pcs.has((((m % 12) + 12) % 12))) return m;
    }
  }
  return center;
}

const WESTERN = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Sargam names by semitone distance from Sa (the selected key = Sa).
 * Komal (flat) swaras are lowercase; tivra Ma is "Ma'".
 */
const SARGAM = ["Sa", "re", "Re", "ga", "Ga", "Ma", "Ma'", "Pa", "dha", "Dha", "ni", "Ni"];

/** Label a MIDI note either in Western note names or Sargam relative to the key. */
export function labelForMidi(
  midi: number,
  rootPc: number,
  style: "western" | "sargam",
): string {
  if (style === "sargam") {
    const rel = ((midi - rootPc) % 12 + 12) % 12;
    return SARGAM[rel]!;
  }
  return WESTERN[((midi % 12) + 12) % 12]!;
}
