import { z } from "zod";

import { createDefaultUserSettingsDocument, DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { mergeSettings } from "@/lib/settings/merge";
import { migrateUserSettingsDocument } from "@/lib/settings/migrations";
import type { ProviderCredential, UserSettingsDocument } from "@/lib/settings/schema";
import { UserSettingsDocumentSchema } from "@/lib/settings/schema";

const SETTINGS_API_PATH = "/api/settings";
const CREDENTIALS_API_PATH = "/api/credentials";
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

const LegacyProviderCredentialSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("api_key"),
    apiKey: z.string().min(1),
    baseUrl: z.string().optional(),
  }),
  z.object({
    type: z.literal("chatgpt_oauth"),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.number(),
    accountId: z.string().optional(),
  }),
  z.object({
    type: z.literal("local_endpoint"),
    baseUrl: z.string().min(1),
    modelId: z.string().min(1),
    label: z.string().optional(),
    models: z
      .array(
        z.object({
          modelId: z.string().min(1),
          label: z.string().optional(),
          enabled: z.boolean().optional(),
        })
      )
      .optional(),
    apiKey: z.string().optional(),
  }),
]);

const LegacyProviderCredentialsSchema = z.record(LegacyProviderCredentialSchema);

const CredentialSummariesResponseSchema = z.object({
  credentials: z.record(z.unknown()).default({}),
});

/** Returns true when browser storage APIs are available for legacy migration. */
function supportsBrowserCredentialStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Reads legacy full provider credentials from browser storage for one-time migration. */
function getLegacyProviderCredentialsFromBrowser(): Record<string, unknown> | null {
  if (!supportsBrowserCredentialStorage()) return {};

  try {
    const raw = localStorage.getItem(PROVIDER_CREDENTIALS_STORAGE_KEY);
    if (!raw) return null;

    const parsedCredentials = LegacyProviderCredentialsSchema.safeParse(JSON.parse(raw));
    return parsedCredentials.success ? parsedCredentials.data : null;
  } catch (error) {
    console.warn("Failed to load legacy provider credentials from browser storage:", error);
    return null;
  }
}

/** Clears migrated legacy provider credentials from browser storage. */
function clearLegacyProviderCredentialsFromBrowser(): void {
  if (!supportsBrowserCredentialStorage()) return;

  try {
    localStorage.removeItem(PROVIDER_CREDENTIALS_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear legacy provider credentials from browser storage:", error);
  }
}

/** Loads safe credential summaries from the local credential API. */
async function loadProviderCredentialSummariesFromApi(): Promise<ProviderCredentials> {
  const response = await fetch(CREDENTIALS_API_PATH, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Credential API returned ${response.status}`);
  }
  const raw = await response.json();
  const parsed = CredentialSummariesResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Credential API returned invalid summaries.");

  const candidate = structuredClone(createDefaultUserSettingsDocument());
  candidate.settings.providers.credentials = parsed.data.credentials as ProviderCredentials;
  const validated = UserSettingsDocumentSchema.safeParse(candidate);
  return validated.success ? validated.data.settings.providers.credentials : {};
}

/** Imports legacy browser credentials into the server store and clears them only on success. */
async function migrateLegacyBrowserCredentialsIfPresent(): Promise<ProviderCredentials | null> {
  const legacyCredentials = getLegacyProviderCredentialsFromBrowser();
  if (!legacyCredentials || Object.keys(legacyCredentials).length === 0) return null;

  const response = await fetch(CREDENTIALS_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "migrate_legacy",
      credentials: legacyCredentials,
    }),
  });
  if (!response.ok) {
    throw new Error(`Credential migration failed with ${response.status}`);
  }

  const raw = await response.json();
  const parsed = CredentialSummariesResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Credential migration returned invalid summaries.");
  }
  clearLegacyProviderCredentialsFromBrowser();

  const candidate = structuredClone(createDefaultUserSettingsDocument());
  candidate.settings.providers.credentials = parsed.data.credentials as ProviderCredentials;
  const validated = UserSettingsDocumentSchema.safeParse(candidate);
  return validated.success ? validated.data.settings.providers.credentials : {};
}

/** Imports legacy full credentials into the server store without returning secrets. */
export async function migrateLegacyProviderCredentialsDocument(
  credentials: Record<string, unknown>
): Promise<ProviderCredentials> {
  const response = await fetch(CREDENTIALS_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "migrate_legacy",
      credentials,
    }),
  });
  if (!response.ok) {
    throw new Error(`Credential migration failed with ${response.status}`);
  }

  const raw = await response.json();
  const parsed = CredentialSummariesResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Credential migration returned invalid summaries.");
  }

  const candidate = structuredClone(createDefaultUserSettingsDocument());
  candidate.settings.providers.credentials = parsed.data.credentials as ProviderCredentials;
  const validated = UserSettingsDocumentSchema.safeParse(candidate);
  return validated.success ? validated.data.settings.providers.credentials : {};
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

/** Merges server-owned provider credential summaries into a non-secret settings document. */
function mergeProviderCredentialSummaries(
  document: UserSettingsDocument,
  credentials: ProviderCredentials
): UserSettingsDocument {
  return {
    ...document,
    settings: {
      ...document.settings,
      providers: {
        ...document.settings.providers,
        credentials,
      },
    },
  };
}

/** Saves one provider credential through the local API and returns its safe summary. */
export async function saveProviderCredentialDocument(
  provider: string,
  credential: unknown
): Promise<ProviderCredential> {
  const response = await fetch(CREDENTIALS_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "save", provider, credential }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save provider credential: ${response.status}`);
  }

  const raw = (await response.json()) as { credential?: ProviderCredential };
  if (!raw.credential) {
    throw new Error("Credential API did not return a summary.");
  }
  return raw.credential;
}

