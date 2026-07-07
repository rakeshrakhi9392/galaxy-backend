import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { AUTH_CONTEXT_HEADER, encodeAuthContext } from "@/lib/auth/context";
import { MOCK_OWNER_USER_ID } from "@/lib/constants";
import { RunFetchWithNodesResponseSchema } from "@/lib/schemas";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRun: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const RUN_ID = "run_test_123";

async function authedRequest(url: string) {
  const authContext = await encodeAuthContext({
    userId: MOCK_OWNER_USER_ID,
    method: "dev_bypass",
  });
  return new Request(url, {
    headers: { [AUTH_CONTEXT_HEADER]: authContext },
  });
}

describe("GET /api/v1/runs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: MOCK_OWNER_USER_ID,
      email: null,
      creditBalance: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("includes providerAttempts on node runs", async () => {
    const now = new Date("2026-07-03T12:00:00.000Z");
    vi.mocked(prisma.workflowRun.findFirst).mockResolvedValue({
      id: RUN_ID,
      workflowId: "wf_1",
      ownerId: MOCK_OWNER_USER_ID,
      scope: "FULL",
      status: "SUCCESS",
      initiator: "UI",
      targetNodeIds: [],
      triggerRunId: null,
      estimatedCredits: 10,
      actualCredits: 10,
      startedAt: now,
      finishedAt: now,
      errorSummary: null,
      graphSnapshot: { nodes: [], edges: [] },
      idempotencyKey: null,
      createdAt: now,
      updatedAt: now,
      nodeRuns: [
        {
          id: "nr_1",
          workflowRunId: RUN_ID,
          nodeId: "n1",
          nodeType: "llm",
          attempt: 1,
          status: "SUCCESS",
          startedAt: now,
          finishedAt: now,
          resolvedInput: { prompt: "hi" },
          resolvedOutput: { output: "hello" },
          provider: "openrouter-stub",
          error: null,
          estimatedCredits: 5,
          actualCredits: 5,
          triggerRunId: null,
          createdAt: now,
          updatedAt: now,
          providerAttempts: [
            {
              id: "pa_1",
              nodeRunId: "nr_1",
              provider: "openrouter-stub",
              status: "SUCCESS",
              durationMs: 120,
              error: null,
              errorCode: null,
              createdAt: now,
            },
          ],
        },
      ],
    } as never);

    const res = await GET(await authedRequest(`http://localhost:4010/api/v1/runs/${RUN_ID}`), {
      params: Promise.resolve({ id: RUN_ID }),
    });

    expect(res.status).toBe(200);
    const body = RunFetchWithNodesResponseSchema.parse(await res.json());
    expect(body.nodeRuns).toHaveLength(1);
    expect(body.nodeRuns[0]?.providerAttempts).toHaveLength(1);
    expect(body.nodeRuns[0]?.providerAttempts?.[0]?.provider).toBe("openrouter-stub");
  });
});
