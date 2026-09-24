# HAWA — play music in the air with your hands 🎵✋

Turn your webcam into a musical instrument. Move your hands in front of the
camera to play melodies, hold chords, run drones, and bang out drums — with a
neon glow, particle bursts, and a one-click vertical **reel recording** mode for
sharing.

100% in the browser. **No backend, no API keys, no paid services.** Everything is
free and open-source.

- **Hand tracking:** MediaPipe Tasks Vision (`HandLandmarker`), served locally.
- **Audio:** [Tone.js](https://tonejs.github.io/) — synths + optional free Salamander piano samples.
- **Visuals:** Canvas 2D with additive neon glow + object-pooled particles.
- **Build:** Vite + TypeScript (strict), vanilla (no framework).

---

## Run locally

```bash
npm install       # also downloads the model + copies the MediaPipe WASM (postinstall)
npm run dev        # open the printed URL (use localhost or https — camera needs a secure context)
```

If the model/WASM didn't download during install (offline, flaky network), run:

```bash
npm run setup:assets
```

This fetches `hand_landmarker.task` (float16) from Google's official
`mediapipe-models` storage into `public/models/`, and copies the WASM runtime
from `node_modules/@mediapipe/tasks-vision/wasm` into `public/mediapipe/`. After
that the app runs fully offline.

### No camera? Use simulation mode

Open the app with **`?sim=1`** (e.g. `http://localhost:5173/?sim=1`):
- **Mouse** = right-hand pinch point
- **Mouse button held** = pinch
- **Number keys 0–5** = left-hand finger count (chords)

Everything is testable this way.

### Other scripts

```bash
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
npm run test       # Vitest unit tests (scales, chords, gestures, One Euro, geometry)
npm run typecheck  # tsc --noEmit
```

---

## Gesture cheat sheet

Everything is a **mirror** — move right, the on-screen hand moves right. Your
**right hand plays melody** (cyan), your **left hand plays accompaniment**
(magenta).

### 🎼 Scale mode (default — "impossible to sound bad")
| Gesture | Result |
| --- | --- |
| **Right-hand pinch** (thumb + index) | Play a note. Vertical position = pitch (low at the bottom). |
| Move up/down **while pinched** | Glide legato between notes. |
| Quick release + re-pinch | Retrigger the note. |
| Move right hand **left ↔ right** | Filter cutoff: left = dark, right = bright. |
| **Left hand: show 1–5 fingers** | Hold a chord: 1=I, 2=IV, 3=V, 4=vi, 5=ii (minor keys shift to i/iv/v/VI/VII). |
| Raise/lower left hand | Chord (or drone) volume. |
| **Left fist** | Fade out the chord/drone. |
| Pick a **raag** scale (Yaman, Bhairav, Bhupali, Kafi) | Left hand plays a **tanpura drone** (Sa + Pa) instead of chords. |

### 🎛️ Theremin mode
- **Open right hand (≥3 fingers)** = sound on; **fist** = silent.
- Right-hand height = pitch (~3 octaves, exponential) with gentle vibrato.
- Left-hand height = volume.
- **Snap-to-scale** slider: 0 = free/spooky, 1 = locked to the scale.

### 🥁 Air Drums mode
Touch your **thumb to a fingertip** to hit a drum. Hit **faster = louder**.
| Finger | Right hand | Left hand |
| --- | --- | --- |
| Index | Kick | Low tom |
| Middle | Snare | High tom |
| Ring | Closed hat | Open hat |
| Pinky | Clap | Rimshot |

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| **M** | Cycle mode (Scale → Theremin → Drums) |
| **P** | Toggle settings panel |
| **R** | Record (3-2-1 countdown → auto-download) |
| **L** | Loop: record/commit a layer |
| **H** | Hide/show camera feed |
| **D** | Debug overlay (FPS, timing) |
| **S** | Swap hands (if handedness is reversed on your setup) |

---

## Reel mode + recording

1. Toggle **REEL** (transport bar or panel) → the stage becomes a vertical
   **9:16** frame with the camera center-cropped and the editing UI hidden.
2. Set an optional **watermark** (e.g. `@yourname`) in the panel — it's drawn
   into the recorded frame.
3. Hit **REC** (or **R**): a 3-2-1 countdown, then it records the canvas + audio.
   Stop to auto-download `hawa-YYYYMMDD-HHmm.mp4` (or `.webm` if mp4 isn't
   supported by your browser's MediaRecorder).

The red dot + timer are drawn in the DOM, so they show in the UI but **not** in
the recorded video.

## Looper

Records musical **events** (not audio) and loops them so you can jam on top:
- **L** (or LOOP) → 1-bar metronome count-in, then records for 2 bars and loops.
- Up to **3 layers**. **UNDO** removes the last layer, **CLEAR** wipes all.
- The on-canvas ring shows the loop position + layer count.
- **MET** toggles the metronome.

---

## Settings

Open the panel (gear icon or **P**): mode, key, scale, note labels
(Western / Sargam), preset (Soft Pad, Pluck, Lead, Glass, 8-bit, Piano), octave
range, reverb/delay wet, BPM, reel mode, watermark, metronome, show camera,
swap hands, debug. Settings persist to `localStorage`.

---

## Free deploy

The build is a fully static site (`dist/`) — deploy anywhere for free.

### Vercel
```bash
npm i -g vercel
vercel            # follow prompts; build command: "npm run build", output: "dist"
```
Or import the repo at [vercel.com/new](https://vercel.com/new) — it auto-detects
Vite (build `npm run build`, output `dist`).

### Cloudflare Pages
Create a Pages project from your repo with:
- **Build command:** `npm run build`
- **Build output directory:** `dist`

> The model (~7.8 MB) and WASM (~11 MB) live in `public/` and are committed to the
> build output, so the deployed site is self-contained. (They're git-ignored by
> default; the `postinstall`/`setup:assets` step regenerates them on the build
> machine. If your host doesn't run `postinstall`, either commit the files or add
> `npm run setup:assets` to the build command.)

---

## Project structure

```
src/
  main.ts            orchestration + render loop
  config.ts          ALL tunable numbers
  state.ts           shared state + persisted settings
  vision/            handTracker, oneEuro, gestures, pipeline, types
  audio/             engine (FX chain), presets, scales, drums, drone
  modes/             scale, theremin, drums
  render/            stage, coverMap, skeleton, lanes, aurora, spectrum, effects, hud
  record/recorder.ts MediaRecorder capture
  looper/looper.ts   event looper
  ui/                panel, transport, onboarding
  sim/mouseSim.ts    ?sim=1 mouse/keyboard input
public/
  models/            hand_landmarker.task  (downloaded)
  mediapipe/         vision WASM runtime    (copied)
```

Tune thresholds and mappings in **`src/config.ts`** — pinch sensitivity, One Euro
smoothing, FX levels, particle counts, and more all live there.

## License

MIT. Uses MediaPipe (Apache-2.0) and Tone.js (MIT). Salamander Grand Piano
samples are hosted by Tone.js and loaded only when the Piano preset is selected.
