import {
  OPENROUTER_LLM_MODEL,
  OpenRouterLlmInputSchema,
  OpenRouterLlmOutputSchema,
  parseStopSequences,
  type OpenRouterLlmInput,
  type OpenRouterLlmOutput,
} from "@galaxy/schemas";
import type { NodeProvider, ProviderContext, ProviderResult } from "../types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_GEMINI_FLASH_PROVIDER_ID = "openrouter-gemini-2.0-flash-exp-free";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
    finish_reason?: string;
  }>;
  error?: {
    message?: string;
    code?: number;
  };
};

function requireOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to backend/.env to run LLM nodes.",
    );
  }
  return key;
}

function resolveOpenRouterReferer(): string {
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  if (!referer) return "https://galaxy.ai";
  try {
    return new URL(referer).href;
  } catch {
    throw new Error(
      `OPENROUTER_HTTP_REFERER is not a valid URL (${referer}). Use e.g. https://galaxy.ai or remove it.`,
    );
  }
}

function assertFetchableUrl(url: string, field: string): void {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error(`${field} contains an empty URL.`);
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(`${field} contains an invalid URL: ${JSON.stringify(url)}`);
  }
}

function guessMimeType(url: string, contentType: string | null): string {
  if (contentType) {
    const mime = contentType.split(";")[0]?.trim();
    if (mime && mime !== "application/octet-stream") return mime;
  }

  const ext = url.split("?")[0]?.split(".").pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
  };
  return (ext && byExt[ext]) || "application/octet-stream";
}

function mimeToAudioFormat(mime: string): string {
  const map: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
  };
  return map[mime] ?? "wav";
}

async function fetchAudioPart(url: string): Promise<ContentPart> {
  assertFetchableUrl(url, "audio_urls");
  const response = await fetch(url.trim());
  if (!response.ok) {
    throw new Error(`Failed to fetch audio (${response.status}): ${url}`);
  }

  const mime = guessMimeType(url, response.headers.get("content-type"));
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    type: "input_audio",
    input_audio: {
      data: buffer.toString("base64"),
      format: mimeToAudioFormat(mime),
    },
  };
}

async function buildUserContent(input: OpenRouterLlmInput): Promise<ContentPart[]> {
  const parts: ContentPart[] = [];

  for (const url of input.image_urls) {
    assertFetchableUrl(url, "image_urls");
    parts.push({ type: "image_url", image_url: { url: url.trim() } });
  }
  for (const url of input.video_urls) {
    assertFetchableUrl(url, "video_urls");
    parts.push({ type: "video_url", video_url: { url: url.trim() } });
  }
  for (const url of input.audio_urls) {
    parts.push(await fetchAudioPart(url));
  }

  parts.push({ type: "text", text: input.prompt.trim() });
  return parts;
}

function extractText(payload: OpenRouterChatResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content.trim() : "";

  if (text) return text;

  const finishReason = payload.choices?.[0]?.finish_reason;
  if (finishReason && finishReason !== "stop") {
    throw new Error(`OpenRouter returned no text (finish_reason=${finishReason}).`);
  }
  throw new Error("OpenRouter returned an empty response.");
}

function resolveOpenRouterModel(model: string | undefined): string {
  const trimmed = model?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : OPENROUTER_LLM_MODEL;
}

function buildRequestBody(input: OpenRouterLlmInput, model: string): Record<string, unknown> {
  const stopSequences = parseStopSequences(input.stop);
  const messages: Array<{ role: string; content: ContentPart[] | string }> = [];

  if (input.system_prompt.trim()) {
    messages.push({ role: "system", content: input.system_prompt.trim() });
  }

  messages.push({ role: "user", content: [] });

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: input.temperature,
    max_tokens: input.max_tokens,
    top_p: input.top_p,
    top_k: input.top_k,
    frequency_penalty: input.frequency_penalty,
    presence_penalty: input.presence_penalty,
    repetition_penalty: input.repetition_penalty,
    min_p: input.min_p,
    top_a: input.top_a,
  };

  if (input.seed > 0) {
    body.seed = input.seed;
  }
  if (stopSequences.length > 0) {
    body.stop = stopSequences;
  }
  if (input.response_format) {
    body.response_format = { type: "json_object" };
  }
  if (input.reasoning) {
    body.reasoning = { enabled: true };
  }

  return body;
}

export async function executeOpenRouterGeminiFlash(
  input: OpenRouterLlmInput,
  ctx: ProviderContext,
): Promise<ProviderResult<OpenRouterLlmOutput>> {
  if (!input.prompt.trim()) {
    throw new Error("Prompt is required.");
  }

  const apiKey = requireOpenRouterApiKey();
  const started = Date.now();
  const model = resolveOpenRouterModel(ctx.model);
  const body = buildRequestBody(input, model);
  const userContent = await buildUserContent(input);

  const messages = body.messages as Array<{ role: string; content: ContentPart[] | string }>;
  const userMessage = messages.find((message) => message.role === "user");
  if (userMessage) {
    userMessage.content = userContent;
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": resolveOpenRouterReferer(),
      "X-OpenRouter-Title": process.env.OPENROUTER_APP_TITLE?.trim() || "Galaxy Workflow Builder",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as OpenRouterChatResponse;

  if (!response.ok) {
    const message =
      payload.error?.message ??
      `OpenRouter API request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  return {
    provider: OPENROUTER_GEMINI_FLASH_PROVIDER_ID,
    sleptMs: Date.now() - started,
    output: OpenRouterLlmOutputSchema.parse({ output: extractText(payload) }),
  };
}

export const openrouterGeminiFlashProvider: NodeProvider<
  OpenRouterLlmInput,
  OpenRouterLlmOutput
> = {
  id: OPENROUTER_GEMINI_FLASH_PROVIDER_ID,
  input: OpenRouterLlmInputSchema,
  output: OpenRouterLlmOutputSchema,
  execute: executeOpenRouterGeminiFlash,
};
