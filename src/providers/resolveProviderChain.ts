import type { NodeProvider } from "./types";
import type { NodeProviderConfig } from "@/nodes/types";
import {
  buildProviderLookup,
  resolveProvidersById,
  type ProviderCatalogOptions,
} from "./providerRegistry";

export type { ProviderCatalogOptions } from "./providerRegistry";

export function parseNodeProviderConfig(
  nodeData: unknown,
  fallback: NodeProviderConfig,
): NodeProviderConfig {
  const config = (nodeData as { config?: Record<string, unknown> } | undefined)?.config ?? {};
  const providers = Array.isArray(config.providers)
    ? config.providers.filter((item): item is string => typeof item === "string")
    : fallback.providers;

  return {
    providers: providers.length > 0 ? providers : fallback.providers,
    timeoutMs:
      typeof config.timeoutMs === "number" && config.timeoutMs > 0
        ? config.timeoutMs
        : fallback.timeoutMs,
    retryPerProvider:
      typeof config.retryPerProvider === "number" && config.retryPerProvider > 0
        ? config.retryPerProvider
        : fallback.retryPerProvider,
    model:
      typeof config.model === "string" && config.model.trim().length > 0
        ? config.model.trim()
        : fallback.model,
  };
}

export function resolveProviderChain<TInput, TOutput>(
  nodeData: unknown,
  fallback: {
    providers: NodeProvider<TInput, TOutput>[];
    timeoutMs: number;
    retryPerProvider: number;
  },
  options?: ProviderCatalogOptions<TInput, TOutput>,
): {
  providers: NodeProvider<TInput, TOutput>[];
  timeoutMs: number;
  retryPerProvider: number;
} {
  const catalog = options?.catalog ?? fallback.providers;
  const lookup = buildProviderLookup(catalog, options?.aliases);

  const parsed = parseNodeProviderConfig(nodeData, {
    providers: fallback.providers.map((provider) => provider.id),
    timeoutMs: fallback.timeoutMs,
    retryPerProvider: fallback.retryPerProvider,
  });

  const resolved = resolveProvidersById(parsed.providers, lookup);

  return {
    providers: resolved.length > 0 ? resolved : fallback.providers,
    timeoutMs: parsed.timeoutMs,
    retryPerProvider: parsed.retryPerProvider,
  };
}
