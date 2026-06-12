import { z } from "zod";

const NativePublishedNotebookSaveResponseSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  rootDirectory: z.string().min(1),
});

export type NativePublishedNotebookSaveResponse = z.infer<
  typeof NativePublishedNotebookSaveResponseSchema
>;

/** Reads the clearest message from a local save-picker API failure. */
async function readSaveErrorMessage(response: Response): Promise<string> {
  const fallback = "Failed to save the published notebook.";
  const json = (await response.json().catch(() => null)) as unknown;
  if (typeof json === "object" && json !== null) {
    const message = (json as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

/** Opens the local native save picker and writes a published notebook to disk. */
export async function savePublishedNotebookWithNativePicker(options: {
  filename: string;
  notebook: Record<string, unknown>;
}): Promise<NativePublishedNotebookSaveResponse | null> {
  const response = await fetch("/api/local/notebooks/save-published", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });

  if (response.status === 499) return null;
  if (!response.ok) {
    throw new Error(await readSaveErrorMessage(response));
  }

  const json = (await response.json()) as unknown;
  return NativePublishedNotebookSaveResponseSchema.parse(json);
}
