import { http, HttpResponse } from "msw";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** MSW handlers for external provider boundaries used in integration tests. */
export const openRouterHandlers = [
  http.post(OPENROUTER_CHAT_URL, () =>
    HttpResponse.json({
      choices: [{ message: { content: "mocked openrouter response" } }],
    }),
  ),
];

export { OPENROUTER_CHAT_URL };
