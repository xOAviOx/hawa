/**
 * hud.ts — on-canvas overlays that SHOULD appear in recordings:
 * the watermark (reel mode) and the loop-progress ring.
 */

import { CONFIG } from "../config";
import type { Looper } from "../looper/looper";
import type { Stage } from "./stage";

export function drawWatermark(stage: Stage, text: string): void {
  if (!text) return;
  const { ctx, cssW, cssH } = stage;
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = `700 ${CONFIG.reel.watermarkSize}px -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 8;
  ctx.fillText(text, cssW / 2, cssH - 60);
  ctx.restore();
}

export function drawLoopRing(stage: Stage, looper: Looper): void {
  if (!looper.isActive) return;
  const { ctx, cssH } = stage;
  const cx = 56;
  const cy = cssH - 120;
  const r = 22;
  const recording = looper.isRecording || looper.isCountingIn;
  const color = recording ? "#ff4d5e" : CONFIG.colors.right;

  ctx.save();
  // Track.
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Progress.
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + looper.progress * Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Layer count in the middle.
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 18px ui-monospace, monospace`;
  ctx.fillText(String(looper.layerCount), cx, cy);
  ctx.restore();
}
