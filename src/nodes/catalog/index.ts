/**
 * Node catalog — one file per node type under this folder.
 *
 * To add a node:
 * 1. Create `catalog/<type>.ts` with schemas, UI, credits, and `execute`
 * 2. Export it from this index and add it to `catalogNodes`
 *
 * A matching Trigger.dev task (`execute-node-<type>`) is registered automatically
 * from this catalog in `src/trigger/tasks/nodeExecuteTasks.ts`.
 *
 * Providers stay in `providers/` (swappable). No executeNode switch, no FE component.
 */
import type { NodeDefinition } from "../types";
import { requestNode } from "./request";
import { responseNode } from "./response";
import { llmNode } from "./llm";
import { gptImage2Node } from "./gpt-image-2";
import { klingV3ProNode } from "./kling-v3-pro";
import { mergeVideoNode } from "./merge-video";
import { mergeAvNode } from "./merge-av";
import { extractAudioNode } from "./extract-audio";

export {
  requestNode,
  responseNode,
  llmNode,
  gptImage2Node,
  klingV3ProNode,
  mergeVideoNode,
  mergeAvNode,
  extractAudioNode,
};

/** All registered node definitions (single registration list). */
export const catalogNodes: NodeDefinition[] = [
  requestNode,
  responseNode,
  llmNode,
  gptImage2Node,
  klingV3ProNode,
  mergeVideoNode,
  mergeAvNode,
  extractAudioNode,
];

export function buildNodeRegistry(): Record<string, NodeDefinition> {
  return Object.fromEntries(catalogNodes.map((node) => [node.type, node]));
}
