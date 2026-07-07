import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  workflowRun: {
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};

const tasksTriggerMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@trigger.dev/sdk/v3", () => ({
  tasks: {
    trigger: tasksTriggerMock,
  },
}));

describe("enqueueWorkflowRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    prismaMock.workflowRun.update.mockResolvedValue({});
    prismaMock.workflowRun.updateMany.mockResolvedValue({ count: 1 });
  });

  it("fails when TRIGGER_SECRET_KEY is missing", async () => {
    const { enqueueWorkflowRun } = await import("./orchestrator");

    await expect(
      enqueueWorkflowRun({ workflowId: "wf-1", runId: "run-1" }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("TRIGGER_SECRET_KEY"),
    });

    expect(tasksTriggerMock).not.toHaveBeenCalled();
    expect(prismaMock.workflowRun.updateMany).toHaveBeenCalledWith({
      where: { id: "run-1", status: { in: ["QUEUED", "RUNNING"] } },
      data: expect.objectContaining({
        status: "FAILED",
        errorSummary: expect.stringContaining("TRIGGER_SECRET_KEY"),
      }),
    });
  });

  it("enqueues orchestrate-workflow-run when Trigger is configured", async () => {
    vi.stubEnv("TRIGGER_SECRET_KEY", "tr_dev_test");
    tasksTriggerMock.mockResolvedValue({ id: "trigger-run-1" });

    const { enqueueWorkflowRun } = await import("./orchestrator");

    const result = await enqueueWorkflowRun({ workflowId: "wf-1", runId: "run-1" });

    expect(result).toEqual({ triggerRunId: "trigger-run-1" });
    expect(tasksTriggerMock).toHaveBeenCalledWith("orchestrate-workflow-run", {
      workflowId: "wf-1",
      runId: "run-1",
    });
    expect(prismaMock.workflowRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: { triggerRunId: "trigger-run-1" },
    });
  });

  it("marks the run failed when Trigger enqueue rejects", async () => {
    vi.stubEnv("TRIGGER_SECRET_KEY", "tr_dev_test");
    tasksTriggerMock.mockRejectedValue(new Error("network down"));

    const { enqueueWorkflowRun } = await import("./orchestrator");

    await expect(
      enqueueWorkflowRun({ workflowId: "wf-1", runId: "run-1" }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("Failed to enqueue"),
    });

    expect(prismaMock.workflowRun.updateMany).toHaveBeenCalledWith({
      where: { id: "run-1", status: { in: ["QUEUED", "RUNNING"] } },
      data: expect.objectContaining({
        status: "FAILED",
        errorSummary: "network down",
      }),
    });
  });
});
