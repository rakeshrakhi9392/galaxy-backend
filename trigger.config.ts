import { ffmpeg } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_zwgmbwklrosaogufqiqg",
  runtime: "node",
  // Keep generous for local/dev; media utility nodes can take a while.
  maxDuration: 300,
  // Auto-discover tasks from this directory.
  dirs: ["src/trigger"],
  build: {
    // Keep static binaries out of the esbuild bundle so paths resolve to
    // node_modules at runtime (bundling rewrites paths into .trigger/tmp without
    // copying the executables → spawn ENOENT).
    external: ["ffmpeg-static", "ffprobe-static"],
    // Install system FFmpeg in deployed workers and set 
    // Local `trigger dev` uses ffmpeg-static via the resolver in lib/ffmpeg/binaries.ts.
    extensions: [ffmpeg({ version: "7" })],
  },
});