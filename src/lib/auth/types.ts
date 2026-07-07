export type AuthMethod = "clerk" | "api_key" | "dev_bypass";

/** Identity resolved by middleware — routes read this, they do not re-authenticate. */
export type RequestAuth = {
  userId: string;
  method: AuthMethod;
  sessionId?: string;
  apiKeyId?: string;
};
