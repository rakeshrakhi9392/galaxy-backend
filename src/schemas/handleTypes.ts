import { klingV3ProElementHandleDataType } from "./nodes/kling-v3-pro";

/** Semantic data types for workflow handle compatibility (source output → target input). */
export type HandleDataType =
  | "text"
  | "image"
  | "image_list"
  | "video"
  | "video_list"
  | "audio"
  | "audio_list"
  | "number"
  | "boolean"
  | "enum"
  | "any";

export type TypedHandle = {
  id: string;
  kind: "input" | "output";
  dataType: HandleDataType;
};

/** Returns true when a source output may connect to a target input. */
export function areHandleTypesCompatible(
  source: HandleDataType,
  target: HandleDataType,
): boolean {
  if (source === "any" || target === "any") return true;
  if (source === target) return true;
  // Single media may feed list inputs; list outputs may feed single inputs (first item).
  if (source === "image" && target === "image_list") return true;
  if (source === "image_list" && target === "image") return true;
  if (source === "video" && target === "video_list") return true;
  if (source === "video_list" && target === "video") return true;
  if (source === "audio" && target === "audio_list") return true;
  if (source === "audio_list" && target === "audio") return true;
  // Settings/percent fields accept wired text (parsed at resolve time).
  if (source === "text" && (target === "number" || target === "boolean" || target === "enum")) {
    return true;
  }
  if (source === "number" && target === "enum") return true;
  if (source === "boolean" && target === "enum") return true;
  return false;
}

export function resolveHandleDataType(
  registry: Array<{ type: string; handles: TypedHandle[] }>,
  nodeType: string | undefined,
  handleId: string | null | undefined,
  kind: "input" | "output",
): HandleDataType | undefined {
  if (!nodeType || !handleId) return undefined;
  if (nodeType === "kling-v3-pro") {
    const dynamicType = klingV3ProElementHandleDataType(handleId);
    if (dynamicType) return dynamicType;
  }
  const entry = registry.find((item) => item.type === nodeType);
  const handle = entry?.handles.find((h) => h.id === handleId && h.kind === kind);
  return handle?.dataType;
}
