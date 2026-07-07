import type { CatalogNodeType, NodeInputFor } from "../schemas/nodeSchemas";
import type { NodeDefinition } from "../nodes/types";

/**
 * Validate resolved node inputs against the catalog input schema.
 * Optional per-node `prepareInputs` runs first (legacy field migration, etc.).
 */
export function parseNodeInputs<T extends CatalogNodeType>(
  def: NodeDefinition<T>,
  raw: Record<string, unknown>,
): NodeInputFor<T> {
  const prepared = def.prepareInputs?.(raw) ?? raw;
  return def.input.parse(prepared);
}
