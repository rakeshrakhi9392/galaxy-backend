import { wait } from "@trigger.dev/sdk/v3";

/** Override stub webhook delay in integration tests (`WEBHOOK_STUB_DELAY_MS=0` for instant). */
export function resolveWebhookStubDelayMs(defaultDelayMs: number): number {
  const raw = process.env.WEBHOOK_STUB_DELAY_MS?.trim();
  if (!raw) return defaultDelayMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultDelayMs;
  return Math.floor(parsed);
}

function formatTimeout(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${seconds}s`;
}

async function completeWaitToken(token: { url: string }): Promise<void> {
  await fetch(token.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

/**
 * Simulates webhook-driven provider completion inside Trigger.dev child tasks.
 *
 * Trigger.dev does not allow parallel waits in one run. We therefore:
 * 1. optionally `wait.for` simulated provider latency (sequential),
 * 2. POST to the waitpoint URL (stub webhook callback),
 * 3. `wait.forToken` to acknowledge the webhook path.
 */
export async function simulateWebhookWait(args: {
  tokenKey: string;
  timeoutMs: number;
  simulatedDelayMs: number;
}): Promise<number> {
  const token = await wait.createToken({
    timeout: formatTimeout(args.timeoutMs),
    idempotencyKey: args.tokenKey,
  });

  if (args.simulatedDelayMs > 0) {
    await wait.for({ seconds: Math.max(1, Math.ceil(args.simulatedDelayMs / 1000)) });
  }

  await completeWaitToken(token);
  await wait.forToken(token);
  return args.simulatedDelayMs;
}
