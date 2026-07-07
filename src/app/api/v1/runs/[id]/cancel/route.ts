import { handleApiError, jsonOk, parseWithSchema } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { cancelWorkflowRunForUser } from "@/lib/runs/cancelRun";
import { WorkflowRunCreateResponseSchema } from "@/lib/schemas";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: ownerId } = await getAuth(req);
    const { id } = await params;
    const payload = await cancelWorkflowRunForUser(ownerId, id);
    return jsonOk(parseWithSchema(WorkflowRunCreateResponseSchema, payload));
  } catch (err) {
    return handleApiError(err);
  }
}
