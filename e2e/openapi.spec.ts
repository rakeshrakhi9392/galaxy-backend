import { expect, test } from "@playwright/test";

test.describe("Public API", () => {
  test("serves OpenAPI document", async ({ request }) => {
    const res = await request.get("/api/v1/openapi.json");
    expect(res.ok()).toBeTruthy();

    const body = (await res.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };

    expect(body.openapi).toMatch(/^3\./);
    expect(Object.keys(body.paths).length).toBeGreaterThan(0);
  });
});
