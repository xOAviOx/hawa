// Downloads the HandLandmarker model and copies the MediaPipe WASM runtime into
// /public so the app is fully offline-capable (no CDN dependency at runtime).
//
// Runs automatically on `postinstall`, and manually via `npm run setup:assets`.
// On postinstall we never hard-fail (a flaky network shouldn't break install);
// when run manually we exit non-zero on failure so you know it didn't work.

import { createWriteStream } from "node:fs";
import { mkdir, copyFile, readdir, stat, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Official Google storage for MediaPipe models (float16 variant, v1).
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const MODEL_DEST = join(ROOT, "public", "models", "hand_landmarker.task");
const WASM_SRC = join(ROOT, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const WASM_DEST = join(ROOT, "public", "mediapipe");

// npm sets this to "postinstall" when we're invoked from the install lifecycle.
const isPostinstall = process.env.npm_lifecycle_event === "postinstall";

/** True if a file/dir exists. */
async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function downloadModel() {
  if (await exists(MODEL_DEST)) {
    const s = await stat(MODEL_DEST);
    if (s.size > 0) {
      console.log(`[assets] model already present (${(s.size / 1e6).toFixed(1)} MB), skipping`);
      return;
    }
  }
  await mkdir(dirname(MODEL_DEST), { recursive: true });
  console.log(`[assets] downloading model → ${MODEL_URL}`);
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) {
    throw new Error(`model download failed: HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(MODEL_DEST));
  const s = await stat(MODEL_DEST);
  console.log(`[assets] model saved (${(s.size / 1e6).toFixed(1)} MB)`);
}

async function copyWasm() {
  if (!(await exists(WASM_SRC))) {
    throw new Error(
      `WASM source not found at ${WASM_SRC} — is @mediapipe/tasks-vision installed?`,
    );
  }
  await mkdir(WASM_DEST, { recursive: true });
  const files = await readdir(WASM_SRC);
  let copied = 0;
  for (const f of files) {
    // We only need the vision wasm/js loader files.
    if (!/\.(wasm|js)$/.test(f)) continue;
    await copyFile(join(WASM_SRC, f), join(WASM_DEST, f));
    copied++;
  }
  console.log(`[assets] copied ${copied} WASM runtime files → public/mediapipe/`);
}

async function main() {
  await mkdir(join(ROOT, "public", "models"), { recursive: true });
  await copyWasm();
  await downloadModel();
  console.log("[assets] done");
}

main().catch((err) => {
  if (isPostinstall) {
    console.warn(
      `[assets] WARNING: asset setup incomplete (${err.message}).\n` +
        `[assets] Run \`npm run setup:assets\` manually once you have network access.`,
    );
    process.exit(0); // never break `npm install`
  }
  console.error(`[assets] ERROR: ${err.message}`);
  process.exit(1);
});
