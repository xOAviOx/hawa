/**
 * handTracker.ts — camera + MediaPipe HandLandmarker plumbing.
 *
 * Responsibilities:
 *  - Acquire the webcam (front camera), with clear errors for the caller.
 *  - Create a HandLandmarker in VIDEO mode, GPU delegate with CPU fallback.
 *  - Run detection ONLY on new camera frames (requestVideoFrameCallback, with a
 *    requestAnimationFrame fallback) and publish results into shared state.
 *
 * Rendering is intentionally elsewhere: this file never touches the canvas.
 */

import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { CONFIG } from "../config";
import { state } from "../state";
import type { Handedness, RawHand } from "./types";

/** Resolve a /public asset path honoring Vite's base URL (works on subpaths). */
function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

/** Thrown by startCamera with a user-friendly reason. */
export class CameraError extends Error {
  constructor(
    message: string,
    readonly kind: "denied" | "notfound" | "insecure" | "unknown",
  ) {
    super(message);
    this.name = "CameraError";
  }
}

/** Acquire the webcam and return a playing (hidden) <video> element. */
export async function startCamera(): Promise<HTMLVideoElement> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(
      "Camera needs a secure context (https:// or localhost).",
      "insecure",
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: CONFIG.camera.facingMode,
        width: { ideal: CONFIG.camera.width },
        height: { ideal: CONFIG.camera.height },
        frameRate: { ideal: CONFIG.camera.frameRate },
      },
    });
  } catch (err) {
    const name = (err as DOMException)?.name ?? "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new CameraError(
        "Camera permission was denied. Allow it in your browser and reload.",
        "denied",
      );
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new CameraError("No camera was found on this device.", "notfound");
    }
    throw new CameraError(`Could not start the camera (${name || "unknown"}).`, "unknown");
  }

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  // Wait for real dimensions before we hand it to the detector/renderer.
  await new Promise<void>((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
  await video.play();
  return video;
}

/** Create a HandLandmarker, trying GPU first and falling back to CPU. */
export async function createHandLandmarker(): Promise<{
  landmarker: HandLandmarker;
  delegate: "GPU" | "CPU";
}> {
  const fileset = await FilesetResolver.forVisionTasks(asset(CONFIG.vision.wasmBasePath));

  const options = (delegate: "GPU" | "CPU") =>
    ({
      baseOptions: {
        modelAssetPath: asset(CONFIG.vision.modelAssetPath),
        delegate,
      },
      runningMode: "VIDEO" as const,
      numHands: CONFIG.vision.numHands,
      minHandDetectionConfidence: CONFIG.vision.minHandDetectionConfidence,
      minHandPresenceConfidence: CONFIG.vision.minHandPresenceConfidence,
      minTrackingConfidence: CONFIG.vision.minTrackingConfidence,
    }) as const;

  if (CONFIG.vision.delegate === "GPU") {
    try {
      const landmarker = await HandLandmarker.createFromOptions(fileset, options("GPU"));
      return { landmarker, delegate: "GPU" };
    } catch (err) {
      console.warn("[hawa] GPU delegate failed, falling back to CPU:", err);
    }
  }
  const landmarker = await HandLandmarker.createFromOptions(fileset, options("CPU"));
  return { landmarker, delegate: "CPU" };
}

/** Convert a raw MediaPipe result into RawHand[] (label as reported). */
function toRawHands(result: HandLandmarkerResult): RawHand[] {
  const hands: RawHand[] = [];
  for (let i = 0; i < result.landmarks.length; i++) {
    const landmarks = result.landmarks[i];
    const cat = result.handedness[i]?.[0];
    if (!landmarks || !cat) continue;
    hands.push({
      handedness: (cat.categoryName as Handedness) ?? "Right",
      score: cat.score,
      landmarks: landmarks as RawHand["landmarks"],
    });
  }
  return hands;
}

/** Callback invoked once per detected frame with raw hands + timestamp (ms). */
export type OnHands = (hands: RawHand[], tsMs: number) => void;

/**
 * Drives detection off the camera's own frame cadence. Passes raw hands to the
 * provided callback and updates detection metrics. Call stop() to end.
 */
export class DetectionLoop {
  private running = false;
  private lastTs = 0;
  private frames = 0;
  private windowStart = 0;

  constructor(
    private readonly landmarker: HandLandmarker,
    private readonly video: HTMLVideoElement,
    private readonly onHands: OnHands,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.windowStart = performance.now();

    // Prefer requestVideoFrameCallback so we detect exactly once per new frame.
    const hasRVFC = typeof (this.video as any).requestVideoFrameCallback === "function";
    if (hasRVFC) {
      const step = () => {
        if (!this.running) return;
        this.detectOnce();
        (this.video as any).requestVideoFrameCallback(step);
      };
      (this.video as any).requestVideoFrameCallback(step);
    } else {
      const step = () => {
        if (!this.running) return;
        this.detectOnce();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  stop(): void {
    this.running = false;
  }

  private detectOnce(): void {
    // detectForVideo requires strictly increasing timestamps (ms).
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;

    const t0 = performance.now();
    let result: HandLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(this.video, ts);
    } catch (err) {
      console.error("[hawa] detectForVideo failed:", err);
      return;
    }
    const dt = performance.now() - t0;

    this.onHands(toRawHands(result), ts);

    // Metrics: exponential-ish smoothing on ms, windowed fps.
    const m = state.metrics;
    m.detectMs = m.detectMs === 0 ? dt : m.detectMs * 0.9 + dt * 0.1;
    this.frames++;
    const elapsed = performance.now() - this.windowStart;
    if (elapsed >= 500) {
      m.detectFps = (this.frames * 1000) / elapsed;
      this.frames = 0;
      this.windowStart = performance.now();
    }
  }
}
