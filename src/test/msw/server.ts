import { setupServer } from "msw/node";
import { openRouterHandlers } from "./handlers";

export const mswServer = setupServer(...openRouterHandlers);
