/** Labels used for CLI-managed Jupyter servers saved in connection history. */
const ORION_MANAGED_LABELS = new Set([
  "Orion-managed Jupyter",
  "Orion-managed server",
]);

/**
 * Builds a connectable Jupyter server URL, embedding the token when needed.
 */
export function buildKernelConnectionUrl(
  baseUrl: string,
  token?: string,
): string {
  const trimmedBaseUrl = baseUrl.trim();
  if (!token?.trim()) {
    return trimmedBaseUrl;
  }

  if (/[?&]token=/.test(trimmedBaseUrl)) {
    return trimmedBaseUrl;
  }

  const separator = trimmedBaseUrl.includes("?") ? "&" : "?";
  return `${trimmedBaseUrl}${separator}token=${encodeURIComponent(token.trim())}`;
}

/** Returns true when a saved connection label marks an Orion-managed server. */
export function isOrionManagedConnectionLabel(
  displayName?: string,
): boolean {
  return displayName ? ORION_MANAGED_LABELS.has(displayName) : false;
}

/** Search terms for saved-connection pickers (cmdk `keywords`). */
export function getKernelConnectionSearchTerms(
  baseUrl: string,
  token?: string,
  displayName?: string,
): string[] {
  const fullUrl = buildKernelConnectionUrl(baseUrl, token);
  return [fullUrl, baseUrl, displayName].filter(
    (value): value is string => Boolean(value?.trim()),
  );
}
