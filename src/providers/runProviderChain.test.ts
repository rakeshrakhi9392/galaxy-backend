import { describe, expect, it } from "vitest";
import { MediaInputError } from "@/lib/ffmpeg/common";
import { runProviderChain } from "./runProviderChain";
import type { NodeProvider, ProviderChainConfig, ProviderContext } from "./types";

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

describe("runProviderChain", () => {
  it("returns on first provider success", async () => {
    const config: ProviderChainConfig<unknown, unknown> = {
      providers: [
        provider("a", async () => ({ provider: "a", sleptMs: 1, output: { ok: true } })),
      ],
      retryPerProvider: 1,
    };

    const result = await runProviderChain(config, {}, ctx);
    expect(result.provider).toBe("a");
  });

  it("falls back to the next provider", async () => {
    const config: ProviderChainConfig<unknown, unknown> = {
      providers: [
        provider("a", async () => {
          throw new Error("a failed");
        }),
        provider("b", async () => ({ provider: "b", sleptMs: 1, output: { ok: true } })),
      ],
      retryPerProvider: 1,
    };

    const result = await runProviderChain(config, {}, ctx);
    expect(result.provider).toBe("b");
  });

  it("retries before failing a provider", async () => {
    let calls = 0;
    const config: ProviderChainConfig<unknown, unknown> = {
      providers: [
        provider("a", async () => {
          calls += 1;
          if (calls < 2) throw new Error("transient");
          return { provider: "a", sleptMs: 1, output: { ok: true } };
        }),
      ],
      retryPerProvider: 2,
    };

    const result = await runProviderChain(config, {}, ctx);
    expect(result.provider).toBe("a");
    expect(calls).toBe(2);
  });

  it("throws when all providers fail", async () => {
    const config: ProviderChainConfig<unknown, unknown> = {
      providers: [provider("a", async () => { throw new Error("nope"); })],
      retryPerProvider: 1,
    };

    await expect(runProviderChain(config, {}, ctx)).rejects.toThrow(/nope/);
  });

  it("records attempts via hooks", async () => {
    const attempts: string[] = [];
    const config: ProviderChainConfig<unknown, unknown> = {
      providers: [
        provider("a", async () => {
          throw new Error("fail");
        }),
        provider("b", async () => ({ provider: "b", sleptMs: 1, output: {} })),
      ],
      retryPerProvider: 1,
    };

    await runProviderChain(config, {}, ctx, {
      onAttempt: async (attempt) => {
        attempts.push(`${attempt.provider}:${attempt.status}`);
      },
    });

    expect(attempts).toEqual(["a:FAILED", "b:SUCCESS"]);
  });

  it("does not retry non-retryable media input errors", async () => {
    let calls = 0;
    const config: ProviderChainConfig<unknown, unknown> = {
      providers: [
        provider("a", async () => {
          calls += 1;
          throw new MediaInputError("audio_url is an expired temporary Transloadit URL");
        }),
      ],
      retryPerProvider: 3,
    };

    await expect(runProviderChain(config, {}, ctx)).rejects.toThrow(/audio_url/);
    expect(calls).toBe(1);
  });

  it("times out slow providers", async () => {
    const config: ProviderChainConfig<unknown, unknown> = {
      providers: [
        provider("slow", async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { provider: "slow", sleptMs: 50, output: {} };
        }),
        provider("fast", async () => ({ provider: "fast", sleptMs: 1, output: {} })),
      ],
      timeoutMs: 5,
      retryPerProvider: 1,
    };

    const result = await runProviderChain(config, {}, ctx);
    expect(result.provider).toBe("fast");
  });
});
