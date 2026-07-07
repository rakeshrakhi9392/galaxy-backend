import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { MergeVideoInput, MergeVideoTransition } from "@galaxy/schemas";
import { resolveFfmpegBinary } from "./binaries";
import { downloadToFile, hostGeneratedFile } from "./common";
import { probeMediaFull, type FullMediaProbeResult } from "./probe";

const execFileAsync = promisify(execFile);

const FADE_DURATION_SEC = 1;
const TARGET_AUDIO_RATE = 44_100;
const TARGET_FPS = 30;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

function xfadeTransitionName(transition: Exclude<MergeVideoTransition, "none">): string {
  return transition;
}

function resolveTargetDimensions(probes: FullMediaProbeResult[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const probe of probes) {
    width = Math.max(width, probe.width ?? 0);
    height = Math.max(height, probe.height ?? 0);
  }
  if (width <= 0 || height <= 0) {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
  return { width, height };
}

function buildVideoNormalizeFilter(
  inputIndex: number,
  outputLabel: string,
  width: number,
  height: number,
): string {
  return (
    `[${inputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${TARGET_FPS}[${outputLabel}]`
  );
}

function buildAudioNormalizeFilter(
  inputIndex: number,
  probe: FullMediaProbeResult,
  outputLabel: string,
): string {
  if (probe.hasAudio) {
    return (
      `[${inputIndex}:a]aformat=sample_fmts=fltp:channel_layouts=stereo,` +
      `aresample=${TARGET_AUDIO_RATE},asetpts=PTS-STARTPTS[${outputLabel}]`
    );
  }

  const duration = Math.max(probe.durationSec, 0.1).toFixed(3);
  return (
    `anullsrc=r=${TARGET_AUDIO_RATE}:cl=stereo,atrim=0:${duration},` +
    `asetpts=PTS-STARTPTS[${outputLabel}]`
  );
}

function buildNormalizedStreamFilters(
  probes: FullMediaProbeResult[],
  width: number,
  height: number,
): { filterParts: string[]; videoLabels: string[]; audioLabels: string[] } {
  const filterParts: string[] = [];
  const videoLabels: string[] = [];
  const audioLabels: string[] = [];

  for (let index = 0; index < probes.length; index += 1) {
    const videoLabel = `nv${index}`;
    const audioLabel = `na${index}`;
    filterParts.push(buildVideoNormalizeFilter(index, videoLabel, width, height));
    filterParts.push(buildAudioNormalizeFilter(index, probes[index]!, audioLabel));
    videoLabels.push(videoLabel);
    audioLabels.push(audioLabel);
  }

  return { filterParts, videoLabels, audioLabels };
}

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync(resolveFfmpegBinary(), args);
}

async function mergeWithConcat(localPaths: string[], outputPath: string): Promise<void> {
  const probes = await Promise.all(localPaths.map((path) => probeMediaFull(path)));
  const { width, height } = resolveTargetDimensions(probes);
  const { filterParts, videoLabels, audioLabels } = buildNormalizedStreamFilters(probes, width, height);

  const concatInputs = videoLabels.flatMap((videoLabel, index) => [
    `[${videoLabel}]`,
    `[${audioLabels[index]!}]`,
  ]);
  filterParts.push(
    `${concatInputs.join("")}concat=n=${localPaths.length}:v=1:a=1[outv][outa]`,
  );

  await runFfmpeg([
    "-y",
    ...localPaths.flatMap((path) => ["-i", path]),
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-c:a",
    "aac",
    outputPath,
  ]);
}

async function mergeWithXfade(
  localPaths: string[],
  outputPath: string,
  transition: MergeVideoTransition,
): Promise<void> {
  const probes = await Promise.all(localPaths.map((path) => probeMediaFull(path)));
  const { width, height } = resolveTargetDimensions(probes);
  const { filterParts, videoLabels, audioLabels } = buildNormalizedStreamFilters(probes, width, height);
  const transitionName = xfadeTransitionName(transition);

  let offset = Math.max(probes[0]!.durationSec - FADE_DURATION_SEC, 0);
  let videoFilter =
    `[${videoLabels[0]}][${videoLabels[1]}]xfade=transition=${transitionName}:` +
    `duration=${FADE_DURATION_SEC}:offset=${offset}[xv01]`;
  let audioFilter = `[${audioLabels[0]}][${audioLabels[1]}]acrossfade=d=${FADE_DURATION_SEC}[xa01]`;

  let videoOut = "xv01";
  let audioOut = "xa01";

  for (let index = 2; index < localPaths.length; index += 1) {
    const prevVideo = videoOut;
    const prevAudio = audioOut;
    const nextVideo = `xv${index.toString().padStart(2, "0")}`;
    const nextAudio = `xa${index.toString().padStart(2, "0")}`;

    offset += Math.max(probes[index - 1]!.durationSec - FADE_DURATION_SEC, 0);

    videoFilter +=
      `;[${prevVideo}][${videoLabels[index]}]xfade=transition=${transitionName}:` +
      `duration=${FADE_DURATION_SEC}:offset=${offset}[${nextVideo}]`;
    audioFilter += `;[${prevAudio}][${audioLabels[index]}]acrossfade=d=${FADE_DURATION_SEC}[${nextAudio}]`;
    videoOut = nextVideo;
    audioOut = nextAudio;
  }

  filterParts.push(videoFilter, audioFilter);

  await runFfmpeg([
    "-y",
    ...localPaths.flatMap((path) => ["-i", path]),
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    `[${videoOut}]`,
    "-map",
    `[${audioOut}]`,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-c:a",
    "aac",
    outputPath,
  ]);
}

/** Merge already-downloaded local video files (used by tests and the provider). */
export async function mergeLocalVideoFiles(
  localPaths: string[],
  outputPath: string,
  transition: MergeVideoTransition = "none",
): Promise<void> {
  if (localPaths.length < 2) {
    throw new Error("At least 2 videos are required to merge.");
  }

  if (transition === "none") {
    await mergeWithConcat(localPaths, outputPath);
    return;
  }

  await mergeWithXfade(localPaths, outputPath, transition);
}

export async function mergeVideosWithFfmpeg(input: MergeVideoInput): Promise<{ video_url: string }> {
  const videoUrls = input.video_urls.filter((url) => url.length > 0);
  if (videoUrls.length < 2) {
    throw new Error("At least 2 videos are required to merge.");
  }

  const jobId = randomUUID();
  const workDir = join(process.cwd(), "public", "generated", jobId);
  await mkdir(workDir, { recursive: true });

  try {
    const localPaths: string[] = [];
    for (let index = 0; index < videoUrls.length; index += 1) {
      const dest = join(workDir, `input-${index}.mp4`);
      await downloadToFile(videoUrls[index]!, dest, `video_urls[${index}]`);
      localPaths.push(dest);
    }

    const outputPath = join(workDir, "merged.mp4");
    const transition = input.transition ?? "none";
    await mergeLocalVideoFiles(localPaths, outputPath, transition);

    const filename = "merged.mp4";
    const video_url = await hostGeneratedFile({
      filePath: outputPath,
      filename,
      mimeType: "video/mp4",
    });

    return { video_url };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
