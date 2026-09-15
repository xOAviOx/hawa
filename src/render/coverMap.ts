/**
 * coverMap.ts — pure geometry for fitting the camera into the stage.
 *
 * "Cover" scales the video to fill the stage (cropping the overflow), like
 * CSS `object-fit: cover`. We also mirror horizontally so the display behaves
 * like a real mirror. Kept dependency-free so it's unit-testable.
 */

export interface CoverRect {
  offX: number;
  offY: number;
  drawW: number;
  drawH: number;
}

/** Rectangle (in stage CSS px) into which the video is drawn, cover-cropped. */
export function coverRect(
  videoW: number,
  videoH: number,
  cssW: number,
  cssH: number,
): CoverRect {
  if (!videoW || !videoH) return { offX: 0, offY: 0, drawW: 0, drawH: 0 };
  const scale = Math.max(cssW / videoW, cssH / videoH);
  const drawW = videoW * scale;
  const drawH = videoH * scale;
  return { offX: (cssW - drawW) / 2, offY: (cssH - drawH) / 2, drawW, drawH };
}

/**
 * Map a normalized landmark (x,y in [0,1] of the unmirrored video) to a
 * mirrored stage pixel. `cssW` is the stage width used for the horizontal flip.
 */
export function projectMirrored(
  nx: number,
  ny: number,
  rect: CoverRect,
  cssW: number,
): { x: number; y: number } {
  const sx = rect.offX + nx * rect.drawW;
  return { x: cssW - sx, y: rect.offY + ny * rect.drawH };
}
