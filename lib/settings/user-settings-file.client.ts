import { z } from "zod";

import { UserSettingsDocumentSchema } from "@/lib/settings/schema";

const USER_SETTINGS_FILE_API_PATH = "/api/settings/file";

const UserSettingsRawFileResponseSchema = z.object({
  path: z.string(),
  content: z.string(),
  exists: z.boolean(),
});

const UserSettingsFileSaveResponseSchema = z.object({
  document: UserSettingsDocumentSchema,
});

const UserSettingsFileErrorResponseSchema = z.object({
  message: z.string().optional(),
});

/** Loads the raw user settings JSON served by Orion's local settings file API. */
export async function loadUserSettingsRawFileFromApi(): Promise<{
  path: string;
  content: string;
  exists: boolean;
}> {
  const response = await fetch(USER_SETTINGS_FILE_API_PATH, {
    method: "GET",
    cache: "no-store",
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = UserSettingsFileErrorResponseSchema.safeParse(payload);
    throw new Error(
      parsedError.success
        ? parsedError.data.message ?? "Failed to load user settings file."
        : "Failed to load user settings file.",
    );
  }

  const parsed = UserSettingsRawFileResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("User settings file response was invalid.");
  }

  return parsed.data;
}

/** Saves raw user settings JSON through Orion's local settings file API. */
export async function saveUserSettingsRawFileToApi(content: string): Promise<void> {
  const response = await fetch(USER_SETTINGS_FILE_API_PATH, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = UserSettingsFileErrorResponseSchema.safeParse(payload);
    throw new Error(
      parsedError.success
        ? parsedError.data.message ?? "Failed to save user settings file."
        : "Failed to save user settings file.",
    );
  }

  const parsed = UserSettingsFileSaveResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("User settings file save response was invalid.");
  }
}
