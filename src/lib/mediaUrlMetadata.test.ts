import { describe, expect, it } from "vitest";
import {
  dataUrlByteLength,
  maxDimension,
  parseMediaUrlHints,
  parseSizeEnumDimensions,
  appendMediaUrlHints,
} from "./mediaUrlHints";
import {
  validateExtractAudioLimits,
  validateGptImage2Limits,
  validateMergeVideoLimits,
} from "../schemas/providerInputLimitsServer";

describe("parseMediaUrlHints", () => {
  it("reads bytes, duration, and dimensions from query params", () => {
    const hints = parseMediaUrlHints(
      "https://cdn.example.com/video.mp4?bytes=1048576&durationSec=120&width=1920&height=1080",
    );
    expect(hints.bytes).toBe(1048576);
    expect(hints.durationSec).toBe(120);
    expect(hints.width).toBe(1920);
    expect(hints.height).toBe(1080);
  });

  it("supports alternate param names", () => {
    const hints = parseMediaUrlHints(
      "https://cdn.example.com/image.png?size=2048&dur=45&resolution=3840x2160",
    );
    expect(hints.bytes).toBe(2048);
    expect(hints.durationSec).toBe(45);
    expect(hints.width).toBe(3840);
    expect(hints.height).toBe(2160);
  });

  it("derives byte length from data URLs", () => {
    const url = "data:image/png;base64,QUJD";
    expect(dataUrlByteLength(url)).toBe(3);
    expect(parseMediaUrlHints(url).bytes).toBe(3);
  });
});

describe("appendMediaUrlHints", () => {
  it("adds bytes without overwriting existing hints", () => {
    const plain = appendMediaUrlHints("https://cdn.example.com/audio.mp3", { bytes: 4096 });
    expect(plain).toContain("bytes=4096");

    const existing = appendMediaUrlHints("https://cdn.example.com/audio.mp3?bytes=1000", {
      bytes: 4096,
    });
    expect(existing).toBe("https://cdn.example.com/audio.mp3?bytes=1000");
  });
});

describe("parseSizeEnumDimensions", () => {
  it("parses WxH size enums and skips custom", () => {
    expect(parseSizeEnumDimensions("1536x1024")).toEqual({ width: 1536, height: 1024 });
    expect(parseSizeEnumDimensions("custom")).toBeNull();
    expect(parseSizeEnumDimensions("auto")).toBeNull();
  });
});

describe("maxDimension", () => {
  it("returns the larger side", () => {
    expect(maxDimension(1920, 1080)).toBe(1920);
    expect(maxDimension(null, 1080)).toBeNull();
  });
});

describe("validateGptImage2Limits", () => {
  it("flags output size above max resolution", async () => {
    const ok = await validateGptImage2Limits({
      mode: "text_to_image",
      prompt: "hello",
      size: "3840x2160",
      quality: "high",
      n: 1,
      output_format: "png",
      background: "auto",
    });
    expect(ok.some((issue) => issue.field === "size")).toBe(false);

    const tooLarge = await validateGptImage2Limits({
      mode: "text_to_image",
      prompt: "hello",
      size: "4000x4000" as "1024x1024",
      quality: "high",
      n: 1,
      output_format: "png",
      background: "auto",
    });
    expect(tooLarge.some((issue) => issue.field === "size")).toBe(true);
  });

  it("flags oversized and over-resolution source images from URL hints", async () => {
    const issues = await validateGptImage2Limits({
      mode: "image_to_image",
      prompt: "edit",
      image: "https://cdn.example.com/source.png?bytes=25000000&width=5000&height=5000",
      size: "1024x1024",
      quality: "high",
      n: 1,
      output_format: "png",
      background: "auto",
    });
    expect(issues.some((issue) => issue.field === "image" && issue.message.includes("size"))).toBe(
      true,
    );
    expect(
      issues.some((issue) => issue.field === "image" && issue.message.includes("resolution")),
    ).toBe(true);
  });
});

describe("validateMergeVideoLimits", () => {
  it("flags video duration above the limit from URL hints", async () => {
    const issues = await validateMergeVideoLimits({
      video_urls: [
        "https://example.com/a.mp4?durationSec=300&bytes=1000&width=1280&height=720",
        "https://example.com/b.mp4?durationSec=700&bytes=1000&width=1280&height=720",
      ],
      transition: "none",
    });
    expect(issues.some((issue) => issue.message.includes("duration"))).toBe(true);
  });

  it("flags video resolution above the limit from URL hints", async () => {
    const issues = await validateMergeVideoLimits({
      video_urls: [
        "https://example.com/a.mp4?durationSec=30&bytes=1000&width=1280&height=720",
        "https://example.com/b.mp4?durationSec=30&bytes=1000&width=3840&height=2160",
      ],
      transition: "none",
    });
    expect(issues.some((issue) => issue.message.includes("resolution"))).toBe(true);
  });

  it("accepts Kling-style video URLs with embedded metadata hints", async () => {
    const base = "https://www.w3schools.com/html/mov_bbb.mp4";
    const withHints = (durationSec: number) =>
      appendMediaUrlHints(base, {
        durationSec,
        width: 1280,
        height: 720,
        bytes: 2_500_000,
      }) + `#run_merge-kling-${durationSec}`;

    const issues = await validateMergeVideoLimits({
      video_urls: [withHints(5), withHints(8)],
      transition: "none",
    });
    expect(issues).toEqual([]);
  });
});

describe("validateExtractAudioLimits", () => {
  it("flags oversized and long videos from URL hints", async () => {
    const issues = await validateExtractAudioLimits({
      video_url: "https://example.com/long.mp4?bytes=600000000&durationSec=900&width=1280&height=720",
      format: "mp3",
    });
    expect(issues.some((issue) => issue.message.includes("size"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("duration"))).toBe(true);
  });
});
