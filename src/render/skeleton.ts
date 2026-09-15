/**
 * skeleton.ts — neon hand skeleton.
 *
 * Thin glowing bones + glowing fingertip dots, one accent color per hand.
 * Uses shadowBlur for the glow and additive ("lighter") compositing so
 * overlapping strokes bloom. Reads landmark→screen mapping from the Stage.
 */

import { HandLandmarker } from "@mediapipe/tasks-vision";
import { CONFIG } from "../config";
import type { HandMetrics } from "../vision/types";
import type { Stage } from "./stage";

// The 21-point connection graph, straight from the installed library so it
// always matches the model topology.
const CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;

/** Draw all hands. Returns the number of landmarks drawn (for the debug HUD). */
export function drawSkeletons(stage: Stage, hands: HandMetrics[]): number {
  const { ctx } = stage;
  let drawn = 0;

  ctx.save();
  ctx.globalCompositeOperation = "lighter"; // additive glow
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const hand of hands) {
    const color = hand.handedness === "Left" ? CONFIG.colors.left : CONFIG.colors.right;

    // Bones.
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = CONFIG.skeleton.glow;
    ctx.lineWidth = CONFIG.skeleton.lineWidth;
    ctx.beginPath();
    for (const c of CONNECTIONS) {
      const a = hand.landmarks[c.start];
      const b = hand.landmarks[c.end];
      if (!a || !b) continue;
      const pa = stage.project(a.x, a.y);
      const pb = stage.project(b.x, b.y);
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
    }
    ctx.stroke();

    // Joints (small) + fingertips (larger, brighter).
    for (let i = 0; i < hand.landmarks.length; i++) {
      const lm = hand.landmarks[i];
      if (!lm) continue;
      const p = stage.project(lm.x, lm.y);
      const isTip = (CONFIG.skeleton.fingertips as readonly number[]).includes(i);
      ctx.beginPath();
      ctx.fillStyle = isTip ? CONFIG.colors.fingertip : color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isTip ? CONFIG.skeleton.glow * 1.5 : CONFIG.skeleton.glow;
      ctx.arc(
        p.x,
        p.y,
        isTip ? CONFIG.skeleton.fingertipRadius : CONFIG.skeleton.jointRadius,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      drawn++;
    }
  }

  ctx.restore();
  return drawn;
}
