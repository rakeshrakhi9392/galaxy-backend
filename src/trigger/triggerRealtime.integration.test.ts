import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { runs } from "@trigger.dev/sdk/v3";

const INTEGRATION_TIMEOUT_MS = 120_000;

function integrationEnabled(): boolean {
  return (
    Boolean(process.env.TRIGGER_SECRET_KEY?.trim()) &&
    Boolean(process.env.DATABASE_URL?.trim()) &&
    process.env.TRIGGER_INTEGRATION === "1"
  );
}

/** Request-only graph — finishes quickly without paid providers or OpenRouter. */
const MINIMAL_REQUEST_GRAPH = {
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
            id: "field_node_request_prompt",
            name: "Prompt",
            type: "text",
            value: "",
          },
        ],
      },
    },
  ],
  edges: [],
} satisfies Prisma.InputJsonObject;

async function collectRealtimeMetadata(
  triggerRunId: string,
  signal: AbortSignal,
): Promise<Array<Record<string, unknown>>> {
  const snapshots: Array<Record<string, unknown>> = [];

  for await (const update of runs.subscribeToRun(triggerRunId, { signal })) {
    const metadata = update.metadata;
    if (metadata && typeof metadata === "object") {
      snapshots.push(metadata as Record<string, unknown>);
    }

    const status = metadata?.status;
    if (status === "SUCCESS" || status === "FAILED" || update.isCompleted) {
      break;
    }
  }

  return snapshots;
}

describe.skipIf(!integrationEnabled())("Trigger.dev realtime integration", () => {
  it(
    "enqueues a run, issues a public token, and streams orchestrator metadata",
    async () => {
      const { prisma } = await import("@/lib/prisma");
      const { MOCK_OWNER_USER_ID } = await import("@/lib/constants");
      const { enqueueWorkflowRun } = await import("@/lib/orchestrator");
      const { createTriggerRunPublicToken } = await import("@/lib/triggerRealtime");

      const workflow =
        (await prisma.workflow.findFirst({
          where: { ownerId: MOCK_OWNER_USER_ID },
          orderBy: { createdAt: "asc" },
        })) ??
        (await prisma.workflow.create({
          data: {
            ownerId: MOCK_OWNER_USER_ID,
            name: `Realtime integration ${Date.now()}`,
            type: "USER",
            graph: MINIMAL_REQUEST_GRAPH,
          },
        }));

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

        const publicAccessToken = await createTriggerRunPublicToken(triggerRunId);
        expect(publicAccessToken).toBeTruthy();

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), INTEGRATION_TIMEOUT_MS);

        const metadataSnapshots = await collectRealtimeMetadata(
          triggerRunId,
          controller.signal,
        ).finally(() => {
          clearTimeout(timeout);
        });

        expect(metadataSnapshots.length).toBeGreaterThan(0);

        const sawRunning = metadataSnapshots.some((metadata) => metadata.status === "RUNNING");
        const sawNodeStatuses = metadataSnapshots.some((metadata) => {
          const nodeStatuses = metadata.nodeStatuses;
          return nodeStatuses != null && typeof nodeStatuses === "object";
        });
        const terminal = metadataSnapshots.at(-1);
        const terminalStatus = terminal?.status;

        expect(sawRunning || sawNodeStatuses).toBe(true);
        expect(terminalStatus === "SUCCESS" || terminalStatus === "FAILED").toBe(true);

        const hydrated = await prisma.workflowRun.findUnique({ where: { id: run.id } });
        expect(hydrated?.triggerRunId).toBe(triggerRunId);
        expect(hydrated?.status).toBe(terminalStatus === "SUCCESS" ? "SUCCESS" : "FAILED");
      } finally {
        await prisma.workflowRun.deleteMany({ where: { id: run.id } });
        await prisma.$disconnect();
      }
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
