import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeLocalVideoFiles, mergeVideosWithFfmpeg } from "./mergeVideos";
import { probeMediaFull } from "./probe";
import { createTestVideo, createTestVideoDir, isFfmpegAvailable } from "./testFixtures";

const ffmpegAvailable = await isFfmpegAvailable();

function toDataUrl(buffer: Buffer): string {
  return `data:video/mp4;base64,${buffer.toString("base64")}`;
}

describe.skipIf(!ffmpegAvailable)("mergeVideos FFmpeg integration", () => {
  const workDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      workDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }).catch(() => undefined)),
    );
  });

  async function trackDir(prefix: string): Promise<string> {
    const dir = await createTestVideoDir(prefix);
    workDirs.push(dir);
    return dir;
  }

  it("concatenates two clips with concat transition", async () => {
    const dir = await trackDir("concat");
    const clipA = join(dir, "a.mp4");
    const clipB = join(dir, "b.mp4");
    const output = join(dir, "merged.mp4");

    await createTestVideo(clipA, { durationSec: 1, color: "red" });
    await createTestVideo(clipB, { durationSec: 1, color: "blue" });

    await mergeLocalVideoFiles([clipA, clipB], output, "none");

    const probe = await probeMediaFull(output);
    expect(probe.hasVideo).toBe(true);
    expect(probe.hasAudio).toBe(true);
    expect(probe.durationSec).toBeGreaterThan(1.5);
    expect(probe.durationSec).toBeLessThan(2.5);
  });

  it("concatenates clips with different resolutions", async () => {
    const dir = await trackDir("mixed-res");
    const clipA = join(dir, "a.mp4");
    const clipB = join(dir, "b.mp4");
    const output = join(dir, "merged.mp4");

    await createTestVideo(clipA, { width: 320, height: 240, durationSec: 1 });
    await createTestVideo(clipB, { width: 640, height: 480, durationSec: 1, color: "green" });

    await mergeLocalVideoFiles([clipA, clipB], output, "none");

    const probe = await probeMediaFull(output);
    expect(probe.hasVideo).toBe(true);
    expect(probe.width).toBe(640);
    expect(probe.height).toBe(480);
    expect(probe.durationSec).toBeGreaterThan(1.5);
  });

  it("merges with fade transition and mixed audio presence", async () => {
    const dir = await trackDir("xfade");
    const clipA = join(dir, "a.mp4");
    const clipB = join(dir, "b.mp4");
    const clipC = join(dir, "c.mp4");
    const output = join(dir, "merged.mp4");

    await createTestVideo(clipA, { durationSec: 2, withAudio: true });
    await createTestVideo(clipB, { durationSec: 2, withAudio: false, color: "blue" });
    await createTestVideo(clipC, { durationSec: 2, withAudio: true, color: "green" });

    await mergeLocalVideoFiles([clipA, clipB, clipC], output, "fade");

    const probe = await probeMediaFull(output);
    expect(probe.hasVideo).toBe(true);
    expect(probe.hasAudio).toBe(true);
    // 3×2s clips with 1s crossfades → ~4s total (2+2-1, then +2-1).
    expect(probe.durationSec).toBeGreaterThan(3.5);
    expect(probe.durationSec).toBeLessThan(5);
  });

  it("merges with dissolve transition", async () => {
    const dir = await trackDir("dissolve");
    const clipA = join(dir, "a.mp4");
    const clipB = join(dir, "b.mp4");
    const output = join(dir, "merged.mp4");

    await createTestVideo(clipA, { durationSec: 1 });
    await createTestVideo(clipB, { durationSec: 1, color: "purple" });

    await mergeLocalVideoFiles([clipA, clipB], output, "dissolve");

    const probe = await probeMediaFull(output);
    expect(probe.hasVideo).toBe(true);
    expect(probe.durationSec).toBeGreaterThan(0.5);
  });

  it("cleans up the temp work directory after mergeVideosWithFfmpeg", async () => {
    const dir = await trackDir("cleanup-source");
    const clipA = join(dir, "a.mp4");
    const clipB = join(dir, "b.mp4");
    await createTestVideo(clipA, { durationSec: 1 });
    await createTestVideo(clipB, { durationSec: 1, color: "orange" });

    const generatedRoot = join(process.cwd(), "public", "generated");
    const before = new Set(await readdir(generatedRoot).catch(() => []));

    vi.spyOn(await import("./common"), "hostGeneratedFile").mockResolvedValue(
      "https://example.com/merged.mp4",
    );

    await mergeVideosWithFfmpeg({
      video_urls: [
        toDataUrl(await readFile(clipA)),
        toDataUrl(await readFile(clipB)),
      ],
      transition: "none",
    });

    const after = await readdir(generatedRoot).catch(() => []);
    const createdJobDirs = after.filter((entry) => !before.has(entry) && !entry.startsWith("test-"));
    expect(createdJobDirs).toEqual([]);
  });
});
