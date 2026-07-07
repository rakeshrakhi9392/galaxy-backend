import type { NodeUiField, NodeUiFieldVisibleWhen } from "./types";

export function matchesFieldWhen(
  when: NodeUiFieldVisibleWhen,
  inputs: Record<string, unknown>,
): boolean {
  return when.in.includes(String(inputs[when.key] ?? ""));
}

export function isFieldVisible(
  field: NodeUiField,
  inputs: Record<string, unknown>,
): boolean {
  if (!field.visibleWhen) return true;
  return matchesFieldWhen(field.visibleWhen, inputs);
}

export function resolveFieldGroup(
  field: NodeUiField,
  inputs: Record<string, unknown>,
): "primary" | "advanced" {
  if (field.groupWhen) {
    for (const entry of field.groupWhen) {
      if (matchesFieldWhen(entry.when, inputs)) return entry.group;
    }
  }
  return field.group;
}

export function resolveFieldLabel(
  field: NodeUiField,
  inputs: Record<string, unknown>,
): string {
  if (field.labelWhen) {
    for (const entry of field.labelWhen) {
      if (matchesFieldWhen(entry.when, inputs)) return entry.label;
    }
  }
  return field.label;
}

export function resolveFieldPlaceholder(
  field: NodeUiField,
  inputs: Record<string, unknown>,
): string | undefined {
  if (field.placeholderWhen) {
    for (const entry of field.placeholderWhen) {
      if (matchesFieldWhen(entry.when, inputs)) return entry.placeholder;
    }
  }
  return field.placeholder;
}
