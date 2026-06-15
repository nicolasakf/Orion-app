import { z } from "zod";

import { NOTEBOOK_APP_VIEW_SCHEMA_VERSION } from "@/lib/notebook/app-view";

export const NOTEBOOK_PUBLISH_EVENT_NAME = "orion:notebook-publish";

export const PublishedNotebookViewSchema = z.enum(["app", "notebook"]);

export const PublishedNotebookMetadataSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().default(""),
  sourceFilename: z.string().trim().min(1).max(240),
  currentView: PublishedNotebookViewSchema.default("app"),
  allowSourceDownload: z.boolean().default(false),
});

export const PublishedNotebookBundleSchema = z.object({
  schemaVersion: z.literal(1),
  rendererSchemaVersion: z.literal(NOTEBOOK_APP_VIEW_SCHEMA_VERSION),
  metadata: PublishedNotebookMetadataSchema,
  notebook: z.record(z.string(), z.unknown()),
  staticHtmlSnapshot: z.string().min(1),
});

export const PublishNotebookRequestSchema = z.object({
  publishId: z.string().uuid().optional(),
  metadata: PublishedNotebookMetadataSchema,
  bundle: PublishedNotebookBundleSchema,
});

export const PublishNotebookResponseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  currentView: PublishedNotebookViewSchema,
  allowSourceDownload: z.boolean(),
  url: z.string().url(),
  updatedAt: z.string(),
});

export const MyPublishedNotebooksResponseSchema = z.object({
  notebooks: z.array(PublishNotebookResponseSchema.extend({
    publishedAt: z.string().optional(),
  })),
});

export type PublishedNotebookMetadata = z.infer<typeof PublishedNotebookMetadataSchema>;
export type PublishedNotebookBundle = z.infer<typeof PublishedNotebookBundleSchema>;
export type PublishNotebookRequest = z.infer<typeof PublishNotebookRequestSchema>;
export type PublishNotebookResponse = z.infer<typeof PublishNotebookResponseSchema>;

export interface PublishedNotebookSourceDownload {
  filename: string;
  notebook: Record<string, unknown>;
}

/** Builds the public share URL for a published notebook on the Orion API host. */
export function buildPublishedNotebookUrl(apiBaseUrl: string, slug: string): string {
  const base = apiBaseUrl.replace(/\/+$/, "");
  return `${base}/p/${slug}`;
}

/** Ensures publish responses use the configured API host for share links. */
function normalizePublishResponse(
  apiBaseUrl: string,
  response: PublishNotebookResponse,
): PublishNotebookResponse {
  return {
    ...response,
    url: buildPublishedNotebookUrl(apiBaseUrl, response.slug),
  };
}

interface PublishNotebookOptions {
  apiBaseUrl: string;
  accessToken: string;
  request: PublishNotebookRequest;
}

/** Builds a useful browser-network error for unreachable Orion API endpoints. */
function createOrionApiFetchError(apiBaseUrl: string, error: unknown): Error {
  const localHttpsHint =
    /^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(apiBaseUrl)
      ? " Local Orion API servers usually run over HTTP, so use http://localhost:<port> unless you configured trusted local TLS."
      : "";
  const reason = error instanceof Error ? ` ${error.message}` : "";
  return new Error(
    `Could not reach Orion API at ${apiBaseUrl}.${localHttpsHint}${reason}`,
  );
}

/** Extracts the clearest error message from an Orion API response body. */
async function readOrionApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
  const bodyText = await response.text().catch(() => "");

  if (bodyText) {
    try {
      const json = JSON.parse(bodyText) as unknown;
      if (typeof json === "object" && json !== null) {
        const message = (json as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) return message;

        const error = (json as { error?: unknown }).error;
        if (typeof error === "string" && error.trim()) {
          return `${error} (${status}).`;
        }
      }
    } catch {
      if (/^\s*<!doctype html|^\s*<html[\s>]/i.test(bodyText)) {
        return `The source download endpoint returned an HTML page instead of notebook JSON (${status}). Check that the publish handoff is using the Orion API base URL, not the local Orion app URL.`;
      }
      return `${bodyText.slice(0, 240)} (${status}).`;
    }
  }

  return `${fallback} (${status}).`;
}

