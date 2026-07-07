import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtractAudioFormat, ExtractAudioInput } from "@galaxy/schemas";
import { resolveFfmpegBinary } from "./binaries";
import { downloadToFile, hostGeneratedFile, MediaInputError } from "./common";
import { probeMedia } from "./probe";

const execFileAsync = promisify(execFile);

const FORMAT_ARGS: Record<ExtractAudioFormat, string[]> = {
  mp3: ["-vn", "-acodec", "libmp3lame", "-q:a", "2"],
  wav: ["-vn", "-acodec", "pcm_s16le"],
  aac: ["-vn", "-acodec", "aac", "-b:a", "192k"],
};

function isNoAudioStreamError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("output file does not contain any stream") ||
    lower.includes("does not contain any stream") ||
    lower.includes("stream map '0:a") ||
    lower.includes("matches no streams")
  );
}

export async function extractAudioWithFfmpeg(
  input: ExtractAudioInput,
): Promise<{ audio_url: string }> {
  const videoUrl = input.video_url;
  if (!videoUrl) {
    throw new MediaInputError("A video URL is required.");
  }

  const format = input.format ?? "mp3";
  const jobId = randomUUID();
  const workDir = join(process.cwd(), "public", "generated", jobId);
  await mkdir(workDir, { recursive: true });

  const videoPath = join(workDir, "input-video");
  const outputPath = join(workDir, `extracted.${format}`);

  await downloadToFile(videoUrl, videoPath, "video_url");

  const probe = await probeMedia(videoPath);
  if (!probe.hasAudio) {
    throw new MediaInputError(
      "video_url has no audio track, so audio cannot be extracted. " +
        "Use a video that includes sound, or upload a separate audio file into Merge Audio & Video.",
    );
  }

  const args = ["-y", "-i", videoPath, ...FORMAT_ARGS[format], outputPath];
  try {
    await execFileAsync(resolveFfmpegBinary(), args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isNoAudioStreamError(message)) {
      throw new MediaInputError(
        "video_url has no audio track, so audio cannot be extracted. " +
          "Use a video that includes sound, or upload a separate audio file into Merge Audio & Video.",
      );
    }
    throw error;
  }

  const filename = `extracted.${format}`;
  const audio_url = await hostGeneratedFile({
    filePath: outputPath,
    filename,
  });

  return { audio_url };
}
