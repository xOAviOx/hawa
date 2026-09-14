import { describe, it, expect } from "vitest";
import { OneEuroFilter } from "./oneEuro";

const params = { minCutoff: 1.0, beta: 0.02, dCutoff: 1.0 };

describe("OneEuroFilter", () => {
  it("returns the first sample unchanged", () => {
    const f = new OneEuroFilter(params);
    expect(f.filter(0.5, 0)).toBeCloseTo(0.5);
  });

  it("converges to a constant input", () => {
    const f = new OneEuroFilter(params);
    let out = 0;
    for (let i = 0; i < 100; i++) out = f.filter(1, i / 60);
    expect(out).toBeCloseTo(1, 3);
  });

  it("reduces variance of a noisy constant signal", () => {
    const f = new OneEuroFilter(params);
    // Deterministic pseudo-noise around 0.5.
    const noise = (i: number) => 0.5 + 0.1 * Math.sin(i * 12.9898) * Math.cos(i * 78.233);
    const rawVals: number[] = [];
    const outVals: number[] = [];
    for (let i = 0; i < 300; i++) {
      const raw = noise(i);
      rawVals.push(raw);
      outVals.push(f.filter(raw, i / 60));
    }
    // Compare variance over the settled tail.
    const variance = (a: number[]) => {
      const m = a.reduce((s, v) => s + v, 0) / a.length;
      return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length;
    };
    const rawVar = variance(rawVals.slice(100));
    const outVar = variance(outVals.slice(100));
    expect(outVar).toBeLessThan(rawVar);
  });

  it("tracks a step change (responsive, not stuck)", () => {
    const f = new OneEuroFilter(params);
    for (let i = 0; i < 60; i++) f.filter(0, i / 60);
    let out = 0;
    for (let i = 60; i < 120; i++) out = f.filter(1, i / 60);
    expect(out).toBeGreaterThan(0.9);
  });

  it("assumes 60Hz when timestamps do not advance", () => {
    const f = new OneEuroFilter(params);
    // Same timestamp repeatedly should not blow up (no divide-by-zero).
    let out = 0;
    for (let i = 0; i < 50; i++) out = f.filter(1, 0);
    expect(Number.isFinite(out)).toBe(true);
  });
});
