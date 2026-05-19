import "server-only";

import { readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";

import {
  ensureOrionDataDirectory,
  getUserSettingsFilePath,
} from "@/lib/local/orion-paths.server";
import { createDefaultUserSettingsDocument } from "@/lib/settings/defaults";
import { migrateUserSettingsDocument } from "@/lib/settings/migrations";
import type { UserSettingsDocument } from "@/lib/settings/schema";

export type UserSettingsFileLoadResult = {
  status: "loaded" | "missing";
  document: UserSettingsDocument;
};

/** Removes browser-only secrets before writing the user settings document to disk. */
export function stripUserSettingsSecrets(
  document: UserSettingsDocument
): UserSettingsDocument {
  return {
    ...document,
    settings: {
      ...document.settings,
      providers: {
        ...document.settings.providers,
        credentials: {},
      },
    },
  };
}

/** Loads the local user settings document and reports whether the file existed. */
export async function loadUserSettingsDocumentWithStatus(): Promise<UserSettingsFileLoadResult> {
  const filePath = getUserSettingsFilePath();

  try {
    const raw = await readFile(filePath, "utf8");
    return {
      status: "loaded",
      document: migrateUserSettingsDocument(JSON.parse(raw)),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        status: "missing",
        document: createDefaultUserSettingsDocument(),
      };
    }
    throw error;
  }
}

/** Loads the local user settings document from `~/.orion/settings.json`. */
export async function loadUserSettingsDocument(): Promise<UserSettingsDocument> {
  const result = await loadUserSettingsDocumentWithStatus();
  return result.document;
}

/** Atomically saves the local user settings document to `~/.orion/settings.json`. */
export async function saveUserSettingsDocument(
  document: UserSettingsDocument
): Promise<UserSettingsDocument> {
  const directory = await ensureOrionDataDirectory();
  const filePath = getUserSettingsFilePath();
  const sanitized = stripUserSettingsSecrets(document);
  const tempPath = path.join(
    directory,
    `.settings.${process.pid}.${Date.now()}.tmp`
  );

  try {
    await writeFile(tempPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return sanitized;
}

/** Deletes the local user settings document so Orion falls back to defaults. */
export async function clearUserSettingsFile(): Promise<void> {
  await rm(getUserSettingsFilePath(), { force: true });
}
