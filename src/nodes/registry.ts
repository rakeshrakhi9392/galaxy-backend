import type { CatalogNodeType } from "@galaxy/schemas";
import type { NodeDefinition } from "./types";
import { buildNodeRegistry, catalogNodes } from "./catalog";

export const nodeRegistry: Record<string, NodeDefinition> = buildNodeRegistry();

export function getNodeDefinition<T extends CatalogNodeType>(type: T): NodeDefinition<T>;
export function getNodeDefinition(type: string): NodeDefinition;
export function getNodeDefinition(type: string): NodeDefinition {
  const def = nodeRegistry[type];
  if (!def) {
    throw new Error(`Unknown node type: ${type}`);
  }
  return def;
}

export function listNodeDefinitions(): NodeDefinition[] {
  return [...catalogNodes];
}
