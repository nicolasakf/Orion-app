import { z } from "zod";

import { createDefaultUserSettingsDocument } from "@/lib/settings/defaults";
import type { UserSettingsDocument } from "@/lib/settings/schema";
import { UserSettingsDocumentSchema } from "@/lib/settings/schema";

const SETTINGS_API_PATH = "/api/settings";
const PROVIDER_CREDENTIALS_STORAGE_KEY = "orion_provider_credentials";

type ProviderCredentials = UserSettingsDocument["settings"]["providers"]["credentials"];
type ProviderCredentialWriteMode = "merge" | "replace";
export type UserSettingsLoadResult =
  | {
      status: "loaded" | "missing";
      document: UserSettingsDocument;
    }
  | {
      status: "failed";
      message: string;
    };

const SettingsApiResponseSchema = z.object({
  status: z.enum(["loaded", "missing"]).default("loaded"),
  document: UserSettingsDocumentSchema,
});

const SettingsApiErrorResponseSchema = z.object({
  message: z.string().optional(),
  issues: z
    .array(
      z.object({
        path: z.array(z.union([z.string(), z.number()])).optional(),
        message: z.string().optional(),
      })
    )
    .optional(),
});

/** Returns true when browser storage APIs are available for secret persistence. */
function supportsBrowserCredentialStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Reads provider credentials from browser-only storage. */
function getStoredProviderCredentials(): ProviderCredentials {
  if (!supportsBrowserCredentialStorage()) return {};

  try {
    const raw = localStorage.getItem(PROVIDER_CREDENTIALS_STORAGE_KEY);
    if (!raw) return {};

    const parsedCredentials = JSON.parse(raw) as unknown;
    const candidate = structuredClone(createDefaultUserSettingsDocument());
    candidate.settings.providers.credentials = parsedCredentials as ProviderCredentials;
    const parsedDocument = UserSettingsDocumentSchema.safeParse(candidate);

    return parsedDocument.success
      ? parsedDocument.data.settings.providers.credentials
      : {};
  } catch (error) {
    console.warn("Failed to load provider credentials from browser storage:", error);
    return {};
  }
}

/** Saves provider credentials to browser-only storage. */
function setStoredProviderCredentials(
  credentials: ProviderCredentials,
  mode: ProviderCredentialWriteMode
): void {
  if (!supportsBrowserCredentialStorage()) return;

  try {
    const nextCredentials =
      mode === "merge"
        ? { ...getStoredProviderCredentials(), ...credentials }
        : credentials;
    localStorage.setItem(
      PROVIDER_CREDENTIALS_STORAGE_KEY,
      JSON.stringify(nextCredentials)
    );
  } catch (error) {
    console.warn("Failed to save provider credentials to browser storage:", error);
  }
}

/** Clears provider credentials from browser-only storage. */
function clearStoredProviderCredentials(): void {
  if (!supportsBrowserCredentialStorage()) return;

  try {
    localStorage.removeItem(PROVIDER_CREDENTIALS_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear provider credentials from browser storage:", error);
  }
}

/** Returns a copy of the settings document without provider credentials. */
function stripProviderCredentials(
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

/** Merges browser-only provider credentials into a non-secret settings document. */
function mergeProviderCredentials(
  document: UserSettingsDocument
): UserSettingsDocument {
  return {
    ...document,
    settings: {
      ...document.settings,
      providers: {
        ...document.settings.providers,
        credentials: getStoredProviderCredentials(),
      },
    },
  };
}

/** Extracts the best available error message from a failed settings API response. */
async function getSettingsApiErrorMessage(response: Response): Promise<string> {
  try {
    const raw = await response.json();
    const parsed = SettingsApiErrorResponseSchema.safeParse(raw);
    if (parsed.success && parsed.data.message) {
      const issueSummary = parsed.data.issues
        ?.slice(0, 3)
        .map((issue) => {
          const path = issue.path?.join(".");
          return path
            ? `${path}: ${issue.message ?? "Invalid value"}`
            : issue.message ?? "Invalid value";
        })
        .join("; ");
      return issueSummary
        ? `${parsed.data.message} ${issueSummary}`
        : parsed.data.message;
    }
  } catch {
    // Fall back to the HTTP status below.
  }

  return `Settings API returned ${response.status}`;
}

/** Loads user settings from Orion's local settings API with explicit load status. */
export async function loadUserSettingsDocumentFromApi(): Promise<UserSettingsLoadResult> {
  try {
    const response = await fetch(SETTINGS_API_PATH, { method: "GET" });
    if (!response.ok) {
      throw new Error(await getSettingsApiErrorMessage(response));
    }

    const raw = await response.json();
    const parsed = SettingsApiResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Settings API returned an invalid document.");
    }

    return {
      status: parsed.data.status,
      document: mergeProviderCredentials(parsed.data.document),
    };
  } catch (error) {
    console.warn("Failed to load user settings from local API:", error);
    return {
      status: "failed",
      message:
        error instanceof Error
          ? error.message
          : "Failed to load user settings.",
    };
  }
}

/** Loads user settings from Orion's local settings API and merges browser-only secrets. */
export async function getUserSettingsDocument(): Promise<UserSettingsDocument | null> {
  const result = await loadUserSettingsDocumentFromApi();
  return result.status === "failed" ? null : result.document;
}

/** Persists non-secret user settings to disk and browser-only provider credentials locally. */
export async function setUserSettingsDocument(
  document: UserSettingsDocument,
  options: { providerCredentialWriteMode?: ProviderCredentialWriteMode } = {}
): Promise<void> {
  setStoredProviderCredentials(
    document.settings.providers.credentials,
    options.providerCredentialWriteMode ?? "merge"
  );

  const response = await fetch(SETTINGS_API_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stripProviderCredentials(document)),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to save user settings: ${await getSettingsApiErrorMessage(response)}`
    );
  }
}

/** Clears persisted user settings and browser-only provider credentials. */
export async function clearUserSettingsDocument(): Promise<void> {
  clearStoredProviderCredentials();

  const response = await fetch(SETTINGS_API_PATH, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to clear user settings: ${response.status}`);
  }
}
