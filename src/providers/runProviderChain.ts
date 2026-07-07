import { MediaInputError } from "@/lib/ffmpeg/common";
import type { ProviderChainConfig, ProviderContext, ProviderResult } from "./types";
import type { RunProviderChainHooks } from "./contextTypes";

export type { ProviderAttemptRecord, RunProviderChainHooks } from "./contextTypes";

function isNonRetryableError(error: unknown): boolean {
  if (error instanceof MediaInputError) return true;
  if (error && typeof error === "object" && "retryable" in error && error.retryable === false) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  providerId: string,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Provider ${providerId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runProviderChain<TInput, TOutput>(
  config: ProviderChainConfig<TInput, TOutput>,
  input: TInput,
  ctx: ProviderContext,
  hooks?: RunProviderChainHooks,
): Promise<ProviderResult<TOutput>> {
  const retries = Math.max(1, config.retryPerProvider ?? 1);
  const timeoutMs = config.timeoutMs ?? 120_000;
  const errors: string[] = [];

  for (const provider of config.providers) {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      const startedAt = Date.now();
      try {
        const result = await withTimeout(provider.execute(input, ctx), timeoutMs, provider.id);
        await hooks?.onAttempt?.({
          provider: provider.id,
          status: "SUCCESS",
          durationMs: Date.now() - startedAt,
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isTimeout = /timed out/i.test(message);
        errors.push(`${provider.id} attempt ${attempt}: ${message}`);

        await hooks?.onAttempt?.({
          provider: provider.id,
          status: isTimeout ? "TIMEOUT" : "FAILED",
          durationMs: Date.now() - startedAt,
          error: message,
          errorCode: isTimeout ? "PROVIDER_TIMEOUT" : "PROVIDER_FAILED",
        });

        // Bad inputs (expired temp URLs, empty files, etc.) will never succeed on retry.
        if (isNonRetryableError(error)) {
          throw error instanceof Error ? error : new Error(message);
        }

        if (attempt < retries) {
          const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
          await sleep(backoffMs);
        }
      }
    }
  }

  throw new Error(errors.join("; ") || "All providers failed");
}
