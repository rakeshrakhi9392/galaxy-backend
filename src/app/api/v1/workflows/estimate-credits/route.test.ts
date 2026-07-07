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

const CHARGEABLE_GRAPH = {
  nodes: [
    {
      id: "req",
      type: "request",
      position: { x: 0, y: 0 },
      data: {
        dynamicFields: [{ id: "field_req_prompt", name: "Prompt", type: "text", value: "hi" }],
      },
    },
    {
      id: "img",
      type: "gpt-image-2",
      position: { x: 0, y: 0 },
      data: {
        inputs: { prompt: "fox", quality: "high", n: 1 },
      },
    },
    {
      id: "extra",
      type: "gpt-image-2",
      position: { x: 0, y: 0 },
      data: {
        inputs: { prompt: "unused", quality: "high", n: 1 },
      },
    },
  ],
  edges: [{ id: "e1", source: "req", target: "img", sourceHandle: null, targetHandle: null }],
};

async function authedRequest(body: unknown) {
  const authContext = await encodeAuthContext({
    userId: MOCK_OWNER_USER_ID,
    method: "dev_bypass",
  });

  return new Request("http://localhost:4010/api/v1/workflows/estimate-credits", {
    method: "POST",
    headers: {
      [AUTH_CONTEXT_HEADER]: authContext,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/workflows/estimate-credits", () => {
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

  it("returns totalMicrocredits and per-node breakdown", async () => {
    const res = await POST(
      await authedRequest({
        nodes: [
          { type: "gpt-image-2", data: { quality: "high", n: 1 } },
          { type: "llm", data: { prompt: "hello", model: "google/gemini-3.5-flash" } },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalMicrocredits: number;
      estimates: Array<{ microcredits: number }>;
    };

    const sum = body.estimates.reduce((total, item) => total + item.microcredits, 0);
    expect(body.totalMicrocredits).toBe(sum);
    expect(body.estimates[0]?.microcredits).toBe(210_000);
  });

  it("estimates the execution subgraph when graph + targetNodeIds are provided", async () => {
    const res = await POST(
      await authedRequest({
        graph: CHARGEABLE_GRAPH,
        targetNodeIds: ["img"],
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalMicrocredits: number;
      estimates: Array<{ microcredits: number }>;
    };

    expect(body.totalMicrocredits).toBe(210_000);
    expect(body.estimates).toEqual([{ microcredits: 210_000 }]);
  });
});
