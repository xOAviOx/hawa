/**
 * main.ts — app entry point (Phase 3).
 *
 * Start gate → (camera + HandLandmarker) OR sim → two loops:
 *   - detection loop → camera frames → pipeline (smoothing + gestures)
 *   - render loop    → display refresh → active mode update (audio) + drawing
 *
 * Draw order (back → front): base gradient, aurora, camera feed, lanes,
 * skeleton, FX (trail/particles/shockwaves/note pop), spectrum, pinch marker.
 */

import "@fontsource-variable/space-grotesk";
import "./styles.css";
import { CONFIG } from "./config";
import { state, saveSettings, type ModeName } from "./state";
import { createHandLandmarker, startCamera, DetectionLoop, CameraError } from "./vision/handTracker";
import { HandPipeline } from "./vision/pipeline";
import { Stage } from "./render/stage";
import { drawSkeletons } from "./render/skeleton";
import { drawLanes } from "./render/lanes";
import { drawAurora } from "./render/aurora";
import { drawSpectrum } from "./render/spectrum";
import { drawWatermark, drawLoopRing } from "./render/hud";
import { Effects } from "./render/effects";
import { AudioEngine } from "./audio/engine";
import { ScaleMode } from "./modes/scale";
import { ThereminMode } from "./modes/theremin";
import { DrumsMode } from "./modes/drums";
import type { Mode } from "./modes/mode";
import { Panel } from "./ui/panel";
import { Recorder } from "./record/recorder";
import { Looper } from "./looper/looper";
import { Transport } from "./ui/transport";
import { Onboarding } from "./ui/onboarding";
import { MouseSim, simEnabled } from "./sim/mouseSim";

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const startScreen = $("start-screen");
const startBtn = $<HTMLButtonElement>("start-btn");
const startStatus = $("start-status");
const startSub = document.querySelector<HTMLElement>(".start-sub");
const debugEl = $("debug");
const canvas = $<HTMLCanvasElement>("stage");

const stage = new Stage(canvas);
const pipeline = new HandPipeline();
const engine = new AudioEngine();
const effects = new Effects();

state.sim = simEnabled();
let modes: Record<ModeName, Mode> | null = null;
let active: Mode | null = null;
let panel: Panel | null = null;
let looper: Looper | null = null;
let transport: Transport | null = null;
let sim: MouseSim | null = null;
let video: HTMLVideoElement | null = null;

if (state.sim && startSub) {
  startSub.textContent = "simulation mode — mouse = pinch, keys 0–5 = chord fingers";
}

// ---- Mode management -------------------------------------------------------

function setMode(name: ModeName): void {
  if (!modes) return;
  if (active === modes[name]) return;
  active?.exit();
  active = modes[name];
  state.settings.mode = name;
  active.enter();
  saveSettings();
  panel?.sync();
}

function cycleMode(): void {
  const order: ModeName[] = ["scale", "theremin", "drums"];
  const next = order[(order.indexOf(state.settings.mode) + 1) % order.length]!;
  setMode(next);
}

// ---- Render loop -----------------------------------------------------------

let renderFrames = 0;
let renderWindowStart = performance.now();

function renderLoop(): void {
  const now = performance.now();
  if (sim) sim.update();
  active?.update();

  // Tap live musical events for the looper (modes already played them live),
  // then clear. Visual events are drained separately below.
  if (looper) {
    for (const ev of state.audioEvents) if (looper.isRecording) looper.record(ev, now);
    looper.update(now);
  }
  state.audioEvents.length = 0;

  drainEvents();

  // Reel mode: switch stage geometry + hide DOM chrome.
  stage.setReel(state.settings.reelMode);
  document.body.classList.toggle("reel", state.settings.reelMode);

  stage.beginFrame();
  drawAurora(stage);
  if (video) stage.drawFeed(video, state.showCamera);
  if (state.settings.mode === "scale") drawLanes(stage);
  const drawn = drawSkeletons(stage, state.hands);
  state.metrics.landmarksDrawn = drawn;

  // Trail follows the melody pinch point.
  const mel = state.melodyHand;
  if (mel && mel.pinch) {
    const p = stage.project(mel.pinchPoint.x, mel.pinchPoint.y);
    effects.pushTrail(p.x, p.y);
  }
  effects.update();
  effects.draw(stage.ctx, stage.cssW);

  drawSpectrum(stage, engine.getWaveform());
  drawPinchMarker();
  if (looper) drawLoopRing(stage, looper);
  if (state.settings.reelMode) drawWatermark(stage, state.settings.watermark);

  transport?.update();

  renderFrames++;
  const elapsed = performance.now() - renderWindowStart;
  if (elapsed >= 500) {
    state.metrics.renderFps = (renderFrames * 1000) / elapsed;
    renderFrames = 0;
    renderWindowStart = performance.now();
  }

  updateDebug();
  requestAnimationFrame(renderLoop);
}

/** Convert queued semantic events into screen-space visual FX, then clear. */
function drainEvents(): void {
  for (const ev of state.events) {
    const p = stage.project(ev.nx, ev.ny);
    if (ev.type === "note") {
      effects.spawnNote(p.x, p.y, ev.pitchClass, ev.velocity, ev.label);
    } else {
      effects.spawnDrum(p.x, p.y, ev.hue, ev.velocity);
    }
  }
  state.events.length = 0;
}

