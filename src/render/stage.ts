/**
 * stage.ts — the canvas surface.
 *
 * Owns sizing (device-pixel-ratio aware), the mirrored "cover" mapping from
 * normalized landmark coordinates to screen pixels, and drawing the dimmed,
 * mirrored camera feed. Everything is drawn in CSS pixels; we bake the DPR into
 * the transform once per frame so the rest of the code stays resolution-free.
 *
 * The display is mirrored like a real mirror: the raw video and all landmark
 * coordinates are flipped horizontally here, consistently, so they stay aligned.
 */

import { CONFIG } from "../config";
import { coverRect, projectMirrored, type CoverRect } from "./coverMap";

export interface Point {
  x: number;
  y: number;
}

export class Stage {
  readonly ctx: CanvasRenderingContext2D;
  /** Logical (CSS pixel) size of the stage. */
  cssW = 0;
  cssH = 0;
  private dpr = 1;
  private reel = false;

  // Cover-crop mapping of the video into the stage (recomputed as needed).
  private videoW = 0;
  private videoH = 0;
  private cover: CoverRect = { offX: 0, offY: 0, drawW: 0, drawH: 0 };

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /** Switch between the full-window stage and a fixed 9:16 reel stage. */
  setReel(on: boolean): void {
    if (on === this.reel) return;
    this.reel = on;
    this.resize();
  }

  /** Match backing store to the viewport (or the fixed reel resolution). */
  resize(): void {
    const st = this.canvas.style;
    if (this.reel) {
      // Fixed 1080x1920 backing store, centered + letterboxed to fit on screen.
      const W = CONFIG.reel.width;
      const H = CONFIG.reel.height;
      this.dpr = 1;
      this.cssW = W;
      this.cssH = H;
      this.canvas.width = W;
      this.canvas.height = H;
      const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
      const dw = W * scale;
      const dh = H * scale;
      st.width = `${dw}px`;
      st.height = `${dh}px`;
      st.left = `${(window.innerWidth - dw) / 2}px`;
      st.top = `${(window.innerHeight - dh) / 2}px`;
      st.right = "auto";
      st.bottom = "auto";
    } else {
      st.width = st.height = st.left = st.top = st.right = st.bottom = "";
      this.dpr = Math.min(window.devicePixelRatio || 1, 2); // cap DPR for perf
      this.cssW = this.canvas.clientWidth || window.innerWidth;
      this.cssH = this.canvas.clientHeight || window.innerHeight;
      this.canvas.width = Math.round(this.cssW * this.dpr);
      this.canvas.height = Math.round(this.cssH * this.dpr);
    }
    this.recomputeCover();
  }

  /** Recompute the cover-crop rectangle for the current video + stage size. */
  private recomputeCover(): void {
    this.cover = coverRect(this.videoW, this.videoH, this.cssW, this.cssH);
  }

  /** Begin a frame: reset transform (bake DPR) and paint the dark background. */
  beginFrame(): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 0, 0, this.cssH);
    g.addColorStop(0, "#0a0d18");
    g.addColorStop(1, CONFIG.colors.background);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  /** Draw the mirrored, dimmed camera feed (if enabled). */
  drawFeed(video: HTMLVideoElement, show: boolean): void {
    if (video.videoWidth && video.videoWidth !== this.videoW) {
      this.videoW = video.videoWidth;
      this.videoH = video.videoHeight;
      this.recomputeCover();
    }
    if (!show || !this.cover.drawW) return;
    const { ctx, cover } = this;
    ctx.save();
    ctx.globalAlpha = CONFIG.feed.opacity;
    ctx.translate(this.cssW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, cover.offX, cover.offY, cover.drawW, cover.drawH);
    ctx.restore();
  }

  /** Map a normalized landmark (unmirrored video space) to mirrored screen px. */
  project(nx: number, ny: number): Point {
    return projectMirrored(nx, ny, this.cover, this.cssW);
  }
}
