import { describe, it, expect } from "vitest";
import { LM } from "../config";
import {
  countExtended,
  debounceCount,
  fingerStates,
  flipHand,
  handSize,
  pinchHysteresis,
  pinchPoint,
  resolvePhysicalHandedness,
  type DebounceState,
} from "./gestures";
import type { Pt } from "./types";

/** Build a 21-landmark hand with the given per-finger extension flags. */
function buildHand(ext: [boolean, boolean, boolean, boolean, boolean]): Pt[] {
  const lm: Pt[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (i: number, x: number, y: number) => (lm[i] = { x, y, z: 0 });

  set(LM.WRIST, 0.5, 0.9);
  set(LM.MIDDLE_MCP, 0.5, 0.6); // handSize = 0.3
  set(LM.PINKY_MCP, 0.7, 0.65);
  set(LM.THUMB_IP, 0.42, 0.7);

  // Thumb: extended = tip far from pinky MCP, curled = tip near it.
  set(LM.THUMB_TIP, ext[0] ? 0.3 : 0.6, 0.66);

  // Four fingers: pip at y=0.6 (dist 0.3 from wrist), tip far (up) or curled (down).
  const fingers: Array<[number, number, number]> = [
    [LM.INDEX_PIP, LM.INDEX_TIP, 0.44],
    [LM.MIDDLE_PIP, LM.MIDDLE_TIP, 0.5],
    [LM.RING_PIP, LM.RING_TIP, 0.56],
    [LM.PINKY_PIP, LM.PINKY_TIP, 0.62],
  ];
  fingers.forEach(([pip, tip, x], i) => {
    set(pip, x, 0.6);
    set(tip, x, ext[i + 1] ? 0.35 : 0.72);
  });

  return lm;
}

describe("handSize / pinchPoint", () => {
  it("computes wrist→middle_mcp distance", () => {
    const lm = buildHand([false, false, false, false, false]);
    expect(handSize(lm)).toBeCloseTo(0.3);
  });

  it("pinchPoint is the midpoint of thumb + index tips", () => {
    const lm = buildHand([false, false, false, false, false]);
    lm[LM.THUMB_TIP] = { x: 0.4, y: 0.4, z: 0 };
    lm[LM.INDEX_TIP] = { x: 0.6, y: 0.5, z: 0 };
    expect(pinchPoint(lm)).toEqual({ x: 0.5, y: 0.45 });
  });
});

describe("fingerStates / countExtended", () => {
  it("detects a fully open hand as 5", () => {
    expect(countExtended(buildHand([true, true, true, true, true]))).toBe(5);
  });

  it("detects a fist as 0", () => {
    expect(countExtended(buildHand([false, false, false, false, false]))).toBe(0);
  });

  it("detects individual fingers", () => {
    expect(fingerStates(buildHand([false, true, false, false, false]))).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(countExtended(buildHand([false, true, true, false, false]))).toBe(2);
  });
});

describe("pinchHysteresis", () => {
  it("turns ON only below the on-threshold", () => {
    expect(pinchHysteresis(false, 0.3, 0.28, 0.4)).toBe(false);
    expect(pinchHysteresis(false, 0.2, 0.28, 0.4)).toBe(true);
  });

  it("stays ON until above the off-threshold (sticky)", () => {
    expect(pinchHysteresis(true, 0.35, 0.28, 0.4)).toBe(true);
    expect(pinchHysteresis(true, 0.45, 0.28, 0.4)).toBe(false);
  });
});

describe("debounceCount", () => {
  const hold = 80;
  it("does not switch before the value is stable long enough", () => {
    let st: DebounceState = { value: 0, candidate: 0, since: 0 };
    st = debounceCount(st, 3, 1000, hold); // candidate appears
    expect(st.value).toBe(0);
    st = debounceCount(st, 3, 1050, hold); // 50ms < 80ms
    expect(st.value).toBe(0);
  });

  it("commits after the hold time", () => {
    let st: DebounceState = { value: 0, candidate: 0, since: 0 };
    st = debounceCount(st, 3, 1000, hold);
    st = debounceCount(st, 3, 1090, hold); // 90ms >= 80ms
    expect(st.value).toBe(3);
  });

  it("cancels a pending change if the reading flickers back", () => {
    let st: DebounceState = { value: 0, candidate: 0, since: 0 };
    st = debounceCount(st, 3, 1000, hold);
    st = debounceCount(st, 0, 1010, hold); // back to committed value
    expect(st.candidate).toBe(0);
    st = debounceCount(st, 3, 1500, hold); // must restart timer
    st = debounceCount(st, 3, 1550, hold); // only 50ms
    expect(st.value).toBe(0);
  });
});

describe("handedness normalization", () => {
  it("flips labels", () => {
    expect(flipHand("Left")).toBe("Right");
    expect(flipHand("Right")).toBe("Left");
  });

  it("trusts MediaPipe's label as the physical hand by default", () => {
    expect(resolvePhysicalHandedness("Left", false)).toBe("Left");
    expect(resolvePhysicalHandedness("Right", false)).toBe("Right");
  });

  it("swap toggle inverts the label", () => {
    expect(resolvePhysicalHandedness("Left", true)).toBe("Right");
    expect(resolvePhysicalHandedness("Right", true)).toBe("Left");
  });
});
