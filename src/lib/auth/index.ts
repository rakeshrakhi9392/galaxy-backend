export type { AuthMethod, RequestAuth } from "./types";
export {
  AUTH_CONTEXT_HEADER,
  LEGACY_USER_ID_HEADER,
  encodeAuthContext,
  stripIdentityHeaders,
} from "./context";
export { authenticateApiKey, DEV_UNKEY_KEY_ID } from "./apiKey";
export { authenticateCredential, getBearerToken, isApiKeyCredential } from "./authenticate";
export {
  authMethodToInitiator,
  ensureUser,
  getAuth,
  syncClerkUser,
} from "./server";
