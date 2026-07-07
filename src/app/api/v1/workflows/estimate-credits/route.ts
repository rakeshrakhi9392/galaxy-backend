import { handleApiError, jsonOk, parseWithSchema, readJson } from "@/lib/api";
import {
  resolveWorkflowEstimatePayload,
  WorkflowEstimateCreditsRequestSchema,
  WorkflowEstimateCreditsResponseSchema,
} from "@/lib/creditEstimateApi";
import { getAuth } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await getAuth(req);
    const body = parseWithSchema(WorkflowEstimateCreditsRequestSchema, await readJson(req));
    const payload = resolveWorkflowEstimatePayload(body);
    return jsonOk(parseWithSchema(WorkflowEstimateCreditsResponseSchema, payload));
  } catch (err) {
    return handleApiError(err);
  }
}
