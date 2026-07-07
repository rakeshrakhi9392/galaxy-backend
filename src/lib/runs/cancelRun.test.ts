import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelWorkflowRunForUser } from "./cancelRun";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRun: {
      findFirst: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

const OWNER = "user_1";
const RUN_ID = "run_1";

describe("cancelWorkflowRunForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels a running workflow run", async () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    vi.mocked(prisma.workflowRun.findFirst).mockResolvedValue({
      id: RUN_ID,
      workflowId: "wf_1",
      ownerId: OWNER,
      scope: "FULL",
      status: "RUNNING",
      initiator: "API",
      targetNodeIds: [],
      triggerRunId: null,
      estimatedCredits: 100,
      actualCredits: null,
      startedAt,
      finishedAt: null,
      errorSummary: null,
      idempotencyKey: null,
      apiKeyId: null,
      graphSnapshot: {},
      createdAt: startedAt,
      updatedAt: startedAt,
    } as never);

    vi.mocked(prisma.workflowRun.findUniqueOrThrow).mockResolvedValue({
      id: RUN_ID,
      workflowId: "wf_1",
      scope: "FULL",
      status: "CANCELLED",
      initiator: "API",
      targetNodeIds: [],
      estimatedCredits: 100,
      actualCredits: null,
      startedAt,
      finishedAt: new Date("2026-01-01T00:01:00.000Z"),
      errorSummary: null,
      createdAt: startedAt,
      updatedAt: new Date("2026-01-01T00:01:00.000Z"),
    } as never);

    const result = await cancelWorkflowRunForUser(OWNER, RUN_ID);
    expect(result.run.status).toBe("CANCELLED");
    expect(prisma.workflowRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
  });

  it("rejects cancelling a completed run", async () => {
    vi.mocked(prisma.workflowRun.findFirst).mockResolvedValue({
      id: RUN_ID,
      ownerId: OWNER,
      status: "SUCCESS",
    } as never);

    await expect(cancelWorkflowRunForUser(OWNER, RUN_ID)).rejects.toBeInstanceOf(ApiError);
  });
});
