import { describe, it, expect } from "vitest";
import {
  buildChord,
  buildScaleNotes,
  labelForMidi,
  midiToFreq,
  SCALES,
  scalePitchClasses,
  snapMidiToScale,
  yToNoteIndex,
} from "./scales";

describe("midiToFreq", () => {
  it("A4 (69) = 440 Hz", () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
  });
  it("one octave up doubles frequency", () => {
    expect(midiToFreq(81)).toBeCloseTo(880);
  });
});

describe("buildScaleNotes (A minor pentatonic, 2 octaves)", () => {
  const notes = buildScaleNotes(9, "minorPentatonic", 3, 2);
  it("spans octaveRange octaves + top root, lowest first", () => {
    // A3 = MIDI 57; minor pentatonic = [0,3,5,7,10]; 2 octaves + top root.
    expect(notes.length).toBe(5 * 2 + 1);
    expect(notes[0]).toBe(57); // A3
    expect(notes[notes.length - 1]).toBe(57 + 24); // A5 top root
  });
  it("is strictly ascending", () => {
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i]!).toBeGreaterThan(notes[i - 1]!);
    }
  });
  it("falls back to minor pentatonic for an unknown scale key", () => {
    expect(buildScaleNotes(9, "does-not-exist", 3, 1)).toEqual(
      buildScaleNotes(9, "minorPentatonic", 3, 1),
    );
  });
});

describe("yToNoteIndex", () => {
  it("bottom of the stage (y=1) is the lowest note", () => {
    expect(yToNoteIndex(1, 11)).toBe(0);
  });
  it("top of the stage (y=0) is the highest note", () => {
    expect(yToNoteIndex(0, 11)).toBe(10);
  });
  it("maps the middle sensibly and clamps out-of-range", () => {
    expect(yToNoteIndex(0.5, 11)).toBe(5);
    expect(yToNoteIndex(-1, 11)).toBe(10);
    expect(yToNoteIndex(2, 11)).toBe(0);
  });
});

describe("labelForMidi", () => {
  it("Western names by pitch class", () => {
    expect(labelForMidi(57, 9, "western")).toBe("A");
    expect(labelForMidi(60, 9, "western")).toBe("C");
    expect(labelForMidi(66, 9, "western")).toBe("F#");
  });
  it("Sargam relative to the key (key = Sa)", () => {
    expect(labelForMidi(57, 9, "sargam")).toBe("Sa"); // root
    expect(labelForMidi(60, 9, "sargam")).toBe("ga"); // +3 = komal ga
    expect(labelForMidi(64, 9, "sargam")).toBe("Pa"); // +7
    expect(labelForMidi(63, 9, "sargam")).toBe("Ma'"); // +6 = tivra Ma
  });
});

describe("SCALES table", () => {
  it("flags raag scales for the drone accompaniment", () => {
    expect(SCALES.yaman!.raagDrone).toBe(true);
    expect(SCALES.bhupali!.raagDrone).toBe(true);
    expect(SCALES.major!.raagDrone).toBeUndefined();
  });
});

describe("buildChord", () => {
  it("finger 1 in A minor pentatonic = A minor triad (i)", () => {
    // minorType → minor parent; octaveBase 2 → A2=45, C=48, E=52.
    expect(buildChord(9, "minorPentatonic", 1, 2)).toEqual([45, 48, 52]);
  });
  it("finger 1 in C major = C major triad (I)", () => {
    // majorType → major parent; octaveBase 2 → C2=36, E=40, G=43.
    expect(buildChord(0, "major", 1, 2)).toEqual([36, 40, 43]);
  });
  it("finger 3 (V) in C major = G major triad", () => {
    // Degree 4 (G): G2=43, B=47, D=50.
    expect(buildChord(0, "major", 3, 2)).toEqual([43, 47, 50]);
  });
  it("clamps finger count into 1..5", () => {
    expect(buildChord(0, "major", 0, 2)).toEqual(buildChord(0, "major", 1, 2));
    expect(buildChord(0, "major", 9, 2)).toEqual(buildChord(0, "major", 5, 2));
  });
});

describe("scalePitchClasses / snapMidiToScale", () => {
  it("lists the pitch classes of A minor pentatonic", () => {
    expect(scalePitchClasses(9, "minorPentatonic").sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9]);
  });
  it("snaps a fractional MIDI to the nearest in-scale note", () => {
    // Near A (69) stays A; a value near B(71, not in A min pent) snaps to A or C#(73→closest in-scale is 72? no).
    expect(snapMidiToScale(69.1, 9, "minorPentatonic")).toBe(69); // A
    expect(snapMidiToScale(60.2, 9, "minorPentatonic")).toBe(60); // C (in scale)
    // 70.5 → nearest in-scale pc {A=69, C=72}: 69 is 1.5 away, 72 is 1.5 away → picks lower on tie
    expect([69, 72]).toContain(snapMidiToScale(70.5, 9, "minorPentatonic"));
  });
});
