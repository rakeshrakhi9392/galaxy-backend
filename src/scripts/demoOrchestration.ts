import type { Prisma, WorkflowRunScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MOCK_OWNER_USER_ID } from "@/lib/constants";
import { enqueueWorkflowRun } from "@/lib/orchestrator";

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const scope = (readArg("--scope") ?? "FULL") as WorkflowRunScope;
  const targetNodeId = readArg("--node");

  const workflow = await prisma.workflow.findFirst({
    where: { ownerId: MOCK_OWNER_USER_ID },
    orderBy: { createdAt: "asc" },
  });
  if (!workflow) throw new Error("No workflow found. Run `pnpm seed` first.");

  const run = await prisma.workflowRun.create({
    data: {
      workflowId: workflow.id,
      ownerId: workflow.ownerId,
      scope,
      targetNodeIds: targetNodeId ? [targetNodeId] : [],
      graphSnapshot: workflow.graph as Prisma.InputJsonValue,
      status: "QUEUED",
    },
  });

  await enqueueWorkflowRun({ workflowId: workflow.id, runId: run.id });

  const hydrated = await prisma.workflowRun.findUnique({
    where: { id: run.id },
    include: {
      nodeRuns: {
        orderBy: { createdAt: "asc" },
        include: { providerAttempts: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  console.log(JSON.stringify(hydrated, null, 2));
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
