import { describe, expect, it } from "vitest";
import { openApiPaths } from "./paths";
import { openApiPathKey, PUBLIC_API_ROUTES } from "./publicRoutes";

function documentedOperations(): Set<string> {
  const keys = new Set<string>();
  for (const [path, methods] of Object.entries(openApiPaths)) {
    for (const method of Object.keys(methods)) {
      keys.add(`${method.toUpperCase()} ${path}`);
    }
  }
  return keys;
}

describe("OpenAPI public route coverage", () => {
  it("documents every route in PUBLIC_API_ROUTES", () => {
    const documented = documentedOperations();
    const missing = PUBLIC_API_ROUTES.filter((route) => !documented.has(openApiPathKey(route)));
    expect(missing, `Missing OpenAPI docs: ${missing.map(openApiPathKey).join(", ")}`).toEqual([]);
  });

  it("does not document unknown routes", () => {
    const documented = documentedOperations();
    const allowed = new Set(PUBLIC_API_ROUTES.map(openApiPathKey));
    const extra = [...documented].filter((key) => !allowed.has(key));
    expect(extra, `Undocumented registry entries needed for: ${extra.join(", ")}`).toEqual([]);
  });
});
