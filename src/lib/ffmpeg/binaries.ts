import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Resolve FFmpeg / FFprobe binaries for Next.js API routes and Trigger.dev workers.
 *
 * Avoids `createRequire` so webpack/turbopack can bundle API routes without
 * "module.createRequire failed parsing argument" warnings.
 *
 * Resolution order:
 * 1. FFMPEG_PATH / FFPROBE_PATH (Trigger deploy extension)
 * 2. ffmpeg-static / ffprobe-static in node_modules (local dev)
 * 3. `ffmpeg` / `ffprobe` on PATH
 */
function pathIfExists(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  return existsSync(candidate) ? candidate : null;
}

function candidateRoots(): string[] {
  const roots = new Set<string>();
  roots.add(process.cwd());

  let dir = process.cwd();
  for (let index = 0; index < 6; index += 1) {
    if (existsSync(join(dir, "package.json"))) {
      roots.add(dir);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return [...roots];
}

function resolveFromNodeModules(relativePath: string): string | null {
  for (const root of candidateRoots()) {
    const candidate = join(root, "node_modules", relativePath);
    const found = pathIfExists(candidate);
    if (found) return found;
  }
  return null;
}

function ffmpegStaticPath(): string | null {
  const binary = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return resolveFromNodeModules(join("ffmpeg-static", binary));
}

function ffprobeStaticPath(): string | null {
  const platform =
    process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "x64" ? "x64" : process.arch;
  const binary = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  return resolveFromNodeModules(join("ffprobe-static", "bin", platform, arch, binary));
}

export function resolveFfmpegBinary(): string {
  const fromEnv = pathIfExists(process.env.FFMPEG_PATH);
  if (fromEnv) return fromEnv;

  const fromStatic = ffmpegStaticPath();
  if (fromStatic) return fromStatic;

  return "ffmpeg";
}

export function resolveFfprobeBinary(): string {
  const fromEnv = pathIfExists(process.env.FFPROBE_PATH);
  if (fromEnv) return fromEnv;

  const fromStatic = ffprobeStaticPath();
  if (fromStatic) return fromStatic;

  return "ffprobe";
}
