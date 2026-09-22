/**
 * aurora.ts — slow background wash tinted by the current chord/drone root.
 *
 * Eases hue + intensity toward their targets (set by the active mode) and paints
 * two soft additive radials. Drawn just above the base gradient, behind the feed.
 */

import { CONFIG } from "../config";
import { state } from "../state";
import type { Stage } from "./stage";

export function drawAurora(stage: Stage): void {
  const a = state.aurora;
  // Ease toward targets (hue wraps at 360).
  const k = CONFIG.aurora.lerp;
  let dh = a.targetHue - a.hue;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  a.hue = (a.hue + dh * k + 360) % 360;
  a.intensity += (a.targetIntensity - a.intensity) * k;

  if (a.intensity < 0.01) return;

  const { ctx, cssW, cssH } = stage;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const g1 = ctx.createRadialGradient(cssW * 0.3, cssH * 0.7, 0, cssW * 0.3, cssH * 0.7, cssH * 0.9);
  g1.addColorStop(0, `hsla(${a.hue}, 90%, 55%, ${a.intensity})`);
  g1.addColorStop(1, "hsla(0,0%,0%,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, cssW, cssH);

  const g2 = ctx.createRadialGradient(cssW * 0.75, cssH * 0.3, 0, cssW * 0.75, cssH * 0.3, cssH * 0.9);
  g2.addColorStop(0, `hsla(${(a.hue + 40) % 360}, 90%, 55%, ${a.intensity * 0.7})`);
  g2.addColorStop(1, "hsla(0,0%,0%,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, cssW, cssH);

  ctx.restore();
}
