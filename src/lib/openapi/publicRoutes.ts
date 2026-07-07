/**
 * Canonical registry of public REST routes under /api/v1.
 * Used by OpenAPI coverage tests — keep in sync when adding routes.
 */
export type PublicRoute = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  /** Routes that do not require Bearer auth */
  public?: boolean;
};

export const PUBLIC_API_ROUTES: PublicRoute[] = [
  { method: "GET", path: "/api/v1/openapi.json", public: true },
  { method: "GET", path: "/api/v1/nodes", public: true },
  { method: "GET", path: "/api/v1/uploads/config", public: true },
  { method: "GET", path: "/api/v1/account" },
  { method: "GET", path: "/api/v1/workflows" },
  { method: "POST", path: "/api/v1/workflows" },
  { method: "GET", path: "/api/v1/workflows/{workflowId}" },
  { method: "PUT", path: "/api/v1/workflows/{workflowId}" },
  { method: "PATCH", path: "/api/v1/workflows/{workflowId}" },
  { method: "DELETE", path: "/api/v1/workflows/{workflowId}" },
  { method: "POST", path: "/api/v1/workflows/estimate-credits" },
  { method: "POST", path: "/api/v1/workflows/validate-limits" },
  { method: "GET", path: "/api/v1/workflows/{workflowId}/runs" },
  { method: "POST", path: "/api/v1/workflows/{workflowId}/runs" },
  { method: "GET", path: "/api/v1/runs/{runId}" },
  { method: "POST", path: "/api/v1/runs/{runId}/cancel" },
  { method: "GET", path: "/api/v1/system-workflows" },
  { method: "GET", path: "/api/v1/system-workflows/{slug}" },
  { method: "POST", path: "/api/v1/nodes/estimate-credits" },
  { method: "GET", path: "/api/v1/api-keys" },
  { method: "POST", path: "/api/v1/api-keys" },
  { method: "DELETE", path: "/api/v1/api-keys/{apiKeyId}" },
  { method: "GET", path: "/api/v1/webhooks" },
  { method: "POST", path: "/api/v1/webhooks" },
  { method: "PATCH", path: "/api/v1/webhooks/{webhookId}" },
  { method: "DELETE", path: "/api/v1/webhooks/{webhookId}" },
  { method: "GET", path: "/api/v1/credits/balance" },
  { method: "GET", path: "/api/v1/credits/transactions" },
  { method: "POST", path: "/api/v1/uploads" },
];

export function openApiPathKey(route: PublicRoute): string {
  return `${route.method} ${route.path}`;
}
