import { prisma } from "@/lib/prisma";

export async function findReadableWorkflow(id: string, userId: string) {
  return prisma.workflow.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId, type: "USER" }, { type: "SYSTEM" }],
    },
  });
}

export async function findEditableWorkflow(id: string, userId: string) {
  return prisma.workflow.findFirst({
    where: { id, ownerId: userId, type: "USER" },
  });
}
