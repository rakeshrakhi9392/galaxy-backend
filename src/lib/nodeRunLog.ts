export type NodeRunLogLevel = "info" | "warn" | "error";

export type NodeRunLogLine = {
  ts: string;
  level: NodeRunLogLevel;
  message: string;
};

const MAX_LOG_LINES = 200;
const MAX_LOG_PREVIEW_CHARS = 16_384;

export type NodeRunLogBuffer = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  toPreview: () => string;
  toLines: () => readonly NodeRunLogLine[];
};

export function createNodeRunLogBuffer(): NodeRunLogBuffer {
  const lines: NodeRunLogLine[] = [];

  const push = (level: NodeRunLogLevel, message: string) => {
    if (lines.length >= MAX_LOG_LINES) return;
    lines.push({
      ts: new Date().toISOString(),
      level,
      message: message.slice(0, 2_000),
    });
  };

  return {
    info: (message) => push("info", message),
    warn: (message) => push("warn", message),
    error: (message) => push("error", message),
    toPreview: () => formatLogPreview(lines),
    toLines: () => lines,
  };
}

export function formatLogPreview(lines: readonly NodeRunLogLine[]): string {
  if (lines.length === 0) return "";
  const text = lines
    .map((line) => `[${line.ts}] ${line.level.toUpperCase()} ${line.message}`)
    .join("\n");
  if (text.length <= MAX_LOG_PREVIEW_CHARS) return text;
  return `…(truncated)\n${text.slice(-MAX_LOG_PREVIEW_CHARS)}`;
}

export function errorWithLogPreview(error: unknown, logPreview: string): Error {
  const wrapped =
    error instanceof Error ? error : new Error(error instanceof Object ? String(error) : "Node execution failed");
  if (logPreview) {
    (wrapped as Error & { logPreview?: string }).logPreview = logPreview;
  }
  return wrapped;
}

export function readLogPreviewFromError(error: unknown): string | null {
  if (error && typeof error === "object" && "logPreview" in error) {
    const value = (error as { logPreview?: unknown }).logPreview;
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  return null;
}
