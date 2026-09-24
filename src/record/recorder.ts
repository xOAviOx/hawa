/**
 * recorder.ts — MediaRecorder capture of the canvas + master audio.
 *
 * Video comes from canvas.captureStream(fps); audio from a MediaStream track the
 * engine taps off the master limiter. We prefer mp4 when supported, else webm
 * (vp9/opus). On stop we assemble the chunks and auto-download.
 */

import { CONFIG } from "../config";

type CaptureCanvas = HTMLCanvasElement & {
  captureStream(frameRate?: number): MediaStream;
};

export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mime = "";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getAudioTrack: () => MediaStreamTrack | null,
  ) {}

  get isRecording(): boolean {
    return this.rec?.state === "recording";
  }

  private pickMime(): string {
    for (const m of CONFIG.record.mimeCandidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
    }
    return "";
  }

  /** Begin recording. Returns false if unsupported or already running. */
  start(): boolean {
    if (this.isRecording) return false;
    if (typeof MediaRecorder === "undefined") return false;

    const video = (this.canvas as CaptureCanvas)
      .captureStream(CONFIG.record.fps)
      .getVideoTracks()[0];
    if (!video) return false;

    const audio = this.getAudioTrack();
    const stream = new MediaStream(audio ? [video, audio] : [video]);

    this.mime = this.pickMime();
    this.chunks = [];
    this.rec = this.mime
      ? new MediaRecorder(stream, { mimeType: this.mime })
      : new MediaRecorder(stream);
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.onstop = () => this.save();
    this.rec.start();
    return true;
  }

  stop(): void {
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    this.rec = null;
  }

  private save(): void {
    const type = this.mime || "video/webm";
    const ext = type.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(this.chunks, { type });
    this.chunks = [];
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${CONFIG.record.filenamePrefix}-${stamp()}.${ext}`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

/** Local timestamp: YYYYMMDD-HHmm. */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
