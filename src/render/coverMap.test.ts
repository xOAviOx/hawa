import { describe, it, expect } from "vitest";
import { coverRect, projectMirrored } from "./coverMap";

describe("coverRect", () => {
  it("returns an empty rect when the video has no dimensions", () => {
    expect(coverRect(0, 0, 800, 600)).toEqual({ offX: 0, offY: 0, drawW: 0, drawH: 0 });
  });

  it("fills exactly when aspect ratios match", () => {
    const r = coverRect(640, 480, 800, 600); // both 4:3
    expect(r.drawW).toBeCloseTo(800);
    expect(r.drawH).toBeCloseTo(600);
    expect(r.offX).toBeCloseTo(0);
    expect(r.offY).toBeCloseTo(0);
  });

  it("crops horizontally when the stage is taller (portrait) than the 4:3 video", () => {
    // Stage 1080x1920 (9:16), video 640x480 (4:3): scale by height.
    const r = coverRect(640, 480, 1080, 1920);
    expect(r.drawH).toBeCloseTo(1920);
    expect(r.drawW).toBeGreaterThan(1080); // overflow horizontally
    expect(r.offY).toBeCloseTo(0);
    expect(r.offX).toBeLessThan(0);
    // Symmetric crop.
    expect(r.offX).toBeCloseTo((1080 - r.drawW) / 2);
  });

  it("always fully covers the stage (no gaps)", () => {
    const r = coverRect(640, 480, 1234, 567);
    expect(r.drawW).toBeGreaterThanOrEqual(1234 - 1e-6);
    expect(r.drawH).toBeGreaterThanOrEqual(567 - 1e-6);
  });
});

describe("projectMirrored", () => {
  const rect = coverRect(640, 480, 800, 600); // exact fill

  it("flips x so the left of the video appears on the right of the stage", () => {
    const left = projectMirrored(0, 0.5, rect, 800);
    const right = projectMirrored(1, 0.5, rect, 800);
    expect(left.x).toBeCloseTo(800);
    expect(right.x).toBeCloseTo(0);
  });

  it("maps the center to the center and does not flip y", () => {
    const c = projectMirrored(0.5, 0.5, rect, 800);
    expect(c.x).toBeCloseTo(400);
    expect(c.y).toBeCloseTo(300);
    const top = projectMirrored(0.5, 0, rect, 800);
    expect(top.y).toBeCloseTo(0);
  });
});
