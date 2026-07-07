import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { AUTH_CONTEXT_HEADER, encodeAuthContext } from "@/lib/auth/context";
import { MOCK_OWNER_USER_ID } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflow: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    workflowRun: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/orchestrator", () => ({
  enqueueWorkflowRun: vi.fn(),
}));

const WORKFLOW_ID = "wf_credits_test";

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
  ],
  edges: [{ id: "e1", source: "req", target: "img", sourceHandle: null, targetHandle: null }],
};

function makeWorkflow() {
  return {
    id: WORKFLOW_ID,
    ownerId: MOCK_OWNER_USER_ID,
    name: "Credits Test",
    description: null,
    type: "USER" as const,
    graph: CHARGEABLE_GRAPH,
    version: 1,
    thumbnailUrl: null,
    slug: null,
    createdAt: new Date("2026-07-03T10:00:00.000Z"),
    updatedAt: new Date("2026-07-03T10:00:00.000Z"),
  };
}

async function authedPost(body: unknown) {
  const authContext = await encodeAuthContext({
    userId: MOCK_OWNER_USER_ID,
    method: "dev_bypass",
  });

  return new Request(`http://localhost:4010/api/v1/workflows/${WORKFLOW_ID}/runs`, {
    method: "POST",
    headers: {
      [AUTH_CONTEXT_HEADER]: authContext,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/workflows/:id/runs", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("AUTH_DISABLED", "true");

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: MOCK_OWNER_USER_ID,
      email: null,
      creditBalance: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.workflow.findFirst).mockResolvedValue(makeWorkflow() as never);
  });

  it("returns 402 INSUFFICIENT_CREDITS when balance is below the subgraph estimate", async () => {
    const { enqueueWorkflowRun } = await import("@/lib/orchestrator");

    const res = await POST(await authedPost({ targetNodeIds: [] }), {
      params: Promise.resolve({ id: WORKFLOW_ID }),
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error.code).toBe("INSUFFICIENT_CREDITS");
    expect(body.error.message).toMatch(/Insufficient credits/i);
    expect(body.error.metadata).toEqual({
      required: 210_000,
      balance: 100,
    });
    expect(body.error.retryability).toBe("none");

    expect(prisma.workflowRun.create).not.toHaveBeenCalled();
    expect(enqueueWorkflowRun).not.toHaveBeenCalled();
  });
});
