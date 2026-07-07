import { auth } from "@trigger.dev/sdk/v3";

export async function createTriggerRunPublicToken(triggerRunId: string): Promise<string | null> {
  if (!process.env.TRIGGER_SECRET_KEY) return null;

  try {
    return await auth.createPublicToken({
      scopes: {
        read: {
          runs: [triggerRunId],
        },
      },
      expirationTime: "1h",
    });
  } catch {
    return null;
  }
}
