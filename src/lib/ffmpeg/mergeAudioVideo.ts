import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { MergeAvInput } from "@galaxy/schemas";
import { resolveFfmpegBinary } from "./binaries";
import { downloadToFile, hostGeneratedFile } from "./common";

const execFileAsync = promisify(execFile);

export async function mergeAudioVideoWithFfmpeg(
  input: MergeAvInput,
): Promise<{ video_url: string }> {
  const videoUrl = input.video_url;
  const audioUrl = input.audio_url;
  if (!videoUrl) {
    throw new Error("A video URL is required.");
  }
  if (!audioUrl) {
    throw new Error("An audio URL is required.");
  }

  const jobId = randomUUID();
  const workDir = join(process.cwd(), "public", "generated", jobId);
  await mkdir(workDir, { recursive: true });

  const videoPath = join(workDir, "input-video.mp4");
  const audioPath = join(workDir, "input-audio");
  const outputPath = join(workDir, "merged.mp4");

  await downloadToFile(videoUrl, videoPath, "video_url");
  await downloadToFile(audioUrl, audioPath, "audio_url");

  const volume = input.audio_volume ?? 1;
  const args = ["-y", "-i", videoPath, "-i", audioPath];

  if (volume === 1) {
    args.push("-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-shortest", outputPath);
  } else {
    args.push(
      "-filter_complex",
      `[1:a]volume=${volume}[aout]`,
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      outputPath,
    );
  }

  await execFileAsync(resolveFfmpegBinary(), args);

  const filename = "merged.mp4";
  const video_url = await hostGeneratedFile({
    filePath: outputPath,
    filename,
    mimeType: "video/mp4",
  });

  return { video_url };
}
