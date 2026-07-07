import { beforeEach, describe, expect, it, vi } from "vitest";
import { runProviderChain } from "./runProviderChain";
import type { NodeProvider, ProviderChainConfig, ProviderContext } from "./types";

const forTokenMock = vi.fn();
const createTokenMock = vi.fn();
const waitForMock = vi.fn();

vi.mock("@trigger.dev/sdk/v3", () => ({
  wait: {
    createToken: (...args: unknown[]) => createTokenMock(...args),
    forToken: (...args: unknown[]) => forTokenMock(...args),
    for: (...args: unknown[]) => waitForMock(...args),
  },
}));

const ctx: ProviderContext = { workflowRunId: "run-1", nodeId: "node-1" };

function provider(
  id: string,
  execute: NodeProvider<unknown, unknown>["execute"],
): NodeProvider<unknown, unknown> {
  return {
    id,
    input: { parse: (v: unknown) => v } as NodeProvider<unknown, unknown>["input"],
    output: { parse: (v: unknown) => v } as NodeProvider<unknown, unknown>["output"],
    execute,
  };
}

describe("simulateWebhookWait", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    waitForMock.mockResolvedValue(undefined);
    createTokenMock.mockResolvedValue({
      url: "https://trigger.dev/wait/token/test",
    });
  });

  it("completes the token immediately when simulatedDelayMs is zero", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    forTokenMock.mockResolvedValue(undefined);

    const { simulateWebhookWait } = await import("./webhookWait");

    const sleptMs = await simulateWebhookWait({
      tokenKey: "run-1:node-1:instant",
      timeoutMs: 30_000,
      simulatedDelayMs: 0,
    });

    expect(sleptMs).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://trigger.dev/wait/token/test",
      expect.objectContaining({ method: "POST" }),
    );
    expect(waitForMock).not.toHaveBeenCalled();
    expect(forTokenMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("resolves webhook stub delay from WEBHOOK_STUB_DELAY_MS", async () => {
    const { resolveWebhookStubDelayMs } = await import("./webhookWait");

    const previous = process.env.WEBHOOK_STUB_DELAY_MS;
    process.env.WEBHOOK_STUB_DELAY_MS = "0";
    expect(resolveWebhookStubDelayMs(10_000)).toBe(0);
    process.env.WEBHOOK_STUB_DELAY_MS = "2500";
    expect(resolveWebhookStubDelayMs(10_000)).toBe(2500);
    if (previous === undefined) {
      delete process.env.WEBHOOK_STUB_DELAY_MS;
    } else {
      process.env.WEBHOOK_STUB_DELAY_MS = previous;
    }
  });

  it("propagates wait.forToken timeout errors", async () => {
    forTokenMock.mockRejectedValue(new Error("Waitpoint token timed out after 30s"));

    const { simulateWebhookWait } = await import("./webhookWait");

    await expect(
      simulateWebhookWait({
        tokenKey: "run-1:node-1:gpt-image-2",
        timeoutMs: 30_000,
        simulatedDelayMs: 10_000,
      }),
    ).rejects.toThrow(/timed out/i);

    expect(createTokenMock).toHaveBeenCalledWith({
      timeout: "30s",
      idempotencyKey: "run-1:node-1:gpt-image-2",
    });
    expect(forTokenMock).toHaveBeenCalledTimes(1);
  });

  it("resolves after the webhook token is completed", async () => {
    forTokenMock.mockResolvedValue(undefined);

    const { simulateWebhookWait } = await import("./webhookWait");

    const sleptMs = await simulateWebhookWait({
      tokenKey: "run-1:node-1:kling",
      timeoutMs: 60_000,
      simulatedDelayMs: 3_000,
    });

    expect(sleptMs).toBe(3_000);
    expect(waitForMock).toHaveBeenCalledWith({ seconds: 3 });
    expect(forTokenMock).toHaveBeenCalledTimes(1);
  });
});

describe("runProviderChain webhook timeout fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    waitForMock.mockResolvedValue(undefined);
    createTokenMock.mockResolvedValue({
      url: "https://trigger.dev/wait/token/test",
    });
  });

  it("falls back to the next provider when wait.forToken times out", async () => {
    forTokenMock
      .mockRejectedValueOnce(new Error("Waitpoint token timed out after 120s"))
      .mockResolvedValueOnce(undefined);

    const { simulateWebhookWait } = await import("./webhookWait");

    const attempts: string[] = [];
    const config: ProviderChainConfig<unknown, unknown> = {
      providers: [
        provider("openai-gpt-image-2-stub", async () => {
          await simulateWebhookWait({
            tokenKey: "run-1:node-1:primary",
            timeoutMs: 120_000,
            simulatedDelayMs: 10_000,
          });
          return { provider: "openai-gpt-image-2-stub", sleptMs: 10_000, output: { result: [] } };
        }),
        provider("openai-gpt-image-2-fallback-stub", async () => {
          await simulateWebhookWait({
            tokenKey: "run-1:node-1:fallback",
            timeoutMs: 120_000,
            simulatedDelayMs: 1,
          });
          return {
            provider: "openai-gpt-image-2-fallback-stub",
            sleptMs: 1,
            output: { result: [{ url: "https://example.com/fallback.png" }] },
          };
        }),
      ],
      timeoutMs: 120_000,
      retryPerProvider: 1,
    };

    const result = await runProviderChain(config, {}, ctx, {
      onAttempt: async (attempt) => {
        attempts.push(`${attempt.provider}:${attempt.status}`);
      },
    });

    expect(result.provider).toBe("openai-gpt-image-2-fallback-stub");
    expect(attempts).toEqual([
      "openai-gpt-image-2-stub:TIMEOUT",
      "openai-gpt-image-2-fallback-stub:SUCCESS",
    ]);
    expect(forTokenMock).toHaveBeenCalledTimes(2);
  });

  it("marks the node failed when every webhook provider times out", async () => {
    forTokenMock.mockRejectedValue(new Error("Waitpoint token timed out after 120s"));

    const { simulateWebhookWait } = await import("./webhookWait");

    const config: ProviderChainConfig<unknown, unknown> = {
      providers: [
        provider("kling-v3-pro-stub", async () => {
          await simulateWebhookWait({
            tokenKey: "run-1:node-1:kling",
            timeoutMs: 120_000,
            simulatedDelayMs: 3_000,
          });
          return { provider: "kling-v3-pro-stub", sleptMs: 3_000, output: {} };
        }),
      ],
      retryPerProvider: 1,
    };

    await expect(runProviderChain(config, {}, ctx)).rejects.toThrow(/timed out/i);
    expect(forTokenMock).toHaveBeenCalledTimes(1);
  });
});
