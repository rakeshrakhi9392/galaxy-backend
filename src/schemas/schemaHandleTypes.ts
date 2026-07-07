import type { z } from "zod";
import type { NodeDefinition } from "../nodes/types";
import { isKlingV3ProElementHandle } from "./nodes/kling-v3-pro";
import type { HandleDataType } from "./handleTypes";

type ZodDef = {
  type: string;
  innerType?: unknown;
  out?: unknown;
  schema?: unknown;
  shape?: Record<string, unknown>;
  element?: unknown;
  [key: string]: unknown;
};

function getDef(schema: unknown): ZodDef | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  return (schema as { def?: ZodDef }).def;
}

function unwrapSchema(schema: unknown): unknown {
  let current: unknown = schema;
  for (let index = 0; index < 12; index += 1) {
    const def = getDef(current);
    if (!def) return current;
    if (def.type === "default" || def.type === "optional" || def.type === "nullable") {
      current = def.innerType;
      continue;
    }
    if (def.type === "pipe") {
      current = def.out;
      continue;
    }
    if (def.type === "transform") {
      current = def.schema ?? def.out ?? current;
      continue;
    }
    return current;
  }
  return current;
}

function getObjectShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  let current: unknown = schema;
  for (let index = 0; index < 12; index += 1) {
    const def = getDef(current);
    if (!def) return {};
    if (def.type === "object" && def.shape) {
      return def.shape as Record<string, z.ZodTypeAny>;
    }
    if (def.type === "pipe") {
      current = def.out;
      continue;
    }
    if (def.type === "default" || def.type === "optional") {
      current = def.innerType;
      continue;
    }
    return {};
  }
  return {};
}

function fieldLeaf(fieldKey: string): string {
  return fieldKey.includes(".") ? (fieldKey.split(".").pop() ?? fieldKey) : fieldKey;
}

function hasUrlFormat(schema: unknown): boolean {
  const def = getDef(unwrapSchema(schema));
  if (!def || def.type !== "string") return false;
  const checks = def.checks as Array<{ def?: { format?: string } }> | undefined;
  return checks?.some((check) => check.def?.format === "url") ?? false;
}

function mediaTypeFromFieldName(fieldKey: string): HandleDataType | undefined {
  const leaf = fieldLeaf(fieldKey);
  if (leaf.includes("video")) return "video";
  if (leaf.includes("audio")) return "audio";
  if (leaf.includes("image") || leaf === "image") return "image";
  return undefined;
}

function mediaListTypeFromFieldName(fieldKey: string): HandleDataType | undefined {
  const leaf = fieldLeaf(fieldKey);
  if (leaf.includes("video")) return "video_list";
  if (leaf.includes("audio")) return "audio_list";
  if (leaf.includes("image")) return "image_list";
  return undefined;
}

function elementSchemaType(schema: unknown): string | undefined {
  const def = getDef(unwrapSchema(schema));
  if (!def) return undefined;
  if (def.type === "array") return getDef(unwrapSchema(def.element))?.type;
  return def.type;
}

/**
 * Infer canvas handle data type from a Zod input/output field schema + key.
 * Used to keep UI handle types aligned with execution schemas.
 */
export function inferHandleDataTypeFromSchemaField(
  fieldKey: string,
  schema: z.ZodTypeAny,
): HandleDataType | null {
  const unwrapped = unwrapSchema(schema);
  const def = getDef(unwrapped);
  if (!def) return null;

  const leaf = fieldLeaf(fieldKey);

  if (leaf === "output" && def.type === "string") return "text";
  if (leaf === "result" && def.type === "object") return "video";
  if (leaf === "result" && def.type === "array") {
    const elementType = elementSchemaType(unwrapped);
    if (elementType === "unknown" || elementType === "any") return "any";
    return mediaListTypeFromFieldName(fieldKey) ?? "image_list";
  }
  if (leaf === "results" && def.type === "record") return "any";

  if (def.type === "boolean") return "boolean";
  if (def.type === "number" || def.type === "int") return "number";
  if (def.type === "enum") return "enum";

  if (def.type === "array") {
    const elementType = elementSchemaType(unwrapped);
    if (elementType === "unknown" || elementType === "any") return "any";
    if (hasUrlFormat(def.element)) {
      return mediaListTypeFromFieldName(fieldKey) ?? "text";
    }
    return mediaListTypeFromFieldName(fieldKey) ?? "text";
  }

  if (def.type === "string") {
    if (hasUrlFormat(unwrapped)) {
      return mediaTypeFromFieldName(fieldKey) ?? "text";
    }
    return "text";
  }

  if (def.type === "record" || def.type === "unknown" || def.type === "any") return "any";

  return null;
}

function handleFieldKey(handleId: string, kind: "input" | "output"): string {
  const prefix = kind === "input" ? "in:" : "out:";
  return handleId.startsWith(prefix) ? handleId.slice(prefix.length) : handleId;
}

/** Fail build when UI handle dataTypes drift from Zod input/output schemas. */
export function validateNodeDefinitionHandleTypes(def: NodeDefinition): string[] {
  const errors: string[] = [];

  if (def.type === "request") return errors;

  const inputShape = getObjectShape(def.input);
  const outputShape = getObjectShape(def.output);

  for (const field of def.ui.fields) {
    if (!field.handleId || field.control === "kling_elements") continue;
    const schemaField = inputShape[field.key];
    if (!schemaField) {
      errors.push(`${def.type}: field "${field.key}" missing from input schema`);
      continue;
    }
    const expected = inferHandleDataTypeFromSchemaField(field.key, schemaField);
    if (expected && expected !== field.dataType) {
      errors.push(
        `${def.type}.${field.key}: UI dataType "${field.dataType}" !== schema "${expected}"`,
      );
    }
  }

  for (const handle of def.ui.handles) {
    if (handle.kind === "input" && isKlingV3ProElementHandle(handle.id)) continue;

    const fieldKey = handleFieldKey(handle.id, handle.kind);
    const schemaField =
      handle.kind === "input" ? inputShape[fieldKey] : outputShape[fieldKey];

    if (!schemaField) {
      if (def.type === "response" && handle.id === "result") {
        const responseResult = getObjectShape(def.input).result;
        if (responseResult) {
          const responseExpected = inferHandleDataTypeFromSchemaField("result", responseResult);
          if (responseExpected && responseExpected !== handle.dataType) {
            errors.push(
              `${def.type}.${handle.id}: UI dataType "${handle.dataType}" !== schema "${responseExpected}"`,
            );
          }
        }
        continue;
      }
      errors.push(`${def.type}: handle "${handle.id}" missing from ${handle.kind} schema`);
      continue;
    }

    const expected = inferHandleDataTypeFromSchemaField(fieldKey, schemaField);
    if (expected && expected !== handle.dataType) {
      errors.push(
        `${def.type}.${handle.id}: UI dataType "${handle.dataType}" !== schema "${expected}"`,
      );
    }
  }

  for (const field of def.ui.fields) {
    if (!field.handleId) continue;
    const handle = def.ui.handles.find((item) => item.id === field.handleId);
    if (!handle) continue;
    if (handle.dataType !== field.dataType) {
      errors.push(
        `${def.type}.${field.key}: field dataType "${field.dataType}" !== handle "${handle.id}" dataType "${handle.dataType}"`,
      );
    }
  }

  return errors;
}
