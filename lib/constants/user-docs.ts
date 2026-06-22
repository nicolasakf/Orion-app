/** Published user documentation at docs.orion-agent.ai */
export const ORION_USER_DOCS_URL = "https://docs.orion-agent.ai";

/** Builds a published docs.orion-agent.ai page URL (static hosting serves `.html` files). */
export function orionUserDocsPage(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized.endsWith(".html") || normalized.endsWith("/")) {
    return `${ORION_USER_DOCS_URL}${normalized}`;
  }
  return `${ORION_USER_DOCS_URL}${normalized}.html`;
}

export const ORION_USER_DOCS_CONNECT_JUPYTER_URL = orionUserDocsPage(
  "/troubleshooting/connect-external-jupyter",
);

export const ORION_USER_DOCS_PDF_EXPORT_URL = orionUserDocsPage(
  "/troubleshooting/pdf-export-blocked",
);

export const ORION_USER_DOCS_PROVIDERS_URL = orionUserDocsPage(
  "/configuration/api-keys-and-providers",
);

export const ORION_USER_DOCS_PUBLISH_NOTEBOOKS_URL = orionUserDocsPage(
  "/notebooks/publish-notebooks",
);
