import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "./route";
import { AUTH_CONTEXT_HEADER, encodeAuthContext } from "@/lib/auth/context";
import { MOCK_OWNER_USER_ID } from "@/lib/constants";
import { WorkflowFetchResponseSchema, WorkflowSaveResponseSchema } from "@/lib/schemas";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflow: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const WORKFLOW_ID = "wf_test_viewport";

function makeWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKFLOW_ID,
    ownerId: MOCK_OWNER_USER_ID,
    name: "Test Workflow",
    description: null,
    type: "USER" as const,
    graph: {
      nodes: [{ id: "n1", type: "llm", position: { x: 0, y: 0 } }],
      edges: [],
      viewport: { x: 120, y: 80, zoom: 0.75 },
    },
    version: 2,
    thumbnailUrl: null,
    slug: null,
    createdAt: new Date("2026-07-03T10:00:00.000Z"),
    updatedAt: new Date("2026-07-03T12:00:00.000Z"),
    ...overrides,
  };
}

async function authedRequest(url: string, init?: RequestInit) {
  const authContext = await encodeAuthContext({
    userId: MOCK_OWNER_USER_ID,
    method: "dev_bypass",
  });
  return new Request(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      [AUTH_CONTEXT_HEADER]: authContext,
      "content-type": "application/json",
    },
  });
}

describe("GET/PUT /api/v1/workflows/:id", () => {
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

  it("returns viewport on GET after save round-trip", async () => {
    const workflow = makeWorkflow();
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue(workflow);

    const res = await GET(
      await authedRequest(`http://localhost:4010/api/v1/workflows/${WORKFLOW_ID}`),
      { params: Promise.resolve({ id: WORKFLOW_ID }) },
    );

    expect(res.status).toBe(200);
    const body = WorkflowFetchResponseSchema.parse(await res.json());
    expect(body.viewport).toEqual({ x: 120, y: 80, zoom: 0.75 });
  });

  it("returns 304 for document load when If-None-Match matches", async () => {
    const workflow = makeWorkflow();
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue(workflow);

    const first = await GET(
      await authedRequest(`http://localhost:4010/api/v1/workflows/${WORKFLOW_ID}`),
      { params: Promise.resolve({ id: WORKFLOW_ID }) },
    );
    expect(first.status).toBe(200);
    const etag = first.headers.get("ETag");
    expect(etag).toBeTruthy();

    const second = await GET(
      await authedRequest(`http://localhost:4010/api/v1/workflows/${WORKFLOW_ID}`, {
        headers: { "if-none-match": etag! },
      }),
      { params: Promise.resolve({ id: WORKFLOW_ID }) },
    );

    expect(second.status).toBe(304);
    expect(second.headers.get("ETag")).toBe(etag);
    expect(await second.text()).toBe("");
  });

  it("returns 409 VERSION_CONFLICT when expectedVersion is stale", async () => {
    const workflow = makeWorkflow({ version: 3 });
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue(workflow);

    const res = await PUT(
      await authedRequest(`http://localhost:4010/api/v1/workflows/${WORKFLOW_ID}`, {
        method: "PUT",
        body: JSON.stringify({
          nodes: workflow.graph.nodes,
          edges: workflow.graph.edges,
          viewport: workflow.graph.viewport,
          expectedVersion: 2,
        }),
      }),
      { params: Promise.resolve({ id: WORKFLOW_ID }) },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("VERSION_CONFLICT");
    expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
  });

  it("rejects cyclic graphs with INVALID_GRAPH", async () => {
    const workflow = makeWorkflow({
      graph: {
        nodes: [
          { id: "a", type: "llm", position: { x: 0, y: 0 } },
          { id: "b", type: "llm", position: { x: 100, y: 0 } },
        ],
        edges: [
          { id: "e1", source: "a", target: "b", sourceHandle: "out:result", targetHandle: "in:prompt" },
          { id: "e2", source: "b", target: "a", sourceHandle: "out:result", targetHandle: "in:prompt" },
        ],
      },
    });
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue(workflow);

    const res = await PUT(
      await authedRequest(`http://localhost:4010/api/v1/workflows/${WORKFLOW_ID}`, {
        method: "PUT",
        body: JSON.stringify({
          nodes: workflow.graph.nodes,
          edges: workflow.graph.edges,
          expectedVersion: 2,
        }),
      }),
      { params: Promise.resolve({ id: WORKFLOW_ID }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_GRAPH");
    expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
  });

  it("persists viewport on successful PUT", async () => {
    const workflow = makeWorkflow();
    const updated = makeWorkflow({
      version: 3,
      graph: {
        nodes: workflow.graph.nodes,
        edges: workflow.graph.edges,
        viewport: { x: 200, y: 50, zoom: 1 },
      },
    });
    vi.mocked(prisma.workflow.findFirst)
      .mockResolvedValueOnce(workflow)
      .mockResolvedValueOnce(updated);
    vi.mocked(prisma.workflow.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.workflow.findFirstOrThrow).mockResolvedValue(updated);

    const res = await PUT(
      await authedRequest(`http://localhost:4010/api/v1/workflows/${WORKFLOW_ID}`, {
        method: "PUT",
        body: JSON.stringify({
          nodes: workflow.graph.nodes,
          edges: workflow.graph.edges,
          viewport: { x: 200, y: 50, zoom: 1 },
          expectedVersion: 2,
        }),
      }),
      { params: Promise.resolve({ id: WORKFLOW_ID }) },
    );

    expect(res.status).toBe(200);
    const body = WorkflowSaveResponseSchema.parse(await res.json());
    expect(body.viewport).toEqual({ x: 200, y: 50, zoom: 1 });
    expect(prisma.workflow.updateMany).toHaveBeenCalled();
  });
});