/** Reads a filename from a Content-Disposition attachment header. */
function getFilenameFromContentDisposition(value: string | null): string {
  const fallback = "published-notebook.ipynb";
  if (!value) return fallback;

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const quotedMatch = value.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];

  const bareMatch = value.match(/filename=([^;]+)/i);
  return bareMatch?.[1]?.trim() || fallback;
}

/** Publishes a notebook bundle to the hosted Orion API. */
export async function publishNotebookToCloud({
  apiBaseUrl,
  accessToken,
  request,
}: PublishNotebookOptions): Promise<PublishNotebookResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/notebooks/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(PublishNotebookRequestSchema.parse(request)),
    });
  } catch (error) {
    throw createOrionApiFetchError(apiBaseUrl, error);
  }

  const json = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    const message =
      typeof json === "object" &&
      json !== null &&
      "message" in json &&
      typeof (json as { message?: unknown }).message === "string"
        ? (json as { message: string }).message
        : "Failed to publish notebook.";
    throw new Error(message);
  }

  return normalizePublishResponse(
    apiBaseUrl,
    PublishNotebookResponseSchema.parse(json),
  );
}

const UnpublishNotebookResponseSchema = z.object({
  success: z.literal(true),
});

/** Soft-unpublishes a notebook from Orion Cloud. */
export async function unpublishNotebookFromCloud(options: {
  apiBaseUrl: string;
  accessToken: string;
  publishId: string;
}): Promise<void> {
  let response: Response;
  try {
    response = await fetch(
      `${options.apiBaseUrl}/api/notebooks/${encodeURIComponent(options.publishId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
        },
      },
    );
  } catch (error) {
    throw createOrionApiFetchError(options.apiBaseUrl, error);
  }

  const json = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    const message =
      typeof json === "object" &&
      json !== null &&
      "message" in json &&
      typeof (json as { message?: unknown }).message === "string"
        ? (json as { message: string }).message
        : "Failed to unpublish notebook.";
    throw new Error(message);
  }

  UnpublishNotebookResponseSchema.parse(json);
}

/** Lists existing cloud publishes for the signed-in user. */
export async function listPublishedNotebooks(options: {
  apiBaseUrl: string;
  accessToken: string;
}): Promise<PublishNotebookResponse[]> {
  let response: Response;
  try {
    response = await fetch(`${options.apiBaseUrl}/api/notebooks/mine`, {
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
      },
    });
  } catch (error) {
    throw createOrionApiFetchError(options.apiBaseUrl, error);
  }
  const json = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) return [];
  return MyPublishedNotebooksResponseSchema.parse(json).notebooks.map((notebook) =>
    normalizePublishResponse(options.apiBaseUrl, notebook),
  );
}

/** Downloads the source notebook for a published notebook using the local Orion Cloud session. */
export async function downloadPublishedNotebookSource(options: {
  apiBaseUrl: string;
  accessToken: string;
  slug: string;
}): Promise<PublishedNotebookSourceDownload> {
  let response: Response;
  try {
    response = await fetch(
      `${options.apiBaseUrl}/p/${encodeURIComponent(options.slug)}/download/ipynb`,
      {
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
        },
      },
    );
  } catch (error) {
    throw createOrionApiFetchError(options.apiBaseUrl, error);
  }

  if (!response.ok) {
    const message = await readOrionApiErrorMessage(
      response,
      "Failed to download the source notebook.",
    );
    throw new Error(message);
  }

  const notebook = JSON.parse(await response.text()) as unknown;
  const parsed = z.record(z.string(), z.unknown()).parse(notebook);
  return {
    filename: getFilenameFromContentDisposition(
      response.headers.get("content-disposition"),
    ),
    notebook: parsed,
  };
}
