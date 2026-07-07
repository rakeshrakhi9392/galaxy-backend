import { handleApiError, jsonOk, parseWithSchema, readJson } from "@/lib/api";
import {
  estimateNodesMicrocredits,
  NodesEstimateCreditsRequestSchema,
  NodesEstimateCreditsResponseSchema,
} from "@/lib/creditEstimateApi";
import { getAuth } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await getAuth(req);
    const body = parseWithSchema(NodesEstimateCreditsRequestSchema, await readJson(req));
    const payload = estimateNodesMicrocredits(body.nodes);
    return jsonOk(parseWithSchema(NodesEstimateCreditsResponseSchema, payload));
  } catch (err) {
    return handleApiError(err);
  }
}
