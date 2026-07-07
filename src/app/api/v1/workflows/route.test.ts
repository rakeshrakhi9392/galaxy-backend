import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { AUTH_CONTEXT_HEADER, encodeAuthContext } from "@/lib/auth/context";
import { MOCK_OWNER_USER_ID } from "@/lib/constants";
import { WorkflowsListResponseSchema } from "@/lib/schemas";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflow: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const OTHER_USER_ID = "user_other_456";

function makeListItem(
  id: string,
  name: string,
  updatedAt: string,
  thumbnailUrl: string | null = null,
) {
  return {
    id,
    name,
    thumbnailUrl,
    updatedAt: new Date(updatedAt),
  };
}

async function authedRequest(url = "http://localhost:4010/api/v1/workflows") {
  const authContext = await encodeAuthContext({
    userId: MOCK_OWNER_USER_ID,
    method: "dev_bypass",
  });

  return new Request(url, {
    headers: { [AUTH_CONTEXT_HEADER]: authContext },
  });
}

describe("GET /api/v1/workflows", () => {
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

    const res = await GET(new Request("http://localhost:4010/api/v1/workflows"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns Galaxy-shaped paginated items for the authenticated owner", async () => {
    const rows = [
      makeListItem(
        "wf_newer",
        "Newer",
        "2026-07-03T12:00:00.000Z",
        "https://cdn.example/newer.jpg",
      ),
      makeListItem("wf_older", "Older", "2026-07-02T12:00:00.000Z"),
    ];

    vi.mocked(prisma.$transaction).mockResolvedValue([2, rows]);

    const res = await GET(await authedRequest());

    expect(res.status).toBe(200);
    const body = WorkflowsListResponseSchema.parse(await res.json());
    expect(body).toEqual({
      items: [
        {
          id: "wf_newer",
          name: "Newer",
          thumbnailUrl: "https://cdn.example/newer.jpg",
          updatedAt: "2026-07-03T12:00:00.000Z",
        },
        {
          id: "wf_older",
          name: "Older",
          thumbnailUrl: null,
          updatedAt: "2026-07-02T12:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
      hasMore: false,
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("supports page and pageSize query params", async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([
      3,
      [makeListItem("wf_3", "Three", "2026-07-01T12:00:00.000Z")],
    ]);

    const res = await GET(
      await authedRequest("http://localhost:4010/api/v1/workflows?page=2&pageSize=1"),
    );

    const body = WorkflowsListResponseSchema.parse(await res.json());
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(1);
    expect(body.total).toBe(3);
    expect(body.hasMore).toBe(true);
    expect(body.items).toHaveLength(1);
  });

  it("scopes the query to the authenticated user id", async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []]);

    const authContext = await encodeAuthContext({
      userId: OTHER_USER_ID,
      method: "dev_bypass",
    });

    await GET(
      new Request("http://localhost:4010/api/v1/workflows", {
        headers: { [AUTH_CONTEXT_HEADER]: authContext },
      }),
    );

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("returns an empty page when the user has no workflows", async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []]);

    const res = await GET(await authedRequest());

    expect(res.status).toBe(200);
    const body = WorkflowsListResponseSchema.parse(await res.json());
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.hasMore).toBe(false);
  });

  it("returns 304 when If-None-Match matches the list etag", async () => {
    const rows = [makeListItem("wf_newer", "Newer", "2026-07-03T12:00:00.000Z")];
    vi.mocked(prisma.$transaction).mockResolvedValue([1, rows]);

    const first = await GET(await authedRequest());
    expect(first.status).toBe(200);
    const etag = first.headers.get("ETag");
    expect(etag).toBeTruthy();

    const authContext = await encodeAuthContext({
      userId: MOCK_OWNER_USER_ID,
      method: "dev_bypass",
    });
    const second = await GET(
      new Request("http://localhost:4010/api/v1/workflows", {
        headers: {
          [AUTH_CONTEXT_HEADER]: authContext,
          "if-none-match": etag!,
        },
      }),
    );

    expect(second.status).toBe(304);
    expect(second.headers.get("ETag")).toBe(etag);
    expect(await second.text()).toBe("");
  });
});
