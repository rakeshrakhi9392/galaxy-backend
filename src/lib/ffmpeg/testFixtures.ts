import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolveFfmpegBinary } from "./binaries";

const execFileAsync = promisify(execFile);

export type TestVideoOptions = {
  width?: number;
  height?: number;
  durationSec?: number;
  withAudio?: boolean;
  color?: string;
};

export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync(resolveFfmpegBinary(), ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function createTestVideo(outputPath: string, options: TestVideoOptions = {}): Promise<void> {
  const width = options.width ?? 320;
  const height = options.height ?? 240;
  const durationSec = options.durationSec ?? 1;
  const withAudio = options.withAudio ?? true;
  const color = options.color ?? "red";

  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=${width}x${height}:d=${durationSec}`,
  ];

  if (withAudio) {
    args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${durationSec}`);
  }

  args.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p");

  if (withAudio) {
    args.push("-c:a", "aac", "-shortest");
  } else {
    args.push("-an");
  }

  args.push(outputPath);
  await execFileAsync(resolveFfmpegBinary(), args);
}

export async function createTestVideoDir(prefix: string): Promise<string> {
  const dir = join(process.cwd(), "public", "generated", `test-${prefix}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}
