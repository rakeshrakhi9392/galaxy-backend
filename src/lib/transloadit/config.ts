export type TransloaditStoreRobot = "/cloudflare/store" | "/s3/store";

export type TransloaditConfig = {
  authKey: string;
  authSecret: string;
  templateId: string | null;
  /** Transloadit template credential name for durable export (R2/S3). */
  storeCredentials: string | null;
  storeRobot: TransloaditStoreRobot;
};

const DEFAULT_STORE_ROBOT: TransloaditStoreRobot = "/cloudflare/store";

function readStoreRobot(value: string | undefined): TransloaditStoreRobot {
  const normalized = value?.trim();
  if (normalized === "/s3/store") return "/s3/store";
  return DEFAULT_STORE_ROBOT;
}

/**
 * Server-only Transloadit credentials. Never expose authSecret to the client.
 */
export function getTransloaditConfig(): TransloaditConfig | null {
  const authKey = process.env.TRANSLOADIT_AUTH_KEY?.trim();
  const authSecret = process.env.TRANSLOADIT_AUTH_SECRET?.trim();

  if (!authKey || !authSecret) {
    return null;
  }

  const templateId = process.env.TRANSLOADIT_TEMPLATE_ID?.trim() || null;
  const storeCredentials = process.env.TRANSLOADIT_STORE_CREDENTIALS?.trim() || null;

  return {
    authKey,
    authSecret,
    templateId,
    storeCredentials,
    storeRobot: readStoreRobot(process.env.TRANSLOADIT_STORE_ROBOT),
  };
}

export function isTransloaditConfigured(): boolean {
  return getTransloaditConfig() != null;
}

/**
 * When true, reject scratch URLs and require durable export (template or store creds).
 * Default false — trial/assignment accepts temporary Transloadit URLs.
 */
export function requiresDurableTransloaditUrls(): boolean {
  return process.env.TRANSLOADIT_REQUIRE_DURABLE_URLS?.trim() === "true";
}
