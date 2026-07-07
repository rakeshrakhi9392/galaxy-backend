import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseNodeProviderConfig, resolveProviderChain } from "./resolveProviderChain";
import type { NodeProvider } from "./types";

const fallbackConfig = {
  providers: ["primary", "secondary"],
  timeoutMs: 120_000,
  retryPerProvider: 2,
  model: "default-model",
};

function stubProvider(id: string): NodeProvider<unknown, unknown> {
  return {
    id,
    input: z.unknown(),
    output: z.unknown(),
    execute: async () => ({ provider: id, sleptMs: 0, output: {} }),
  };
}

describe("parseNodeProviderConfig", () => {
  it("returns fallback when nodeData has no config", () => {
    expect(parseNodeProviderConfig(undefined, fallbackConfig)).toEqual(fallbackConfig);
    expect(parseNodeProviderConfig({}, fallbackConfig)).toEqual(fallbackConfig);
  });

  it("reads provider order from node config", () => {
    const parsed = parseNodeProviderConfig(
      { config: { providers: ["secondary", "primary"] } },
      fallbackConfig,
    );
    expect(parsed.providers).toEqual(["secondary", "primary"]);
  });

  it("filters non-string entries from providers array", () => {
    const parsed = parseNodeProviderConfig(
      { config: { providers: ["a", 1, null, "b", undefined] } },
      fallbackConfig,
    );
    expect(parsed.providers).toEqual(["a", "b"]);
  });

  it("uses fallback providers when config providers array is empty", () => {
    const parsed = parseNodeProviderConfig({ config: { providers: [] } }, fallbackConfig);
    expect(parsed.providers).toEqual(fallbackConfig.providers);
  });

  it("reads timeoutMs and retryPerProvider from config", () => {
    const parsed = parseNodeProviderConfig(
      { config: { timeoutMs: 30_000, retryPerProvider: 5 } },
      fallbackConfig,
    );
    expect(parsed.timeoutMs).toBe(30_000);
    expect(parsed.retryPerProvider).toBe(5);
  });

  it("ignores invalid timeoutMs and retryPerProvider values", () => {
    const parsed = parseNodeProviderConfig(
      { config: { timeoutMs: 0, retryPerProvider: -1 } },
      fallbackConfig,
    );
    expect(parsed.timeoutMs).toBe(fallbackConfig.timeoutMs);
    expect(parsed.retryPerProvider).toBe(fallbackConfig.retryPerProvider);
  });

  it("reads model from config", () => {
    const parsed = parseNodeProviderConfig(
      { config: { model: "google/gemini-3.5-flash" } },
      fallbackConfig,
    );
    expect(parsed.model).toBe("google/gemini-3.5-flash");
  });

  it("keeps fallback model when config model is not a string", () => {
    const parsed = parseNodeProviderConfig({ config: { model: 42 } }, fallbackConfig);
    expect(parsed.model).toBe(fallbackConfig.model);
  });
});

describe("resolveProviderChain", () => {
  const primary = stubProvider("primary");
  const secondary = stubProvider("secondary");
  const fallback = {
    providers: [primary, secondary],
    timeoutMs: 120_000,
    retryPerProvider: 2,
  };

  it("uses default fallback chain when node config is absent", () => {
    const chain = resolveProviderChain(undefined, fallback);
    expect(chain.providers.map((provider) => provider.id)).toEqual(["primary", "secondary"]);
    expect(chain.timeoutMs).toBe(120_000);
    expect(chain.retryPerProvider).toBe(2);
  });

  it("reorders providers from node config using the node catalog", () => {
    const chain = resolveProviderChain(
      { config: { providers: ["secondary", "primary"] } },
      fallback,
    );
    expect(chain.providers.map((provider) => provider.id)).toEqual(["secondary", "primary"]);
  });

  it("resolves providers from catalog that are not in the default chain", () => {
    const alternate = stubProvider("alternate");
    const chain = resolveProviderChain(
      { config: { providers: ["alternate", "primary"] } },
      fallback,
      { catalog: [primary, secondary, alternate] },
    );
    expect(chain.providers.map((provider) => provider.id)).toEqual(["alternate", "primary"]);
  });

  it("resolves legacy provider ids via aliases", () => {
    const chain = resolveProviderChain(
      { config: { providers: ["legacy-id"] } },
      fallback,
      {
        catalog: fallback.providers,
        aliases: { "legacy-id": "primary" },
      },
    );
    expect(chain.providers.map((provider) => provider.id)).toEqual(["primary"]);
  });

  it("falls back to default chain when every configured id is unknown", () => {
    const chain = resolveProviderChain(
      { config: { providers: ["missing-a", "missing-b"] } },
      fallback,
    );
    expect(chain.providers.map((provider) => provider.id)).toEqual(["primary", "secondary"]);
  });

  it("applies timeout and retry settings from node config", () => {
    const chain = resolveProviderChain(
      { config: { timeoutMs: 45_000, retryPerProvider: 4 } },
      fallback,
    );
    expect(chain.timeoutMs).toBe(45_000);
    expect(chain.retryPerProvider).toBe(4);
  });

  it("skips unknown ids while preserving known ones in order", () => {
    const chain = resolveProviderChain(
      { config: { providers: ["secondary", "missing", "primary"] } },
      fallback,
    );
    expect(chain.providers.map((provider) => provider.id)).toEqual(["secondary", "primary"]);
  });
});
