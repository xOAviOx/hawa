/**
 * spectrum.ts — subtle waveform strip along the bottom, from a Tone Analyser.
 */

import { CONFIG } from "../config";
import type { Stage } from "./stage";

export function drawSpectrum(stage: Stage, wave: Float32Array | null): void {
  if (!wave || wave.length === 0) return;
  const { ctx, cssW, cssH } = stage;
  const stripH = Math.min(120, cssH * 0.16);
  const midY = cssH - stripH / 2;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = CONFIG.colors.right;
  ctx.shadowColor = CONFIG.colors.right;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  const step = cssW / (wave.length - 1);
  for (let i = 0; i < wave.length; i++) {
    const x = i * step;
    const y = midY + wave[i]! * (stripH / 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}
