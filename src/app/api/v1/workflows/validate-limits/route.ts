import { z } from "zod";
import { handleApiError, jsonOk, parseWithSchema, readJson } from "@/lib/api";
import {
  validateProviderLimitsForNode,
  type ProviderLimitViolation,
} from "@/schemas/providerInputLimitsServer";

const ValidateLimitsNodeSchema = z.object({
  nodeId: z.string().min(1),
  nodeType: z.string().min(1),
  label: z.string().optional(),
  inputs: z.record(z.string(), z.unknown()),
  wiredInputCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

const ValidateLimitsRequestSchema = z.object({
  nodes: z.array(ValidateLimitsNodeSchema).min(1),
});

export type ValidateLimitsIssue = {
  nodeId: string;
  nodeType: string;
  label: string;
  message: string;
};

function toIssues(
  node: z.infer<typeof ValidateLimitsNodeSchema>,
  violations: ProviderLimitViolation[],
): ValidateLimitsIssue[] {
  const label = node.label ?? node.nodeType;
  return violations.map((violation) => ({
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    label,
    message: violation.message,
  }));
}

export async function POST(req: Request) {
  try {
    const body = parseWithSchema(ValidateLimitsRequestSchema, await readJson(req));
    const issues: ValidateLimitsIssue[] = [];

    for (const node of body.nodes) {
      const violations = await validateProviderLimitsForNode(node.nodeType, node.inputs, {
        wiredInputCounts: node.wiredInputCounts,
      });
      if (violations.length > 0) {
        issues.push(...toIssues(node, violations));
      }
    }

    return jsonOk({ issues });
  } catch (err) {
    return handleApiError(err);
  }
}
