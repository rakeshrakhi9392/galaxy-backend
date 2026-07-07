export const LOCAL_NODE_TYPES = new Set(["request", "response"] as const);

export type LocalNodeType = "request" | "response";

export function isLocalNodeType(nodeType: string): nodeType is LocalNodeType {
  return LOCAL_NODE_TYPES.has(nodeType as LocalNodeType);
}
