/**
 * lanes.ts — horizontal note lanes for SCALE mode.
 *
 * Draws one labeled lane per note in the current ladder (lowest at the bottom,
 * matching yToNoteIndex). The active lane lights up. The big floating note-name
 * "pop" and particle bursts come in Phase 3.
 */

import { CONFIG } from "../config";
import { state } from "../state";
import type { Stage } from "./stage";

export function drawLanes(stage: Stage): void {
  const { ctx, cssW, cssH } = stage;
  const labels = state.scaleView.labels;
  const n = labels.length;
  if (n === 0) return;

  const padTop = CONFIG.lanes.padTop * cssH;
  const padBottom = CONFIG.lanes.padBottom * cssH;
  const usable = cssH - padTop - padBottom;
  const laneH = usable / n;
  const active = state.scaleView.activeIndex;

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = `600 ${CONFIG.lanes.labelSize}px ui-monospace, "SF Mono", Menlo, monospace`;

  for (let i = 0; i < n; i++) {
    // Index 0 (lowest note) sits at the bottom.
    const cy = padTop + usable - (i + 0.5) * laneH;
    const isActive = i === active;

    // Lane divider line.
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = isActive ? "rgba(95,227,200,0.85)" : "rgba(255,255,255,0.07)";
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(cssW, cy);
    ctx.stroke();

    // Active band glow (additive).
    if (isActive) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(95,227,200,0.10)";
      ctx.fillRect(0, cy - laneH / 2, cssW, laneH);
    }

    // Label (left aligned).
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = isActive ? "#eafff9" : "rgba(230,236,245,0.45)";
    ctx.fillText(labels[i]!, 14, cy);
  }

  ctx.restore();
}
