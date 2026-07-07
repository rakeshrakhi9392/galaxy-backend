import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { runs } from "@trigger.dev/sdk/v3";

const INTEGRATION_TIMEOUT_MS = 180_000;

function integrationEnabled(): boolean {
  return (
    Boolean(process.env.TRIGGER_SECRET_KEY?.trim()) &&
    Boolean(process.env.DATABASE_URL?.trim()) &&
    process.env.TRIGGER_INTEGRATION === "1"
  );
}

/** Request → gpt-image-2 stub exercises child Trigger task + wait.forToken webhook path. */
const WEBHOOK_CHILD_GRAPH = {
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    {
      id: "node_request",
      type: "request",
      position: { x: 0, y: 0 },
      data: {
        label: "Request-Inputs",
        config: {},
        inputs: {},
        dynamicFields: [
          {
            id: "field_prompt",
            name: "Prompt",
            type: "text",
            value: "integration webhook child test",
          },
        ],
      },
    },
    {
      id: "node_image",
      type: "gpt-image-2",
      position: { x: 420, y: 0 },
      data: {
        label: "GPT Image 2",
        config: {
          providers: ["openai-gpt-image-2-stub"],
          timeoutMs: 120_000,
          retryPerProvider: 1,
        },
        inputs: {
          mode: "text_to_image",
          prompt: "",
          image: "",
          size: "auto",
          quality: "low",
          n: 1,
          output_format: "png",
          background: "auto",
        },
      },
    },
  ],
  edges: [
    {
      id: "edge_req_img",
      source: "node_request",
      target: "node_image",
      sourceHandle: "field_prompt",
      targetHandle: "in:prompt",
      type: "default",
    },
  ],
} satisfies Prisma.InputJsonObject;

async function waitForTerminalRunMetadata(
  triggerRunId: string,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  let last: Record<string, unknown> = {};

  for await (const update of runs.subscribeToRun(triggerRunId, { signal })) {
    const metadata = update.metadata;
    if (metadata && typeof metadata === "object") {
      last = metadata as Record<string, unknown>;
    }

    const status = metadata?.status;
    if (status === "SUCCESS" || status === "FAILED" || update.isCompleted) {
      return last;
    }
  }

  return last;
}

describe.skipIf(!integrationEnabled())("Trigger.dev webhook child integration", () => {
  let previousStubDelay: string | undefined;

  beforeEach(() => {
    previousStubDelay = process.env.WEBHOOK_STUB_DELAY_MS;
    process.env.WEBHOOK_STUB_DELAY_MS = "0";
  });

  afterEach(() => {
    if (previousStubDelay === undefined) {
      delete process.env.WEBHOOK_STUB_DELAY_MS;
    } else {
      process.env.WEBHOOK_STUB_DELAY_MS = previousStubDelay;
    }
  });

  it(
    "runs a gpt-image-2 child task through wait.forToken and persists provider output",
    async () => {
      const { prisma } = await import("@/lib/prisma");
      const { MOCK_OWNER_USER_ID } = await import("@/lib/constants");
      const { enqueueWorkflowRun } = await import("@/lib/orchestrator");

      const workflow = await prisma.workflow.create({
        data: {
          ownerId: MOCK_OWNER_USER_ID,
          name: `Webhook child integration ${Date.now()}`,
          type: "USER",
          graph: WEBHOOK_CHILD_GRAPH,
        },
      });

      const run = await prisma.workflowRun.create({
        data: {
          workflowId: workflow.id,
          ownerId: MOCK_OWNER_USER_ID,
          scope: "FULL",
          targetNodeIds: [],
          graphSnapshot: workflow.graph as Prisma.InputJsonValue,
          status: "QUEUED",
          initiator: "UI",
        },
      });

      try {
        const { triggerRunId } = await enqueueWorkflowRun({
          workflowId: workflow.id,
          runId: run.id,
        });

        expect(triggerRunId).toBeTruthy();

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), INTEGRATION_TIMEOUT_MS);

        const terminalMetadata = await waitForTerminalRunMetadata(
          triggerRunId,
          controller.signal,
        ).finally(() => {
          clearTimeout(timeout);
        });

        expect(terminalMetadata.status).toBe("SUCCESS");

        const hydratedRun = await prisma.workflowRun.findUnique({
          where: { id: run.id },
          include: {
            nodeRuns: {
              orderBy: { startedAt: "asc" },
              include: { providerAttempts: { orderBy: { createdAt: "asc" } } },
            },
          },
        });

        expect(hydratedRun?.status).toBe("SUCCESS");
        expect(hydratedRun?.triggerRunId).toBe(triggerRunId);

        const requestRun = hydratedRun?.nodeRuns.find((row) => row.nodeId === "node_request");
        const imageRun = hydratedRun?.nodeRuns.find((row) => row.nodeId === "node_image");

        expect(requestRun?.status).toBe("SUCCESS");
        expect(requestRun?.provider).toBeNull();

        expect(imageRun?.status).toBe("SUCCESS");
        expect(imageRun?.provider).toBe("openai-gpt-image-2-stub");

        const output = imageRun?.resolvedOutput as { result?: Array<{ url?: string }> } | null;
        expect(Array.isArray(output?.result)).toBe(true);
        expect(output?.result?.[0]?.url).toMatch(/^https:\/\//);

        const successAttempt = imageRun?.providerAttempts.find(
          (attempt) => attempt.status === "SUCCESS",
        );
        expect(successAttempt?.provider).toBe("openai-gpt-image-2-stub");
      } finally {
        await prisma.nodeRun.deleteMany({ where: { workflowRunId: run.id } });
        await prisma.workflowRun.deleteMany({ where: { id: run.id } });
        await prisma.workflow.deleteMany({ where: { id: workflow.id } });
        await prisma.$disconnect();
      }
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
