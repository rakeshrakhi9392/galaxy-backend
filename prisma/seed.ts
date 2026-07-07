import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SYSTEM_WORKFLOW_TEMPLATES } from "@galaxy/schemas";
import { DEFAULT_CREDIT_BALANCE, MOCK_OWNER_USER_ID, SYSTEM_OWNER_USER_ID } from "../src/lib/constants";
import { ensureInitialGrantLedgerRow } from "../src/lib/creditsLedger";
import { DEV_UNKEY_KEY_ID } from "../src/lib/auth/apiKey";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function createDefaultRequestNode(id: string, x: number, y: number) {
  const fieldId = `field_${id}_prompt`;
  return {
    id,
    type: "request",
    position: { x, y },
    data: {
      label: "Request-Inputs",
      config: {},
      inputs: {},
      dynamicFields: [
        {
          id: fieldId,
          name: "Prompt",
          type: "text",
          value: "",
        },
      ],
    },
  };
}

async function main() {
  await prisma.user.upsert({
    where: { id: MOCK_OWNER_USER_ID },
    create: {
      id: MOCK_OWNER_USER_ID,
      email: "demo@galaxy.ai",
      creditBalance: DEFAULT_CREDIT_BALANCE,
    },
    update: {},
  });
  await ensureInitialGrantLedgerRow(MOCK_OWNER_USER_ID);

  await prisma.user.upsert({
    where: { id: SYSTEM_OWNER_USER_ID },
    create: {
      id: SYSTEM_OWNER_USER_ID,
      email: "system@galaxy.ai",
      creditBalance: 0,
    },
    update: {},
  });

  for (const template of SYSTEM_WORKFLOW_TEMPLATES) {
    await prisma.workflow.upsert({
      where: { slug: template.slug },
      create: {
        ownerId: SYSTEM_OWNER_USER_ID,
        name: template.name,
        description: template.description,
        type: "SYSTEM",
        slug: template.slug,
        thumbnailUrl: template.thumbnailUrl,
        graph: template.graph,
      },
      update: {
        name: template.name,
        description: template.description,
        thumbnailUrl: template.thumbnailUrl,
        graph: template.graph,
      },
    });
  }

  const existing = await prisma.workflow.findFirst({
    where: { ownerId: MOCK_OWNER_USER_ID, name: "Demo workflow" },
  });
  if (!existing) {
    const requestId = "node_request";
    const llmId = "node_llm";
    const responseId = "node_response";
    const fieldId = `field_${requestId}_prompt`;

    await prisma.workflow.create({
      data: {
        ownerId: MOCK_OWNER_USER_ID,
        name: "Demo workflow",
        description: null,
        type: "USER",
        graph: {
          viewport: { x: 0, y: 0, zoom: 0.45 },
          nodes: [
            createDefaultRequestNode(requestId, 96, 120),
            {
              id: llmId,
              type: "llm",
              position: { x: 640, y: 120 },
              data: {
                label: "LLM",
                config: {},
                inputs: {
                  prompt: "",
                  system_prompt: "",
                  temperature: 0.7,
                  max_tokens: 1024,
                },
              },
            },
            {
              id: responseId,
              type: "response",
              position: { x: 1184, y: 120 },
              data: {
                label: "Response",
                config: {},
                inputs: {},
              },
            },
          ],
          edges: [
            {
              id: `edge_${requestId}_${llmId}`,
              source: requestId,
              target: llmId,
              sourceHandle: fieldId,
              targetHandle: "in:prompt",
              type: "default",
            },
            {
              id: `edge_${llmId}_${responseId}`,
              source: llmId,
              target: responseId,
              sourceHandle: "out:output",
              targetHandle: "result",
              type: "default",
            },
          ],
        },
      },
    });
  }

  const devApiKeyPrefix =
    process.env.DEV_API_KEY?.trim().slice(0, 12) ?? "gal_dev_demo";

  await prisma.apiKey.upsert({
    where: { unkeyKeyId: DEV_UNKEY_KEY_ID },
    create: {
      id: "apikey_dev_local",
      userId: MOCK_OWNER_USER_ID,
      name: "Development API key",
      keyPrefix: devApiKeyPrefix,
      unkeyKeyId: DEV_UNKEY_KEY_ID,
    },
    update: {
      keyPrefix: devApiKeyPrefix,
      revokedAt: null,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
