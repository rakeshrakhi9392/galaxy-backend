const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:4010",
  "https://galaxy-frontend-five.vercel.app",
  "https://abcd-311b96b4.mintlify.app",
]);

export function isAllowedCorsOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return origin.endsWith(".mintlify.app");
}

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!isAllowedCorsOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Requested-With, mcp-session-id, mcp-protocol-version",
    "Access-Control-Max-Age": "86400",
  };
}

export function corsPreflightResponse(origin: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export function applyCorsHeaders(headers: Headers, origin: string | null): void {
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    headers.set(key, value);
  }
}
