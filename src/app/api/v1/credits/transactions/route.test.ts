import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { AUTH_CONTEXT_HEADER, encodeAuthContext } from "@/lib/auth/context";
import { MOCK_OWNER_USER_ID } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    creditTransaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

async function authedRequest(query = "") {
  const authContext = await encodeAuthContext({
    userId: MOCK_OWNER_USER_ID,
    method: "dev_bypass",
  });

  return new Request(`http://localhost:4010/api/v1/credits/transactions${query}`, {
    headers: { [AUTH_CONTEXT_HEADER]: authContext },
  });
}

describe("GET /api/v1/credits/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: MOCK_OWNER_USER_ID,
      email: null,
      creditBalance: 100_000_000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("returns paginated credit transactions newest first", async () => {
    vi.mocked(prisma.creditTransaction.findMany).mockResolvedValue([
      {
        id: "txn-2",
        userId: MOCK_OWNER_USER_ID,
        type: "RUN_CHARGE",
        amount: 210_000,
        balanceAfter: 99_790_000,
        referenceType: "node_run",
        referenceId: "nr-1",
        workflowRunId: "run-1",
        metadata: { nodeId: "img", nodeType: "gpt-image-2" },
        createdAt: new Date("2026-07-06T02:00:00.000Z"),
      },
      {
        id: "txn-1",
        userId: MOCK_OWNER_USER_ID,
        type: "GRANT",
        amount: 100_000_000,
        balanceAfter: 100_000_000,
        referenceType: "account",
        referenceId: MOCK_OWNER_USER_ID,
        workflowRunId: null,
        metadata: { reason: "initial_grant" },
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ] as never);

    const res = await GET(await authedRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      transactions: Array<{ id: string; type: string; amount: number }>;
      nextCursor: string | null;
    };

    expect(body.transactions).toHaveLength(2);
    expect(body.transactions[0]?.type).toBe("RUN_CHARGE");
    expect(body.transactions[1]?.type).toBe("GRANT");
    expect(body.nextCursor).toBeNull();
  });
});
