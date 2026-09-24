/**
 * transport.ts — bottom control bar: record (with 3-2-1 countdown), reel toggle,
 * and looper controls (record layer / undo / clear / metronome).
 *
 * The red dot + timer live in the DOM (never drawn on the canvas), so they show
 * in the UI but not in the recorded frame.
 */

import { CONFIG } from "../config";
import { state, saveSettings } from "../state";
import type { Recorder } from "../record/recorder";
import type { Looper } from "../looper/looper";

export interface TransportHooks {
  onReelToggle: (on: boolean) => void;
  onPanelSync: () => void;
}

export class Transport {
  private readonly recBtn: HTMLButtonElement;
  private readonly reelBtn: HTMLButtonElement;
  private readonly loopBtn: HTMLButtonElement;
  private readonly metroBtn: HTMLButtonElement;
  private readonly countdownEl: HTMLElement;
  private readonly indicatorEl: HTMLElement;
  private readonly timeEl: HTMLElement;

  private counting = false;
  private countdownTimer: number | null = null;
  private recStart = 0;

  constructor(
    private readonly recorder: Recorder,
    private readonly looper: Looper,
    private readonly hooks: TransportHooks,
  ) {
    const bar = document.createElement("div");
    bar.className = "transport";
    bar.innerHTML = `
      <button class="tp-btn tp-rec" title="Record (R)"><span class="tp-dot"></span>REC</button>
      <button class="tp-btn tp-reel" title="Reel 9:16">REEL</button>
      <button class="tp-btn tp-loop" title="Loop layer (L)">LOOP</button>
      <button class="tp-btn tp-undo" title="Undo layer">UNDO</button>
      <button class="tp-btn tp-clear" title="Clear loops">CLEAR</button>
      <button class="tp-btn tp-metro" title="Metronome">MET</button>`;

    this.countdownEl = document.createElement("div");
    this.countdownEl.className = "countdown hidden";

    this.indicatorEl = document.createElement("div");
    this.indicatorEl.className = "rec-indicator hidden";
    this.indicatorEl.innerHTML = `<span class="rec-blink"></span><span class="rec-time">0:00</span>`;
    this.timeEl = this.indicatorEl.querySelector(".rec-time") as HTMLElement;

    const app = document.getElementById("app")!;
    app.append(bar, this.countdownEl, this.indicatorEl);

    this.recBtn = bar.querySelector(".tp-rec") as HTMLButtonElement;
    this.reelBtn = bar.querySelector(".tp-reel") as HTMLButtonElement;
    this.loopBtn = bar.querySelector(".tp-loop") as HTMLButtonElement;
    this.metroBtn = bar.querySelector(".tp-metro") as HTMLButtonElement;

    this.recBtn.addEventListener("click", () => this.toggleRecord());
    this.reelBtn.addEventListener("click", () => this.toggleReel());
    this.loopBtn.addEventListener("click", () => this.looper.toggleRecord(performance.now()));
    (bar.querySelector(".tp-undo") as HTMLButtonElement).addEventListener("click", () => this.looper.undo());
    (bar.querySelector(".tp-clear") as HTMLButtonElement).addEventListener("click", () => this.looper.clear());
    this.metroBtn.addEventListener("click", () => this.toggleMetronome());
  }

  // ---- Recording -----------------------------------------------------------

  /** R key / button: start the countdown, or stop an in-progress recording. */
  toggleRecord(): void {
    if (this.recorder.isRecording) {
      this.stopRecord();
      return;
    }
    if (this.counting) {
      this.cancelCountdown();
      return;
    }
    this.startCountdown();
  }

  private startCountdown(): void {
    this.counting = true;
    let n = CONFIG.record.countdown;
    this.showCountdown(n);
    this.countdownTimer = window.setInterval(() => {
      n -= 1;
      if (n > 0) {
        this.showCountdown(n);
      } else {
        this.clearCountdownTimer();
        this.countdownEl.classList.add("hidden");
        this.counting = false;
        this.beginRecord();
      }
    }, 1000);
  }

  private cancelCountdown(): void {
    this.clearCountdownTimer();
    this.counting = false;
    this.countdownEl.classList.add("hidden");
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private showCountdown(n: number): void {
    this.countdownEl.textContent = String(n);
    this.countdownEl.classList.remove("hidden");
    // retrigger the pop animation
    this.countdownEl.style.animation = "none";
    void this.countdownEl.offsetWidth;
    this.countdownEl.style.animation = "";
  }

  private beginRecord(): void {
    if (this.recorder.start()) {
      state.recording = true;
      this.recStart = performance.now();
      this.indicatorEl.classList.remove("hidden");
      this.recBtn.classList.add("active");
    }
  }

  private stopRecord(): void {
    this.recorder.stop();
    state.recording = false;
    this.indicatorEl.classList.add("hidden");
    this.recBtn.classList.remove("active");
  }

  // ---- Toggles -------------------------------------------------------------

  private toggleReel(): void {
    state.settings.reelMode = !state.settings.reelMode;
    saveSettings();
    this.reelBtn.classList.toggle("active", state.settings.reelMode);
    this.hooks.onReelToggle(state.settings.reelMode);
    this.hooks.onPanelSync();
  }

  private toggleMetronome(): void {
    state.settings.metronome = !state.settings.metronome;
    saveSettings();
    this.metroBtn.classList.toggle("active", state.settings.metronome);
  }

  /** Called each frame to refresh timer + button states. */
  update(): void {
    if (state.recording) {
      const s = Math.floor((performance.now() - this.recStart) / 1000);
      this.timeEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    this.reelBtn.classList.toggle("active", state.settings.reelMode);
    this.metroBtn.classList.toggle("active", state.settings.metronome);
    this.loopBtn.classList.toggle("active", this.looper.isRecording || this.looper.isCountingIn);
    this.loopBtn.textContent = this.looper.layerCount > 0 ? `LOOP ${this.looper.layerCount}` : "LOOP";
  }
}
