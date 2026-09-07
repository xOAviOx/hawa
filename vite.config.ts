import { defineConfig } from "vite";

// Static SPA. Assets (model + wasm) are served from /public, so no special
// bundling is required. We keep the config minimal to stay lean.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
  },
  server: {
    host: true,
  },
});
