import { ApiError, apiErrorToBody } from "@/lib/api";
import { authenticateCredential, getBearerToken } from "@/lib/auth";
import { handleMcpRequest } from "@/mcp/transportManager";

function unauthorizedResponse(message: string) {
  return Response.json(apiErrorToBody("UNAUTHORIZED", message), { status: 401 });
}

function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return Response.json(apiErrorToBody(err.code, err.message, { cause: err.cause }), {
      status: err.status,
    });
  }
  console.error("[mcp] unhandled error", err);
  return Response.json(apiErrorToBody("INTERNAL_ERROR", "Internal server error"), { status: 500 });
}

async function authenticateMcpRequest(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Bearer API key required for MCP");
  }
  return authenticateCredential(token);
}

async function dispatch(req: Request, parsedBody?: unknown) {
  try {
    const auth = await authenticateMcpRequest(req);
    return await handleMcpRequest(req, auth, parsedBody);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return unauthorizedResponse(err.message);
    }
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return Response.json(apiErrorToBody("BAD_REQUEST", "Invalid JSON body"), { status: 400 });
  }
  return dispatch(req, parsedBody);
}

export async function GET(req: Request) {
  return dispatch(req);
}

export async function DELETE(req: Request) {
  return dispatch(req);
}
