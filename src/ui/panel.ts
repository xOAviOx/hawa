/**
 * panel.ts — collapsible glassmorphism settings panel.
 *
 * Binds controls to state.settings, persists on change, and notifies the app of
 * changes that need side effects (mode switch, BPM, FX wet levels). Settings the
 * modes read live each frame (key/scale/labels/preset/octave) only need to be
 * written to state + saved.
 */

import { CONFIG } from "../config";
import { state, saveSettings, type ModeName } from "../state";
import { ROOTS, SCALES } from "../audio/scales";
import { PRESETS } from "../audio/presets";

export interface PanelHooks {
  onModeChange: (mode: ModeName) => void;
  onBpm: (bpm: number) => void;
  onReverb: (wet: number) => void;
  onDelay: (wet: number) => void;
  onDelayDivision: (note: string) => void;
  onDistortion: (wet: number) => void;
  onCrush: (wet: number) => void;
  onPhaser: (wet: number) => void;
  onSwing: (amount: number) => void;
}

export class Panel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly syncers: Array<() => void> = [];

  constructor(private readonly hooks: PanelHooks) {
    this.root = document.createElement("aside");
    this.root.className = "panel";
    this.root.innerHTML = `
      <div class="panel-head">
        <span class="panel-title">HAWA</span>
        <button class="panel-close" title="Close (P)">×</button>
      </div>
      <div class="panel-body"></div>
      <div class="panel-hint">M mode · H camera · D debug · P panel</div>`;
    this.body = this.root.querySelector(".panel-body") as HTMLElement;

    const toggle = document.createElement("button");
    toggle.className = "panel-fab";
    toggle.title = "Settings (P)";
    toggle.textContent = "⚙";
    toggle.addEventListener("click", () => this.toggle());
    this.root.querySelector(".panel-close")!.addEventListener("click", () => this.toggle());

    document.getElementById("app")!.append(toggle, this.root);
    this.build();
    this.sync();
  }

  toggle(force?: boolean): void {
    state.panelOpen = force ?? !state.panelOpen;
    this.root.classList.toggle("open", state.panelOpen);
  }

  /** Refresh all controls from current state (after M/H/D shortcuts). */
  sync(): void {
    for (const s of this.syncers) s();
  }

  private build(): void {
    const s = state.settings;

    this.select("Mode", [
      { value: "scale", label: "Scale" },
      { value: "theremin", label: "Theremin" },
      { value: "drums", label: "Air Drums" },
    ], () => s.mode, (v) => {
      this.hooks.onModeChange(v as ModeName);
    });

    this.select(
      "Key",
      ROOTS.map((r, i) => ({ value: String(i), label: r.name })),
      () => String(s.key),
      (v) => { s.key = Number(v); saveSettings(); },
    );

    this.select(
      "Scale",
      Object.values(SCALES).map((d) => ({ value: d.key, label: d.label })),
      () => s.scale,
      (v) => { s.scale = v; saveSettings(); },
    );

    this.select("Labels", [
      { value: "western", label: "Western (C D E)" },
      { value: "sargam", label: "Sargam (Sa Re Ga)" },
    ], () => s.labelStyle, (v) => { s.labelStyle = v as typeof s.labelStyle; saveSettings(); });

    this.select(
      "Preset",
      PRESETS.map((p) => ({ value: p.name, label: p.label })),
      () => s.preset,
      (v) => { s.preset = v as typeof s.preset; saveSettings(); },
    );

    this.range("Octave range", 1, 4, 1, () => s.octaveRange, (v) => { s.octaveRange = v; saveSettings(); });
    this.range("BPM", 40, 180, 1, () => s.bpm, (v) => { s.bpm = v; saveSettings(); this.hooks.onBpm(v); });
    this.range("Swing", 0, 0.75, 0.01, () => s.swing, (v) => { s.swing = v; saveSettings(); this.hooks.onSwing(v); });
    this.range("Reverb", 0, 1, 0.01, () => s.reverbWet, (v) => { s.reverbWet = v; saveSettings(); this.hooks.onReverb(v); });
    this.range("Delay", 0, 1, 0.01, () => s.delayWet, (v) => { s.delayWet = v; saveSettings(); this.hooks.onDelay(v); });
    this.select(
      "Delay time",
      CONFIG.audio.delayDivisions.map((d) => ({ value: d.value, label: d.label })),
      () => s.delayDivision,
      (v) => { s.delayDivision = v; saveSettings(); this.hooks.onDelayDivision(v); },
    );
    this.range("Distortion", 0, 1, 0.01, () => s.distortionWet, (v) => { s.distortionWet = v; saveSettings(); this.hooks.onDistortion(v); });
    this.range("Bitcrush", 0, 1, 0.01, () => s.crushWet, (v) => { s.crushWet = v; saveSettings(); this.hooks.onCrush(v); });
    this.range("Phaser", 0, 1, 0.01, () => s.phaserWet, (v) => { s.phaserWet = v; saveSettings(); this.hooks.onPhaser(v); });
    this.range("Theremin snap", 0, 1, 0.01, () => s.thereminSnap, (v) => { s.thereminSnap = v; saveSettings(); });

    this.check("Show camera", () => state.showCamera, (v) => { state.showCamera = v; });
    this.check("Swap hands", () => s.swapHands, (v) => { s.swapHands = v; saveSettings(); });
    this.check("Reel mode (9:16)", () => s.reelMode, (v) => { s.reelMode = v; saveSettings(); });
    this.text("Watermark", () => s.watermark, (v) => { s.watermark = v; saveSettings(); });
    this.check("Metronome", () => s.metronome, (v) => { s.metronome = v; saveSettings(); });
    this.check("Debug overlay", () => state.showDebug, (v) => { state.showDebug = v; });
  }

  // ---- control builders ----------------------------------------------------

  private row(label: string): HTMLElement {
    const row = document.createElement("label");
    row.className = "panel-row";
    const span = document.createElement("span");
    span.className = "panel-label";
    span.textContent = label;
    row.append(span);
    this.body.append(row);
    return row;
  }

  private select(
    label: string,
    options: { value: string; label: string }[],
    get: () => string,
    set: (v: string) => void,
  ): void {
    const row = this.row(label);
    const el = document.createElement("select");
    el.className = "panel-select";
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      el.append(opt);
    }
    el.addEventListener("change", () => set(el.value));
    row.append(el);
    this.syncers.push(() => (el.value = get()));
  }

  private range(
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
  ): void {
    const row = this.row(label);
    const el = document.createElement("input");
    el.type = "range";
    el.className = "panel-range";
    el.min = String(min);
    el.max = String(max);
    el.step = String(step);
    el.addEventListener("input", () => set(Number(el.value)));
    row.append(el);
    this.syncers.push(() => (el.value = String(get())));
  }

  private text(label: string, get: () => string, set: (v: string) => void): void {
    const row = this.row(label);
    const el = document.createElement("input");
    el.type = "text";
    el.className = "panel-select";
    el.placeholder = "@yourname";
    el.maxLength = 24;
    el.addEventListener("input", () => set(el.value));
    row.append(el);
    this.syncers.push(() => (el.value = get()));
  }

  private check(label: string, get: () => boolean, set: (v: boolean) => void): void {
    const row = this.row(label);
    row.classList.add("panel-row--check");
    const el = document.createElement("input");
    el.type = "checkbox";
    el.className = "panel-check";
    el.addEventListener("change", () => set(el.checked));
    row.append(el);
    this.syncers.push(() => (el.checked = get()));
  }
}