/** Removes one provider credential through the local API. */
export async function removeProviderCredentialDocument(provider: string): Promise<void> {
  const response = await fetch(CREDENTIALS_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "remove", provider }),
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to remove provider credential: ${response.status}`);
  }
}

/** Clears all provider credentials through the local API. */
async function clearProviderCredentialDocuments(): Promise<void> {
  const response = await fetch(CREDENTIALS_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "clear" }),
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to clear provider credentials: ${response.status}`);
  }
}

/** Returns a document with the latest credential summaries loaded from the server. */
async function mergeLatestProviderCredentialSummaries(
  document: UserSettingsDocument
): Promise<UserSettingsDocument> {
  const migrated = await migrateLegacyBrowserCredentialsIfPresent();
  const credentials = migrated ?? await loadProviderCredentialSummariesFromApi();
  return mergeProviderCredentialSummaries(document, credentials);
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

    const document = migrateUserSettingsDocument(parsed.data.document);
    const validated = UserSettingsDocumentSchema.safeParse(document);
    if (!validated.success) {
      throw new Error("Settings API returned an invalid document.");
    }

    return {
      status: parsed.data.status,
      document: await mergeLatestProviderCredentialSummaries(validated.data),
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

/** Loads user settings from Orion's local settings API and merges safe credential summaries. */
export async function getUserSettingsDocument(): Promise<UserSettingsDocument | null> {
  const result = await loadUserSettingsDocumentFromApi();
  return result.status === "failed" ? null : result.document;
}

/** Persists non-secret user settings to disk; provider secrets are stored by credential APIs. */
export async function setUserSettingsDocument(
  document: UserSettingsDocument,
  _options: { providerCredentialWriteMode?: ProviderCredentialWriteMode } = {}
): Promise<void> {
  const documentForApi: UserSettingsDocument = {
    version: document.version,
    settings: mergeSettings(DEFAULT_SETTINGS, document.settings),
  };

  const response = await fetch(SETTINGS_API_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stripProviderCredentials(documentForApi)),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to save user settings: ${await getSettingsApiErrorMessage(response)}`
    );
  }
}

/** Clears persisted user settings and server-owned provider credentials. */
export async function clearUserSettingsDocument(): Promise<void> {
  clearLegacyProviderCredentialsFromBrowser();
  await clearProviderCredentialDocuments();

  const response = await fetch(SETTINGS_API_PATH, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to clear user settings: ${response.status}`);
  }
}
