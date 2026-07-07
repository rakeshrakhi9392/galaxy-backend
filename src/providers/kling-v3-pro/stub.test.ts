import { describe, expect, it, vi } from "vitest";

vi.mock("@/providers/webhookWait", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/providers/webhookWait")>();
  return {
    ...actual,
    simulateWebhookWait: vi.fn(async () => 1),
  };
});
import {
  KlingV3ProInputSchema,
  KlingV3ProOutputSchema,
  estimateKlingV3ProCredits,
  formatCreditEstimate,
} from "@galaxy/schemas";
import { executeKlingV3ProStub } from "@/providers/kling-v3-pro/stub";

describe("KlingV3ProInputSchema", () => {
  it("applies defaults for text-to-video", () => {
    const parsed = KlingV3ProInputSchema.parse({});
    expect(parsed.mode).toBe("text_to_video");
    expect(parsed.aspect_ratio).toBe("16:9");
    expect(parsed.duration).toBe(5);
    expect(parsed.generate_audio).toBe(true);
  });

  it("rejects prompts over 2500 characters", () => {
    const result = KlingV3ProInputSchema.safeParse({ prompt: "a".repeat(2501) });
    expect(result.success).toBe(false);
  });

  it("accepts duration values from 3 to 15", () => {
    for (const duration of [3, 7, 15]) {
      const result = KlingV3ProInputSchema.safeParse({ duration });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.duration).toBe(duration);
    }
  });

  it("rejects duration outside 3-15", () => {
    expect(KlingV3ProInputSchema.safeParse({ duration: 2 }).success).toBe(false);
    expect(KlingV3ProInputSchema.safeParse({ duration: 16 }).success).toBe(false);
  });
});

describe("estimateKlingV3ProCredits", () => {
  it("matches Galaxy default estimate for 5s with audio", () => {
    expect(estimateKlingV3ProCredits({ duration: 5, generate_audio: true })).toBe(840_000);
    expect(formatCreditEstimate(840_000)).toBe("~0.84M");
  });

  it("scales with duration", () => {
    expect(estimateKlingV3ProCredits({ duration: 10, generate_audio: true })).toBe(1_680_000);
  });
});

describe("executeKlingV3ProStub", () => {
  it("returns validated output for text-to-video", async () => {
    const result = await executeKlingV3ProStub(
      KlingV3ProInputSchema.parse({ prompt: "A fox running through snow" }),
      { workflowRunId: "run_1", nodeId: "node_1" },
    );

    expect(result.provider).toBe("kling-v3-pro-stub");
    expect(KlingV3ProOutputSchema.safeParse(result.output).success).toBe(true);
    expect(result.output.result.url).toMatch(/^https:\/\//);
    expect(result.output.result.url).toContain("durationSec=5");
    expect(result.output.result.url).toContain("width=1280");
    expect(result.output.result.url).toContain("height=720");
    expect(result.output.result.url).toContain(".mp4?");
  });

  it("requires prompt for text-to-video", async () => {
    await expect(
      executeKlingV3ProStub(
        KlingV3ProInputSchema.parse({ prompt: "" }),
        { workflowRunId: "run_1", nodeId: "node_1" },
      ),
    ).rejects.toThrow(/Prompt is required/);
  });

  it("requires start frame for image-to-video", async () => {
    await expect(
      executeKlingV3ProStub(
        KlingV3ProInputSchema.parse({ mode: "image_to_video", prompt: "animate" }),
        { workflowRunId: "run_1", nodeId: "node_1" },
      ),
    ).rejects.toThrow(/Start frame image is required/);
  });
});
