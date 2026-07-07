import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateApiKey, DEV_UNKEY_KEY_ID } from "./apiKey";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/unkey", () => ({
  isUnkeyConfigured: vi.fn(() => false),
  verifyUnkeyApiKey: vi.fn(),
  enforceStandaloneRateLimit: vi.fn(),
}));

describe("authenticateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_API_KEY", "gal_dev_test_key_12345");
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "apikey_dev_local",
      userId: "user_mock_clerk_123",
      name: "Development API key",
      keyPrefix: "gal_dev_test",
      unkeyKeyId: DEV_UNKEY_KEY_ID,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
    vi.mocked(prisma.apiKey.update).mockResolvedValue({
      id: "apikey_dev_local",
      userId: "user_mock_clerk_123",
      name: "Development API key",
      keyPrefix: "gal_dev_test",
      unkeyKeyId: DEV_UNKEY_KEY_ID,
      lastUsedAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
    });
  });

  it("authenticates a valid development API key", async () => {
    const auth = await authenticateApiKey("gal_dev_test_key_12345");

    expect(auth).toEqual({
      userId: "user_mock_clerk_123",
      method: "api_key",
      apiKeyId: "apikey_dev_local",
    });
    expect(prisma.apiKey.update).toHaveBeenCalled();
  });

  it("rejects invalid development API keys", async () => {
    await expect(authenticateApiKey("gal_dev_invalid")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });
});
