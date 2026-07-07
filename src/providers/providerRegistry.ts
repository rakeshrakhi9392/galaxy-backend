import type { NodeProvider } from "./types";

export type ProviderCatalogOptions<TInput, TOutput> = {
  /**
   * All providers valid for this node type (including alternates not in the
   * default chain order). Defaults to `fallback.providers` on the executor.
   */
  catalog?: NodeProvider<TInput, TOutput>[];
  /** Maps legacy or alternate config ids to a canonical provider id in the catalog. */
  aliases?: Record<string, string>;
};

export function buildProviderLookup<TInput, TOutput>(
  catalog: NodeProvider<TInput, TOutput>[],
  aliases?: Record<string, string>,
): Map<string, NodeProvider<TInput, TOutput>> {
  const lookup = new Map<string, NodeProvider<TInput, TOutput>>();
  for (const provider of catalog) {
    lookup.set(provider.id, provider);
  }
  if (aliases) {
    for (const [aliasId, canonicalId] of Object.entries(aliases)) {
      const canonical = lookup.get(canonicalId);
      if (canonical) {
        lookup.set(aliasId, canonical);
      }
    }
  }
  return lookup;
}

export function resolveProvidersById<TInput, TOutput>(
  ids: string[],
  lookup: Map<string, NodeProvider<TInput, TOutput>>,
): NodeProvider<TInput, TOutput>[] {
  return ids
    .map((id) => lookup.get(id))
    .filter((provider): provider is NodeProvider<TInput, TOutput> => provider !== undefined);
}
