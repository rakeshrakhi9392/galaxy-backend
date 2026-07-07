import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { AUTH_CONTEXT_HEADER, encodeAuthContext } from "@/lib/auth/context";
import { MOCK_OWNER_USER_ID } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

async function authedRequest(body: unknown) {
  const authContext = await encodeAuthContext({
    userId: MOCK_OWNER_USER_ID,
    method: "dev_bypass",
  });

  return new Request("http://localhost:4010/api/v1/nodes/estimate-credits", {
    method: "POST",
    headers: {
      [AUTH_CONTEXT_HEADER]: authContext,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/nodes/estimate-credits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: MOCK_OWNER_USER_ID,
      email: null,
      creditBalance: 100_000_000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("returns per-node microcredit estimates", async () => {
    const res = await POST(
      await authedRequest({
        nodes: [
          { type: "gpt-image-2", data: { quality: "high", n: 1 } },
          { type: "request", data: {} },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { estimates: Array<{ microcredits: number }> };
    expect(body.estimates).toEqual([{ microcredits: 210_000 }, { microcredits: 0 }]);
  });

  it("returns 400 for unknown node types", async () => {
    const res = await POST(
      await authedRequest({
        nodes: [{ type: "not-a-real-node", data: {} }],
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("returns 400 when more than 100 nodes are submitted", async () => {
    const nodes = Array.from({ length: 101 }, (_, index) => ({
      type: "request",
      data: { id: index },
    }));

    const res = await POST(await authedRequest({ nodes }));
    expect(res.status).toBe(400);
  });
});
