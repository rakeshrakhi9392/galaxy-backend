import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as GET_LIST } from "./route";
import { GET as GET_DETAIL } from "./[slug]/route";
import { AUTH_CONTEXT_HEADER, encodeAuthContext } from "@/lib/auth/context";
import { MOCK_OWNER_USER_ID } from "@/lib/constants";
import {
  SystemWorkflowsListResponseSchema,
  WorkflowFetchResponseSchema,
} from "@/lib/schemas";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflow: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

function makeSystemRow(
  slug: string,
  name: string,
  updatedAt: string,
  thumbnailUrl: string | null = null,
) {
  return {
    id: `wf_system_${slug.replace(/-/g, "_")}`,
    name,
    description: null,
    slug,
    thumbnailUrl,
    updatedAt: new Date(updatedAt),
  };
}

async function authedRequest(url = "http://localhost:4010/api/v1/system-workflows") {
  const authContext = await encodeAuthContext({
    userId: MOCK_OWNER_USER_ID,
    method: "dev_bypass",
  });

  return new Request(url, {
    headers: { [AUTH_CONTEXT_HEADER]: authContext },
  });
}

describe("GET /api/v1/system-workflows", () => {
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

  it("returns 401 when authentication is missing", async () => {
    vi.stubEnv("AUTH_DISABLED", "false");
    vi.stubEnv("CLERK_SECRET_KEY", "test_clerk_secret");

    const res = await GET_LIST(new Request("http://localhost:4010/api/v1/system-workflows"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(prisma.workflow.findMany).not.toHaveBeenCalled();
  });

  it("returns Galaxy-shaped system workflow items", async () => {
    vi.mocked(prisma.workflow.findMany).mockResolvedValue([
      makeSystemRow(
        "ai-racing-car",
        "AI Racing Car Generator",
        "2026-05-12T11:15:35.838Z",
        "https://cdn.example/thumb.jpg",
      ),
    ] as never);

    const res = await GET_LIST(await authedRequest());

    expect(res.status).toBe(200);
    const body = SystemWorkflowsListResponseSchema.parse(await res.json());
    expect(body).toEqual({
      items: [
        {
          id: "wf_system_ai_racing_car",
          name: "AI Racing Car Generator",
          description: null,
          slug: "ai-racing-car",
          thumbnailUrl: "https://cdn.example/thumb.jpg",
          updatedAt: "2026-05-12T11:15:35.838Z",
        },
      ],
    });

    expect(prisma.workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: "SYSTEM" },
      }),
    );
  });

  it("skips system workflows without a slug", async () => {
    vi.mocked(prisma.workflow.findMany).mockResolvedValue([
      {
        ...makeSystemRow("ai-racing-car", "AI Racing Car Generator", "2026-05-12T11:15:35.838Z"),
        slug: null,
      },
    ] as never);

    const res = await GET_LIST(await authedRequest());
    const body = SystemWorkflowsListResponseSchema.parse(await res.json());
    expect(body.items).toEqual([]);
  });
});

describe("GET /api/v1/system-workflows/:slug", () => {
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

  it("returns 404 for an unknown slug", async () => {
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue(null);

    const res = await GET_DETAIL(await authedRequest(), {
      params: Promise.resolve({ slug: "missing-template" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns a workflow document for a known system template", async () => {
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue({
      id: "wf_system_ai_racing_car",
      ownerId: "user_system_templates",
      name: "AI Racing Car Generator",
      description: null,
      type: "SYSTEM",
      slug: "ai-racing-car",
      thumbnailUrl: "https://cdn.example/thumb.jpg",
      graph: {
        nodes: [{ id: "node_request", type: "request", position: { x: 0, y: 0 } }],
        edges: [],
      },
      version: 1,
      createdAt: new Date("2026-05-12T11:15:35.838Z"),
      updatedAt: new Date("2026-05-12T11:15:35.838Z"),
    } as never);

    const res = await GET_DETAIL(await authedRequest(), {
      params: Promise.resolve({ slug: "ai-racing-car" }),
    });

    expect(res.status).toBe(200);
    const body = WorkflowFetchResponseSchema.parse(await res.json());
    expect(body.type).toBe("SYSTEM");
    expect(body.slug).toBe("ai-racing-car");
    expect(body.name).toBe("AI Racing Car Generator");
    expect(body.nodes).toHaveLength(1);
  });
});
