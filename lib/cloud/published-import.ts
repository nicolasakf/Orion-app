import { z } from "zod";

export const PENDING_PUBLISHED_NOTEBOOK_IMPORT_KEY =
  "orion:pendingPublishedNotebookImport";

export const PublishedNotebookImportRequestSchema = z.object({
  slug: z.string().trim().min(1),
  apiBaseUrl: z.string().url(),
  createdAt: z.number().int().positive(),
});

export type PublishedNotebookImportRequest = z.infer<
  typeof PublishedNotebookImportRequestSchema
>;

/** Reads the pending published-notebook import request saved by /cloud/open. */
export function readPendingPublishedNotebookImport():
  | PublishedNotebookImportRequest
  | null {
  const raw = window.localStorage.getItem(PENDING_PUBLISHED_NOTEBOOK_IMPORT_KEY);
  if (!raw) return null;

  try {
    const parsed = PublishedNotebookImportRequestSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Saves a published-notebook import request for the main local Orion app. */
export function savePendingPublishedNotebookImport(
  request: Omit<PublishedNotebookImportRequest, "createdAt">,
): void {
  window.localStorage.setItem(
    PENDING_PUBLISHED_NOTEBOOK_IMPORT_KEY,
    JSON.stringify({
      ...request,
      createdAt: Date.now(),
    }),
  );
}

/** Clears the pending published-notebook import request. */
export function clearPendingPublishedNotebookImport(): void {
  window.localStorage.removeItem(PENDING_PUBLISHED_NOTEBOOK_IMPORT_KEY);
}
