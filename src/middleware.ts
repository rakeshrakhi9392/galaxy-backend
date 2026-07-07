import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_CONTEXT_HEADER,
  decodeAuthContext,
  encodeAuthContext,
  stripIdentityHeaders,
} from "@/lib/auth/context";
import { resolveMiddlewareBearerAuth } from "@/lib/auth/middleware-auth";
import { ApiError, apiErrorToBody, handleApiError } from "@/lib/api";

const PUBLIC_PREFIXES = [
  "/api/v1/nodes",
  "/api/v1/uploads/config",
  "/api/v1/openapi.json",
  "/api/webhooks/clerk",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isSseEventsPath(pathname: string): boolean {
  return /^\/api\/v1\/runs\/[^/]+\/events$/.test(pathname);
}

function getBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    const body = apiErrorToBody(err.code, err.message, {
      cause: err.cause,
      metadata: err.metadata,
      retryability: err.retryability,
      details: err.details,
    });
    const headers: Record<string, string> = {};
    if (err.code === "RATE_LIMITED" && err.metadata?.reset != null) {
      headers["Retry-After"] = String(err.metadata.reset);
    }
    return NextResponse.json(body, { status: err.status, headers });
  }

  return handleApiError(err);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/api/v1/") || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (isSseEventsPath(pathname)) {
    return NextResponse.next();
  }

  const signedAuth = req.headers.get(AUTH_CONTEXT_HEADER)?.trim();
  if (signedAuth) {
    try {
      const auth = await decodeAuthContext(signedAuth);
      const requestHeaders = stripIdentityHeaders(req.headers);
      requestHeaders.set(AUTH_CONTEXT_HEADER, await encodeAuthContext(auth));

      return NextResponse.next({
        request: { headers: requestHeaders },
      });
    } catch (err) {
      return errorResponse(err);
    }
  }

  const token = getBearerToken(req);
  if (!token) {
    return errorResponse(
      new ApiError(401, "UNAUTHORIZED", "Authentication required", {
        cause: "missing_bearer_token",
      }),
    );
  }

  try {
    const auth = await resolveMiddlewareBearerAuth(token);

    if (auth === "defer") {
      return NextResponse.next({
        request: { headers: stripIdentityHeaders(req.headers) },
      });
    }

    const requestHeaders = stripIdentityHeaders(req.headers);
    requestHeaders.set(AUTH_CONTEXT_HEADER, await encodeAuthContext(auth));

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export const config = {
  matcher: ["/api/v1/:path*", "/api/webhooks/:path*"],
};