function drawPinchMarker(): void {
  const hand = state.melodyHand;
  if (!hand) return;
  const p = stage.project(hand.pinchPoint.x, hand.pinchPoint.y);
  const { ctx } = stage;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = CONFIG.colors.right;
  ctx.shadowColor = CONFIG.colors.right;
  ctx.shadowBlur = hand.pinch ? 30 : 14;
  ctx.beginPath();
  ctx.arc(p.x, p.y, hand.pinch ? 12 : 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- Debug overlay ---------------------------------------------------------

let lastDebug = 0;
function updateDebug(): void {
  if (!state.showDebug) {
    if (!debugEl.classList.contains("hidden")) debugEl.classList.add("hidden");
    return;
  }
  debugEl.classList.remove("hidden");
  const now = performance.now();
  if (now - lastDebug < 200) return;
  lastDebug = now;
  const m = state.metrics;
  debugEl.textContent =
    `detect ${m.detectFps.toFixed(0)} fps · ${m.detectMs.toFixed(1)} ms\n` +
    `render ${m.renderFps.toFixed(0)} fps · landmarks ${m.landmarksDrawn}\n` +
    `mode ${state.settings.mode} · hands ${state.hands.length}${state.sim ? " · SIM" : ""}\n` +
    `delegate ${m.delegate} · lane ${state.scaleView.activeIndex ?? "-"}`;
}

// ---- Keyboard shortcuts ----------------------------------------------------

window.addEventListener("keydown", (e) => {
  if (e.repeat || !state.started) return;
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "SELECT") return; // don't hijack panel controls
  switch (e.key.toLowerCase()) {
    case "m":
      cycleMode();
      break;
    case "p":
      panel?.toggle();
      break;
    case "d":
      state.showDebug = !state.showDebug;
      panel?.sync();
      break;
    case "h":
      state.showCamera = !state.showCamera;
      panel?.sync();
      break;
    case "s":
      state.settings.swapHands = !state.settings.swapHands;
      saveSettings();
      panel?.sync();
      break;
    case "r":
      transport?.toggleRecord();
      break;
    case "l":
      looper?.toggleRecord(performance.now());
      break;
  }
});

// ---- Start flow ------------------------------------------------------------

async function start(): Promise<void> {
  startBtn.disabled = true;

  startStatus.textContent = "Starting audio…";
  try {
    await engine.start();
    engine.setBpm(state.settings.bpm);
    engine.setReverbWet(state.settings.reverbWet);
    engine.setDelayWet(state.settings.delayWet);
    engine.setDelayDivision(state.settings.delayDivision);
    engine.setDistortionWet(state.settings.distortionWet);
    engine.setCrushWet(state.settings.crushWet);
    engine.setPhaserWet(state.settings.phaserWet);
    engine.setSwing(state.settings.swing);
  } catch (err) {
    console.error(err);
    startStatus.textContent = "Could not start audio.";
    startBtn.disabled = false;
    return;
  }

  // Build modes + panel now that the audio graph exists.
  modes = {
    scale: new ScaleMode(engine),
    theremin: new ThereminMode(engine),
    drums: new DrumsMode(engine),
  };
  panel = new Panel({
    onModeChange: (m) => setMode(m),
    onBpm: (b) => engine.setBpm(b),
    onReverb: (w) => engine.setReverbWet(w),
    onDelay: (w) => engine.setDelayWet(w),
    onDelayDivision: (n) => engine.setDelayDivision(n),
    onDistortion: (w) => engine.setDistortionWet(w),
    onCrush: (w) => engine.setCrushWet(w),
    onPhaser: (w) => engine.setPhaserWet(w),
    onSwing: (a) => engine.setSwing(a),
  });

  looper = new Looper(engine);
  const recorder = new Recorder(canvas, () => engine.getRecordingTrack());
  transport = new Transport(recorder, looper, {
    onReelToggle: (on) => stage.setReel(on),
    onPanelSync: () => panel?.sync(),
  });
  new Onboarding().maybeShow();

  if (state.sim) {
    sim = new MouseSim(canvas, pipeline);
  } else {
    startStatus.textContent = "Starting camera…";
    try {
      video = await startCamera();
    } catch (err) {
      const msg = err instanceof CameraError ? err.message : "Could not access the camera.";
      startStatus.textContent = `${msg}  (Tip: add ?sim=1 to test without a camera.)`;
      startBtn.disabled = false;
      startBtn.textContent = "Try again";
      return;
    }
    startStatus.textContent = "Loading hand tracking…";
    try {
      const { landmarker, delegate } = await createHandLandmarker();
      state.metrics.delegate = delegate;
      new DetectionLoop(landmarker, video, (raw, tsMs) => pipeline.process(raw, tsMs)).start();
    } catch (err) {
      console.error(err);
      startStatus.textContent =
        "Failed to load the hand-tracking model. Did assets download? Try `npm run setup:assets`.";
      startBtn.disabled = false;
      startBtn.textContent = "Try again";
      return;
    }
  }

  state.started = true;
  active = modes[state.settings.mode];
  active.enter();
  startScreen.classList.add("hidden");
  requestAnimationFrame(renderLoop);
}

startBtn.addEventListener("click", () => void start());
