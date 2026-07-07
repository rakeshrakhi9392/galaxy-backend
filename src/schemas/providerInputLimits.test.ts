import { describe, expect, it } from "vitest";
import {
  validateExtractAudioLimits,
  validateGptImage2Limits,
  validateKlingV3ProLimits,
  validateMergeAvLimits,
  validateMergeVideoLimits,
  validateOpenRouterLlmLimits,
} from "./providerInputLimitsServer";
import { validateProviderLimitsFromHints } from "./providerInputLimits";

describe("validateGptImage2Limits", () => {
  it("flags prompt length violations", async () => {
    const issues = await validateGptImage2Limits({
      mode: "text_to_image",
      prompt: "x".repeat(4001),
      size: "1024x1024",
      quality: "high",
      n: 1,
      output_format: "png",
      background: "auto",
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.field).toBe("prompt");
  });
});

describe("validateMergeVideoLimits", () => {
  it("requires at least two videos", async () => {
    const issues = await validateMergeVideoLimits({
      video_urls: ["https://example.com/a.mp4"],
      transition: "none",
    });
    expect(issues.some((issue) => issue.field === "video_urls")).toBe(true);
  });

  it("accepts wired upstream slots before run when urls are not resolved yet", async () => {
    const issues = await validateMergeVideoLimits(
      { video_urls: [], transition: "none" },
      { wiredInputCounts: { video_urls: 2 } },
    );
    expect(issues.some((issue) => issue.message.includes("At least 2"))).toBe(false);
  });
});

describe("validateKlingV3ProLimits", () => {
  it("flags duration above schema limit", async () => {
    const issues = await validateKlingV3ProLimits({
      mode: "text_to_video",
      prompt: "hello",
      start_image_url: "",
      end_image_url: "",
      aspect_ratio: "16:9",
      duration: 16,
      negative_prompt: "",
      generate_audio: true,
      elements: [],
    });
    expect(issues.some((issue) => issue.field === "duration")).toBe(true);
  });
});

describe("validateOpenRouterLlmLimits", () => {
  it("flags oversized image urls from hints", async () => {
    const issues = await validateOpenRouterLlmLimits({
      prompt: "hello",
      system_prompt: "",
      image_urls: ["https://cdn.example.com/big.png?bytes=25000000"],
      video_urls: [],
      audio_urls: [],
      temperature: 0.7,
      max_tokens: 1024,
      reasoning: false,
      top_p: 1,
      top_k: 0,
      frequency_penalty: 0,
      presence_penalty: 0,
      repetition_penalty: 1,
      min_p: 0,
      top_a: 0,
      seed: 0,
      stop: "",
      response_format: false,
    });
    expect(issues.some((issue) => issue.message.includes("size"))).toBe(true);
  });

  it("fail-closed when video metadata cannot be verified", async () => {
    const issues = await validateOpenRouterLlmLimits({
      prompt: "hello",
      system_prompt: "",
      image_urls: [],
      video_urls: ["https://example.com/no-hints.mp4"],
      audio_urls: [],
      temperature: 0.7,
      max_tokens: 1024,
      reasoning: false,
      top_p: 1,
      top_k: 0,
      frequency_penalty: 0,
      presence_penalty: 0,
      repetition_penalty: 1,
      min_p: 0,
      top_a: 0,
      seed: 0,
      stop: "",
      response_format: false,
    });
    expect(issues.some((issue) => issue.message.includes("unable to verify"))).toBe(true);
  });
});

describe("validateMergeAvLimits", () => {
  it("flags blob video urls", async () => {
    const issues = await validateMergeAvLimits({
      video_url: "blob:http://localhost/video",
      audio_url: "https://example.com/a.mp3?bytes=1000&durationSec=30",
      audio_volume: 1,
    });
    expect(issues.some((issue) => issue.message.includes("blob"))).toBe(true);
  });

  it("does not fail-closed for transloadit-style urls without metadata hints", async () => {
    const issues = await validateMergeAvLimits({
      video_url: "https://tmp-hd833ap.transloadit.com/scratch/video123",
      audio_url: "https://tmp-hd833ap.transloadit.com/scratch/audio456",
      audio_volume: 1,
    });
    expect(issues.some((issue) => issue.message.includes("unable to verify"))).toBe(false);
  });

  it("still enforces audio size when bytes hint is present", async () => {
    const issues = await validateMergeAvLimits({
      video_url: "https://example.com/v.mp4?bytes=1000&durationSec=10&width=1280&height=720",
      audio_url: `https://example.com/a.mp3?bytes=${60 * 1024 * 1024 + 1}&durationSec=10`,
      audio_volume: 1,
    });
    expect(issues.some((issue) => issue.field === "audio_url" && issue.message.includes("size"))).toBe(
      true,
    );
  });
});

describe("validateExtractAudioLimits", () => {
  it("flags duration violations from hints", async () => {
    const issues = await validateExtractAudioLimits({
      video_url: "https://example.com/long.mp4?bytes=1000&durationSec=900&width=1280&height=720",
      format: "mp3",
    });
    expect(issues.some((issue) => issue.message.includes("duration"))).toBe(true);
  });

  it("flags resolution violations from hints", async () => {
    const issues = await validateExtractAudioLimits({
      video_url: "https://example.com/4k.mp4?bytes=1000&durationSec=30&width=3840&height=2160",
      format: "mp3",
    });
    expect(issues.some((issue) => issue.message.includes("resolution"))).toBe(true);
  });

  it("does not fail-closed for urls without metadata hints", async () => {
    const issues = await validateExtractAudioLimits({
      video_url: "https://tmp-hd833ap.transloadit.com/scratch/video123",
      format: "mp3",
    });
    expect(issues.some((issue) => issue.message.includes("unable to verify"))).toBe(false);
  });
});

describe("validateProviderLimitsFromHints", () => {
  it("does not fail-closed for plain urls without metadata hints", () => {
    const issues = validateProviderLimitsFromHints("extract-audio", {
      video_url: "https://example.com/video.mp4",
      format: "mp3",
    });
    expect(issues.some((issue) => issue.message.includes("unable to verify"))).toBe(false);
  });

  it("blocks blob urls immediately", () => {
    const issues = validateProviderLimitsFromHints("gpt-image-2", {
      mode: "image_to_image",
      prompt: "edit",
      image: "blob:http://localhost/abc",
      size: "1024x1024",
      quality: "high",
      n: 1,
      output_format: "png",
      background: "auto",
    });
    expect(issues.some((issue) => issue.message.includes("blob"))).toBe(true);
  });

  it("counts wired merge-video inputs toward the minimum before run", () => {
    const issues = validateProviderLimitsFromHints(
      "merge-video",
      { video_urls: [], transition: "none" },
      { wiredInputCounts: { video_urls: 2 } },
    );
    expect(issues.some((issue) => issue.message.includes("At least 2"))).toBe(false);
  });
});
