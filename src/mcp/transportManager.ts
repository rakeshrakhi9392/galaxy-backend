import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestAuth } from "@/lib/auth/types";
import { createGalaxyMcpServer } from "@/mcp/server";

type McpSession = {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  auth: RequestAuth;
  createdAt: number;
};

type GlobalMcpStore = {
  sessions: Map<string, McpSession>;
};

const SESSION_TTL_MS = 1000 * 60 * 60;

function getStore(): GlobalMcpStore {
  const globalKey = "__galaxy_mcp_sessions__" as const;
  const root = globalThis as typeof globalThis & { [globalKey]?: GlobalMcpStore };
  if (!root[globalKey]) {
    root[globalKey] = { sessions: new Map() };
  }
  return root[globalKey]!;
}

function pruneExpiredSessions(store: GlobalMcpStore) {
  const now = Date.now();
  for (const [sessionId, session] of store.sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      void session.transport.close().catch(() => undefined);
      store.sessions.delete(sessionId);
    }
  }
}

async function createSession(auth: RequestAuth): Promise<McpSession> {
  const server = createGalaxyMcpServer(auth);
  const sessionRef: { current?: McpSession } = {};

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      const session = sessionRef.current;
      if (session) {
        getStore().sessions.set(id, session);
      }
    },
    onsessionclosed: (id) => {
      getStore().sessions.delete(id);
    },
  });

  const session: McpSession = {
    transport,
    server,
    auth,
    createdAt: Date.now(),
  };
  sessionRef.current = session;

  transport.onclose = () => {
    for (const [id, stored] of getStore().sessions.entries()) {
      if (stored.transport === transport) {
        getStore().sessions.delete(id);
      }
    }
  };

  await server.connect(transport);
  return session;
}

function getSession(sessionId: string | null): McpSession | undefined {
  if (!sessionId) return undefined;
  return getStore().sessions.get(sessionId);
}

function assertSameUser(session: McpSession, auth: RequestAuth) {
  if (session.auth.userId !== auth.userId) {
    throw new Error("Session belongs to a different user.");
  }
}

export async function handleMcpRequest(
  req: Request,
  auth: RequestAuth,
  parsedBody?: unknown,
): Promise<Response> {
  const store = getStore();
  pruneExpiredSessions(store);

  const sessionId = req.headers.get("mcp-session-id");
  let session = getSession(sessionId);

  if (!session && parsedBody !== undefined && isInitializeRequest(parsedBody)) {
    session = await createSession(auth);
    return session.transport.handleRequest(req, { parsedBody, authInfo: { token: auth.userId } });
  }

  if (!session) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: null,
      },
      { status: 400 },
    );
  }

  assertSameUser(session, auth);
  return session.transport.handleRequest(req, {
    ...(parsedBody !== undefined ? { parsedBody } : {}),
    authInfo: { token: auth.userId },
  });
}

export async function closeAllMcpSessions() {
  const store = getStore();
  for (const session of store.sessions.values()) {
    await session.transport.close().catch(() => undefined);
  }
  store.sessions.clear();
}
