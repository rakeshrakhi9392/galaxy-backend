import { describe, expect, it, vi } from "vitest";

vi.mock("@/providers/webhookWait", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/providers/webhookWait")>();
  return {
    ...actual,
    simulateWebhookWait: vi.fn(async () => 1),
  };
});
import {
  GptImage2InputSchema,
  GptImage2OutputSchema,
  estimateGptImage2Credits,
  formatCreditEstimate,
} from "@galaxy/schemas";
import { executeGptImage2Stub } from "@/providers/gpt-image-2/stub";

describe("GptImage2InputSchema", () => {
  it("applies defaults for text-to-image", () => {
    const parsed = GptImage2InputSchema.parse({});
    expect(parsed.mode).toBe("text_to_image");
    expect(parsed.quality).toBe("high");
    expect(parsed.n).toBe(1);
    expect(parsed.size).toBe("auto");
  });

  it("rejects prompts over 4000 characters", () => {
    const result = GptImage2InputSchema.safeParse({ prompt: "a".repeat(4001) });
    expect(result.success).toBe(false);
  });

  it("treats empty image as absent", () => {
    const parsed = GptImage2InputSchema.parse({ image: "" });
    expect(parsed.image).toBeUndefined();
    expect(estimateGptImage2Credits({ image: "", quality: "high", n: 1 })).toBe(210_000);
  });
});

describe("estimateGptImage2Credits", () => {
  it("matches Galaxy default estimate for one high-quality image", () => {
    expect(estimateGptImage2Credits({ quality: "high", n: 1 })).toBe(210_000);
    expect(formatCreditEstimate(210_000)).toBe("~0.21M");
  });

  it("scales with image count", () => {
    expect(estimateGptImage2Credits({ quality: "high", n: 2 })).toBe(420_000);
  });
});

describe("executeGptImage2Stub", () => {
  it("returns validated output for text-to-image", async () => {
    const result = await executeGptImage2Stub(
      GptImage2InputSchema.parse({ prompt: "A red fox in snow" }),
      { workflowRunId: "run_1", nodeId: "node_1" },
    );

    expect(result.provider).toBe("openai-gpt-image-2-stub");
    expect(GptImage2OutputSchema.safeParse(result.output).success).toBe(true);
    expect(result.output.result).toHaveLength(1);
    expect(result.output.result[0]?.url).toMatch(/^https:\/\//);
  });

  it("requires prompt for text-to-image", async () => {
    await expect(
      executeGptImage2Stub(
        GptImage2InputSchema.parse({ prompt: "" }),
        { workflowRunId: "run_1", nodeId: "node_1" },
      ),
    ).rejects.toThrow(/Prompt is required/);
  });

  it("requires image for image-to-image", async () => {
    await expect(
      executeGptImage2Stub(
        GptImage2InputSchema.parse({ mode: "image_to_image", prompt: "enhance" }),
        { workflowRunId: "run_1", nodeId: "node_1" },
      ),
    ).rejects.toThrow(/Image input is required/);
  });
});
