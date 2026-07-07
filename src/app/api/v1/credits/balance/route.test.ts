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
  },
}));

async function authedRequest() {
  const authContext = await encodeAuthContext({
    userId: MOCK_OWNER_USER_ID,
    method: "dev_bypass",
  });

  return new Request("http://localhost:4010/api/v1/credits/balance", {
    headers: { [AUTH_CONTEXT_HEADER]: authContext },
  });
}

describe("GET /api/v1/credits/balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: MOCK_OWNER_USER_ID,
      email: null,
      creditBalance: 26_170_000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("returns Galaxy-shaped balance payload", async () => {
    const res = await GET(await authedRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      availableBalance: 26_170_000,
      formatted: "26.17M",
      hasActiveSubscription: true,
      isOrganization: false,
    });
  });
});
