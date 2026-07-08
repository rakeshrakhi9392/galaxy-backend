import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterLlmInputSchema } from "@galaxy/schemas";
import { executeOpenRouterGeminiFlash } from "@/providers/openrouter-llm/openrouter";

describe("executeOpenRouterGeminiFlash (MSW integration)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls OpenRouter through an MSW-mocked HTTP boundary", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");

    const input = OpenRouterLlmInputSchema.parse({
      prompt: "Say hi",
      temperature: 0.2,
      max_tokens: 64,
    });

    const result = await executeOpenRouterGeminiFlash(input, {
      workflowRunId: "run_msw",
      nodeId: "node_llm",
    });

    expect(result.output.output).toBe("mocked openrouter response");
  });
});
