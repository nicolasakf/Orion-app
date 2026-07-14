/**
 * Produces a canonical Jupyter API base URL for equality checks. Query and
 * hash fragments are deliberately ignored because a renderer may hold the
 * token separately from its server settings.
 */
export function normalizeJupyterBaseUrl(baseUrl: string): string | null {
  const trimmedBaseUrl = baseUrl.trim();
  if (!trimmedBaseUrl) return null;

  try {
    const parsed = new URL(trimmedBaseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }

    // KernelService normalizes localhost to IPv4 so the Electron and renderer
    // forms compare consistently on platforms where localhost resolves to ::1.
    if (parsed.hostname.toLowerCase() === "localhost") {
      parsed.hostname = "127.0.0.1";
    }
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/`;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Returns whether two renderer/server URL forms identify the same Jupyter API root. */
export function jupyterBaseUrlsMatch(
  rendererBaseUrl: string,
  managedBaseUrl: string
): boolean {
  const normalizedRendererUrl = normalizeJupyterBaseUrl(rendererBaseUrl);
  const normalizedManagedUrl = normalizeJupyterBaseUrl(managedBaseUrl);

  return (
    normalizedRendererUrl !== null &&
    normalizedManagedUrl !== null &&
    normalizedRendererUrl === normalizedManagedUrl
  );
}
