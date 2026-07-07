import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeOpenRouterGeminiFlash,
  OPENROUTER_GEMINI_FLASH_PROVIDER_ID,
} from "./openrouter";
import { OpenRouterLlmInputSchema } from "@galaxy/schemas";

describe("openrouterGeminiFlashProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("throws when OPENROUTER_API_KEY is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const input = OpenRouterLlmInputSchema.parse({ prompt: "hello" });

    await expect(
      executeOpenRouterGeminiFlash(input, { workflowRunId: "run_1", nodeId: "n1" }),
    ).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it("calls OpenRouter chat completions and returns text", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "hello from openrouter" } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const input = OpenRouterLlmInputSchema.parse({
      prompt: "Say hi",
      system_prompt: "Be brief",
      temperature: 0.2,
      max_tokens: 64,
      top_k: 40,
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
      repetition_penalty: 1.1,
      min_p: 0.05,
      top_a: 0.1,
      reasoning: true,
    });

    const result = await executeOpenRouterGeminiFlash(input, {
      workflowRunId: "run_1",
      nodeId: "n1",
    });

    expect(result.provider).toBe(OPENROUTER_GEMINI_FLASH_PROVIDER_ID);
    expect(result.output.output).toBe("hello from openrouter");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");

    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
      temperature: number;
      max_tokens: number;
      top_k: number;
      frequency_penalty: number;
      presence_penalty: number;
      repetition_penalty: number;
      min_p: number;
      top_a: number;
      reasoning: { enabled: boolean };
    };
    expect(body.model).toBe("google/gemini-3.5-flash");
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages[0]?.content).toBe("Be brief");
    expect(body.messages[1]?.role).toBe("user");
    const userParts = body.messages[1]?.content as Array<{ type: string; text?: string }>;
    expect(userParts[userParts.length - 1]?.text).toBe("Say hi");
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(64);
    expect(body.top_k).toBe(40);
    expect(body.frequency_penalty).toBe(0.5);
    expect(body.presence_penalty).toBe(0.3);
    expect(body.repetition_penalty).toBe(1.1);
    expect(body.min_p).toBe(0.05);
    expect(body.top_a).toBe(0.1);
    expect(body.reasoning).toEqual({ enabled: true });
  });

  it("uses model from provider context when set on node config", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "custom model reply" } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const input = OpenRouterLlmInputSchema.parse({ prompt: "hello" });
    const customModel = "google/gemini-3.1-pro-preview";

    await executeOpenRouterGeminiFlash(input, {
      workflowRunId: "run_1",
      nodeId: "n1",
      model: customModel,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { model: string };
    expect(body.model).toBe(customModel);
  });

  it("surfaces OpenRouter API errors", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "API key not valid" } }),
      }),
    );

    const input = OpenRouterLlmInputSchema.parse({ prompt: "hello" });

    await expect(
      executeOpenRouterGeminiFlash(input, { workflowRunId: "run_1", nodeId: "n1" }),
    ).rejects.toThrow("API key not valid");
  });

  it("throws when OPENROUTER_HTTP_REFERER is invalid", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_HTTP_REFERER", "not-a-valid-url");
    const input = OpenRouterLlmInputSchema.parse({ prompt: "hello" });

    await expect(
      executeOpenRouterGeminiFlash(input, { workflowRunId: "run_1", nodeId: "n1" }),
    ).rejects.toThrow(/OPENROUTER_HTTP_REFERER/);
  });

  it("filters whitespace-only media URLs during parse", () => {
    const input = OpenRouterLlmInputSchema.parse({
      prompt: "hello",
      image_urls: [" "],
      audio_urls: ["\t"],
    });
    expect(input.image_urls).toEqual([]);
    expect(input.audio_urls).toEqual([]);
  });

  it("surfaces rate limit errors", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "Rate limit exceeded" } }),
      }),
    );

    const input = OpenRouterLlmInputSchema.parse({ prompt: "hello" });

    await expect(
      executeOpenRouterGeminiFlash(input, { workflowRunId: "run_1", nodeId: "n1" }),
    ).rejects.toThrow("Rate limit exceeded");
  });
});
