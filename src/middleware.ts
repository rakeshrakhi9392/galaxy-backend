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
import { applyCorsHeaders, corsHeaders, corsPreflightResponse } from "@/lib/cors";

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

function withCors(response: NextResponse, origin: string | null): NextResponse {
  applyCorsHeaders(response.headers, origin);
  return response;
}

function errorResponse(err: unknown, origin: string | null) {
  if (err instanceof ApiError) {
    const body = apiErrorToBody(err.code, err.message, {
      cause: err.cause,
      metadata: err.metadata,
      retryability: err.retryability,
      details: err.details,
    });
    const headers: Record<string, string> = { ...corsHeaders(origin) };
    if (err.code === "RATE_LIMITED" && err.metadata?.reset != null) {
      headers["Retry-After"] = String(err.metadata.reset);
    }
    return NextResponse.json(body, { status: err.status, headers });
  }

  return withCors(handleApiError(err), origin);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");

  if (pathname.startsWith("/api/v1/") && req.method === "OPTIONS") {
    return corsPreflightResponse(origin);
  }

  if (!pathname.startsWith("/api/v1/") || isPublicPath(pathname)) {
    if (pathname.startsWith("/api/v1/")) {
      return withCors(NextResponse.next(), origin);
    }
    return NextResponse.next();
  }

  if (isSseEventsPath(pathname)) {
    return withCors(NextResponse.next(), origin);
  }

  const signedAuth = req.headers.get(AUTH_CONTEXT_HEADER)?.trim();
  if (signedAuth) {
    try {
      const auth = await decodeAuthContext(signedAuth);
      const requestHeaders = stripIdentityHeaders(req.headers);
      requestHeaders.set(AUTH_CONTEXT_HEADER, await encodeAuthContext(auth));

      return withCors(
        NextResponse.next({
          request: { headers: requestHeaders },
        }),
        origin,
      );
    } catch (err) {
      return errorResponse(err, origin);
    }
  }

  const token = getBearerToken(req);
  if (!token) {
    return errorResponse(
      new ApiError(401, "UNAUTHORIZED", "Authentication required", {
        cause: "missing_bearer_token",
      }),
      origin,
    );
  }

  try {
    const auth = await resolveMiddlewareBearerAuth(token);

    if (auth === "defer") {
      return withCors(
        NextResponse.next({
          request: { headers: stripIdentityHeaders(req.headers) },
        }),
        origin,
      );
    }

    const requestHeaders = stripIdentityHeaders(req.headers);
    requestHeaders.set(AUTH_CONTEXT_HEADER, await encodeAuthContext(auth));

    return withCors(
      NextResponse.next({
        request: { headers: requestHeaders },
      }),
      origin,
    );
  } catch (err) {
    return errorResponse(err, origin);
  }
}

export const config = {
  matcher: ["/api/v1/:path*", "/api/webhooks/:path*"],
};
