/**
 * engine.ts — Tone.js context + master FX chain.
 *
 * Latency first: context is created with latencyHint "interactive" and
 * lookAhead 0; live input is always triggered at Tone.now(). Instruments connect
 * to `output` (the master filter). Signal path:
 *
 *   instruments → filter → chorus → delay → reverb → limiter → destination
 *                                                        └→ analyser (spectrum)
 *
 * The right hand controls the filter cutoff in SCALE mode; the delay is tempo-
 * synced to the Transport BPM.
 */

import * as Tone from "tone";
import { CONFIG } from "../config";

export class AudioEngine {
  private filter: Tone.Filter | null = null;
  private distortion: Tone.Distortion | null = null;
  private crusher: Tone.BitCrusher | null = null;
  private phaser: Tone.Phaser | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private reverb: Tone.Reverb | null = null;
  private limiter: Tone.Limiter | null = null;
  private analyser: Tone.Analyser | null = null;
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private delayDivision: string = CONFIG.audio.delay.note;
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;

    const ctx = new Tone.Context({ latencyHint: "interactive", lookAhead: 0 });
    Tone.setContext(ctx);
    await Tone.start();
    ctx.lookAhead = 0;

    const a = CONFIG.audio;
    this.filter = new Tone.Filter({ type: "lowpass", frequency: a.filter.max, Q: a.filter.q });
    // Color FX default to wet 0 (transparent) and are dialed in from the panel.
    this.distortion = new Tone.Distortion({ distortion: a.distortion.amount, wet: 0 });
    this.crusher = new Tone.BitCrusher(a.bitcrush.bits);
    this.crusher.wet.value = 0;
    this.phaser = new Tone.Phaser({
      frequency: a.phaser.frequency,
      octaves: a.phaser.octaves,
      baseFrequency: a.phaser.baseFrequency,
      wet: 0,
    });
    const chorus = new Tone.Chorus({
      frequency: a.chorus.frequency,
      depth: a.chorus.depth,
      wet: a.chorus.wet,
    }).start();
    this.delay = new Tone.FeedbackDelay({
      delayTime: a.delay.note,
      feedback: a.delay.feedback,
      wet: a.delay.wet,
      maxDelay: 1,
    });
    this.reverb = new Tone.Reverb({ decay: a.reverb.decay, wet: a.reverb.wet });
    this.limiter = new Tone.Limiter(a.limiter.threshold);
    this.analyser = new Tone.Analyser("waveform", 1024);

    // filter → distortion → bitcrusher → phaser → chorus → delay → reverb → limiter → destination
    this.filter.chain(
      this.distortion,
      this.crusher,
      this.phaser,
      chorus,
      this.delay,
      this.reverb,
      this.limiter,
      Tone.getDestination(),
    );
    this.limiter.connect(this.analyser);

    // Transport drives the drone Loop and keeps the delay tempo-synced.
    const transport = Tone.getTransport();
    transport.bpm.value = a.bpm;
    transport.start();

    this.started = true;
  }

  /** Master input node instruments connect to. */
  get output(): Tone.Filter {
    if (!this.filter) throw new Error("AudioEngine.start() not called yet");
    return this.filter;
  }

  get isStarted(): boolean {
    return this.started;
  }

  /** Set the master lowpass cutoff (Hz), smoothly. */
  setCutoff(freq: number): void {
    if (!this.filter) return;
    const { min, max } = CONFIG.audio.filter;
    this.filter.frequency.rampTo(Math.max(min, Math.min(max, freq)), 0.03);
  }

  setReverbWet(wet: number): void {
    if (this.reverb) this.reverb.wet.rampTo(Math.max(0, Math.min(1, wet)), 0.1);
  }

  setDelayWet(wet: number): void {
    if (this.delay) this.delay.wet.rampTo(Math.max(0, Math.min(1, wet)), 0.1);
  }

  setDistortionWet(wet: number): void {
    if (this.distortion) this.distortion.wet.rampTo(Math.max(0, Math.min(1, wet)), 0.1);
  }
  setCrushWet(wet: number): void {
    if (this.crusher) this.crusher.wet.rampTo(Math.max(0, Math.min(1, wet)), 0.1);
  }
  setPhaserWet(wet: number): void {
    if (this.phaser) this.phaser.wet.rampTo(Math.max(0, Math.min(1, wet)), 0.1);
  }

  /** Set the tempo-synced delay subdivision (Tone note value, e.g. "8n"). */
  setDelayDivision(note: string): void {
    this.delayDivision = note;
    if (this.delay) this.delay.delayTime.value = Tone.Time(note).toSeconds();
  }

  /** Transport swing (0..1) applied to 8th notes — grooves looped parts. */
  setSwing(amount: number): void {
    const t = Tone.getTransport();
    t.swing = Math.max(0, Math.min(1, amount));
    t.swingSubdivision = "8n";
  }

  /** Update BPM and re-sync the delay time to the current note division. */
  setBpm(bpm: number): void {
    Tone.getTransport().bpm.rampTo(bpm, 0.1);
    this.setDelayDivision(this.delayDivision);
  }

  /**
   * A live MediaStream audio track carrying the full master mix, for recording.
   * Created lazily and kept connected (harmless when not recording).
   */
  getRecordingTrack(): MediaStreamTrack | null {
    if (!this.limiter) return null;
    if (!this.recDest) {
      const raw = Tone.getContext().rawContext as AudioContext;
      this.recDest = raw.createMediaStreamDestination();
      this.limiter.connect(this.recDest);
    }
    return this.recDest.stream.getAudioTracks()[0] ?? null;
  }

  /** Latest waveform samples for the spectrum strip (or null before start). */
  getWaveform(): Float32Array | null {
    if (!this.analyser) return null;
    const v = this.analyser.getValue();
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }
}

/** Map a 0..1 control value to a cutoff frequency, exponentially. */
export function cutoffFromNorm(t: number): number {
  const { min, max } = CONFIG.audio.filter;
  const c = Math.max(0, Math.min(1, t));
  return min * Math.pow(max / min, c);
}
