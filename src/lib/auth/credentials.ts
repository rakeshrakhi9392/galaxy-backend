/** Galaxy API keys use the `gal_` prefix. */
export function isApiKeyCredential(token: string): boolean {
  return token.startsWith("gal_");
}
