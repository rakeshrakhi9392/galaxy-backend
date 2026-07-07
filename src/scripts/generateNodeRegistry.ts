import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { catalogNodes } from "../nodes/catalog";
import type { NodeCreditEstimator } from "../nodes/types";
import * as galaxySchemas from "../schemas/index";
import { getNodeInputSchema, getNodeOutputSchema } from "../schemas/nodeSchemas";
import { validateNodeDefinitionHandleTypes } from "../schemas/schemaHandleTypes";

function resolveOutPath(): string {
  if (process.env.FRONTEND_REGISTRY_PATH?.trim()) {
    return resolve(process.env.FRONTEND_REGISTRY_PATH.trim());
  }

  const frontendRoots = [
    resolve(__dirname, "../../../frontend"),
    resolve(__dirname, "../../../madasu-trial-frontend-main"),
    resolve(__dirname, "../../../galaxy-frontend"),
  ];

  for (const root of frontendRoots) {
    if (existsSync(root)) {
      return resolve(root, "src/generated/nodeRegistry.ts");
    }
  }

  return resolve(__dirname, "../../../frontend/src/generated/nodeRegistry.ts");
}

const OUT_PATH = resolveOutPath();

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function resolveEstimatorExportName(fn: NodeCreditEstimator): string {
  for (const [name, value] of Object.entries(galaxySchemas)) {
    if (typeof value === "function" && value === fn) {
      return name;
    }
  }
  throw new Error("Node estimateCredits is not exported from @galaxy/schemas");
}

function generate() {
  const alignmentErrors = catalogNodes.flatMap((node) => validateNodeDefinitionHandleTypes(node));
  if (alignmentErrors.length > 0) {
    console.error("Node handle dataTypes drift from Zod schemas:");
    for (const error of alignmentErrors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const schemaErrors = catalogNodes.flatMap((node) => {
    const issues: string[] = [];
    if (!getNodeInputSchema(node.type)) {
      issues.push(`${node.type}: missing input schema in @galaxy/schemas`);
    }
    if (!getNodeOutputSchema(node.type)) {
      issues.push(`${node.type}: missing output schema in @galaxy/schemas`);
    }
    return issues;
  });
  if (schemaErrors.length > 0) {
    console.error("Node catalog missing shared Zod schemas:");
    for (const error of schemaErrors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const defs = catalogNodes.map((def) => ({
    type: def.type,
    ui: def.ui,
  }));

  const estimatorExportNames = new Set<string>();
  const estimatorByType = new Map<string, string>();
  for (const node of catalogNodes) {
    if (!node.estimateCredits) continue;
    const exportName = resolveEstimatorExportName(node.estimateCredits);
    estimatorExportNames.add(exportName);
    estimatorByType.set(node.type, exportName);
  }

  const estimatorImports =
    estimatorExportNames.size > 0
      ? `import {\n  ${[...estimatorExportNames].sort().join(",\n  ")},\n} from "@galaxy/schemas";\n`
      : "";

  const registryEntries = catalogNodes
    .map((node) => {
      const estimatorExport = estimatorByType.get(node.type);
      const estimateCreditsField = estimatorExport
        ? `,\n      estimateCredits: ${estimatorExport}`
        : "";
      return `    "${node.type}": {
      type: "${node.type}",
      ui: nodeDefinitions.find((definition) => definition.type === "${node.type}")!.ui,
      input: getNodeInputSchema("${node.type}")!,
      output: getNodeOutputSchema("${node.type}")!${estimateCreditsField}
    }`;
    })
    .join(",\n");

  const source = `import type { z } from "zod";
import type { NodeUiConfig } from "@galaxy/schemas";
import {
  getNodeInputSchema,
  getNodeOutputSchema,
  NODE_INPUT_SCHEMAS,
  NODE_OUTPUT_SCHEMAS,
} from "@galaxy/schemas";
${estimatorImports}
export type {
  HandleDataType,
  NodeUiHandle,
  NodeUiFieldControl,
  NodeUiFieldVisibleWhen,
  NodeUiFieldGroupWhen,
  NodeUiFieldLabelWhen,
  NodeUiFieldPlaceholderWhen,
  NodeUiFieldLayout,
  NodeUiField,
  NodeUiBody,
  NodeUiConfig,
} from "@galaxy/schemas";

export {
  getNodeInputSchema,
  getNodeOutputSchema,
  NODE_INPUT_SCHEMAS,
  NODE_OUTPUT_SCHEMAS,
};

/** UI config slice generated from the backend catalog. */
export type NodeUiDefinition = {
  type: string;
  ui: NodeUiConfig;
};

/** Live credit estimate from resolved node inputs (wired from catalog at build time). */
export type NodeCreditEstimator = (inputs: Record<string, unknown>) => number;

/** Full frontend node definition: UI + shared Zod input/output schemas. */
export type NodeDefinition = NodeUiDefinition & {
  input: z.ZodTypeAny;
  output: z.ZodTypeAny;
  estimateCredits?: NodeCreditEstimator;
};

// AUTO-GENERATED — do not edit. Run: pnpm -C backend generate:nodes
export const nodeDefinitions: NodeUiDefinition[] = ${serialize(defs)};

export const nodeRegistryByType: Record<string, NodeDefinition> = {
${registryEntries}
};

export function getNodeDefinition(type: string | undefined): NodeDefinition | undefined {
  if (!type) return undefined;
  return nodeRegistryByType[type];
}

export function listNodeTypes(): string[] {
  return nodeDefinitions.map((definition) => definition.type);
}
`;

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, source, "utf8");
  console.log(`Wrote ${OUT_PATH}`);
}

generate();
