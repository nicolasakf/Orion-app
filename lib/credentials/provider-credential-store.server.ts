import { readFile, rename, rm, writeFile, chmod } from "fs/promises";
import path from "path";
import { z } from "zod";

import {
  decodeLocalModelCatalogId,
  isLocalProvider,
  normalizeLocalEndpointModels,
  resolveLocalRuntimeModelId,
} from "@/lib/agent/local-provider-models";
import type { CredentialMode, ProviderId } from "@/lib/agent/model-gateway-types";
import {
  ensureOrionDataDirectory,
  getProviderCredentialsFilePath,
} from "@/lib/local/orion-paths.server";
import {
  extractAccountId,
  refreshAccessToken,
} from "@/lib/credentials/chatgpt-oauth";

export const PROVIDER_CREDENTIALS_DOCUMENT_VERSION = 1;

const LocalEndpointModelSchema = z.object({
  modelId: z.string().min(1),
  label: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const StoredProviderCredentialSchema = z.discriminatedUnion("type", [
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
    models: z.array(LocalEndpointModelSchema).optional(),
    apiKey: z.string().optional(),
  }),
]);

export const ProviderCredentialDocumentSchema = z.object({
  version: z.literal(PROVIDER_CREDENTIALS_DOCUMENT_VERSION),
  credentials: z.record(StoredProviderCredentialSchema).default({}),
});

export type StoredProviderCredential = z.infer<typeof StoredProviderCredentialSchema>;
export type ProviderCredentialDocument = z.infer<typeof ProviderCredentialDocumentSchema>;

export type ProviderCredentialSummary =
  | {
      type: "api_key";
      configured: true;
      baseUrl?: string;
    }
  | {
      type: "chatgpt_oauth";
      configured: true;
      expiresAt: number;
      accountId?: string;
    }
  | {
      type: "local_endpoint";
      configured: true;
      baseUrl: string;
      modelId: string;
      label?: string;
      models?: Array<{ modelId: string; label?: string; enabled?: boolean }>;
      hasApiKey: boolean;
    };

export type ProviderCredentialSummaryMap = Partial<Record<ProviderId, ProviderCredentialSummary>>;

const emptyDocument: ProviderCredentialDocument = {
  version: PROVIDER_CREDENTIALS_DOCUMENT_VERSION,
  credentials: {},
};

let writeChain: Promise<unknown> = Promise.resolve();
const oauthRefreshes = new Map<ProviderId, Promise<StoredProviderCredential>>();

/** Returns a client-safe summary that never includes keys or bearer tokens. */
export function summarizeProviderCredential(
  credential: StoredProviderCredential
): ProviderCredentialSummary {
  if (credential.type === "api_key") {
    return {
      type: "api_key",
      configured: true,
      ...(credential.baseUrl && { baseUrl: credential.baseUrl }),
    };
  }

  if (credential.type === "chatgpt_oauth") {
    return {
      type: "chatgpt_oauth",
      configured: true,
      expiresAt: credential.expiresAt,
      ...(credential.accountId && { accountId: credential.accountId }),
    };
  }

  return {
    type: "local_endpoint",
    configured: true,
    baseUrl: credential.baseUrl,
    modelId: credential.modelId,
    ...(credential.label && { label: credential.label }),
    ...(credential.models && { models: credential.models }),
    hasApiKey: Boolean(credential.apiKey),
  };
}

/** Reads and validates `~/.orion/credentials.json`; malformed files fail closed. */
export async function loadProviderCredentialDocument(): Promise<ProviderCredentialDocument> {
  const filePath = getProviderCredentialsFilePath();

  try {
    const raw = await readFile(filePath, "utf8");
    return ProviderCredentialDocumentSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(emptyDocument);
    }
    throw error;
  }
}

/** Lists provider credentials as browser-safe summaries. */
export async function loadProviderCredentialSummaries(): Promise<ProviderCredentialSummaryMap> {
  const document = await loadProviderCredentialDocument();
  return Object.fromEntries(
    Object.entries(document.credentials).map(([provider, credential]) => [
      provider,
      summarizeProviderCredential(credential),
    ])
  );
}

/** Atomically writes credentials with owner-only permissions where supported. */
async function writeProviderCredentialDocument(
  document: ProviderCredentialDocument
): Promise<void> {
  const directory = await ensureOrionDataDirectory();
  const filePath = getProviderCredentialsFilePath();
  const tempPath = path.join(
    directory,
    `.credentials.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`
  );

  try {
    const serialized = `${JSON.stringify(document, null, 2)}\n`;
    await writeFile(tempPath, serialized, { encoding: "utf8", mode: 0o600 });
    await chmod(tempPath, 0o600).catch(() => undefined);
    await rename(tempPath, filePath);
    await chmod(filePath, 0o600).catch(() => undefined);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Serializes credential mutations inside this Orion process. */
async function updateProviderCredentialDocument<T>(
  updater: (document: ProviderCredentialDocument) => T | Promise<T>
): Promise<T> {
  const run = writeChain
    .catch(() => undefined)
    .then(async () => {
      const document = await loadProviderCredentialDocument();
      return updater(document);
    });
  writeChain = run.catch(() => undefined);
  return run;
}

/** Saves one provider credential and returns its safe summary. */
export async function saveProviderCredential(
  provider: ProviderId,
  credential: StoredProviderCredential
): Promise<ProviderCredentialSummary> {
  return updateProviderCredentialDocument(async (document) => {
    const existing = document.credentials[provider];
    const nextCredential =
      credential.type === "local_endpoint" &&
      existing?.type === "local_endpoint" &&
      credential.apiKey === undefined &&
      existing.apiKey !== undefined
        ? { ...credential, apiKey: existing.apiKey }
        : credential;
    document.credentials[provider] = nextCredential;
    await writeProviderCredentialDocument(document);
    return summarizeProviderCredential(nextCredential);
  });
}

/** Removes one provider credential. */
export async function removeProviderCredential(provider: ProviderId): Promise<void> {
  await updateProviderCredentialDocument(async (document) => {
    if (!(provider in document.credentials)) return;
    delete document.credentials[provider];
    await writeProviderCredentialDocument(document);
  });
}

/** Clears all provider credentials. */
export async function clearProviderCredentials(): Promise<void> {
  await rm(getProviderCredentialsFilePath(), { force: true });
}

/** Imports legacy browser/settings credentials, preserving existing server values. */
export async function migrateLegacyProviderCredentials(
  credentials: Record<string, unknown>
): Promise<ProviderCredentialSummaryMap> {
  return updateProviderCredentialDocument(async (document) => {
    let changed = false;
    for (const [provider, rawCredential] of Object.entries(credentials)) {
      if (provider in document.credentials) continue;
      const parsed = StoredProviderCredentialSchema.safeParse(rawCredential);
      if (!parsed.success) continue;
      document.credentials[provider] = parsed.data;
      changed = true;
    }
    if (changed) {
      await writeProviderCredentialDocument(document);
    }
    return Object.fromEntries(
      Object.entries(document.credentials).map(([provider, credential]) => [
        provider,
        summarizeProviderCredential(credential),
      ])
    );
  });
}

/** Returns the stored credential for one provider, or undefined if absent. */
export async function getStoredProviderCredential(
  provider: ProviderId
): Promise<StoredProviderCredential | undefined> {
  const document = await loadProviderCredentialDocument();
  return document.credentials[provider];
}

/** Refreshes an expiring ChatGPT OAuth credential once per provider at a time. */
async function refreshOAuthCredentialIfNeeded(
  provider: ProviderId,
  credential: StoredProviderCredential
): Promise<StoredProviderCredential> {
  if (credential.type !== "chatgpt_oauth") return credential;
  if (credential.expiresAt >= Date.now() + 60_000) return credential;

  const existing = oauthRefreshes.get(provider);
  if (existing) return existing;

  const refreshPromise = (async () => {
    const tokens = await refreshAccessToken(credential.refreshToken);
    const jwtToInspect = tokens.id_token ?? tokens.access_token;
    const accountId = extractAccountId(jwtToInspect);
    const refreshed: StoredProviderCredential = {
      type: "chatgpt_oauth",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      ...(accountId && { accountId }),
    };
    await saveProviderCredential(provider, refreshed);
    return refreshed;
  })();

  oauthRefreshes.set(provider, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    oauthRefreshes.delete(provider);
  }
}

/** Converts a stored credential into the request-scoped model gateway credential. */
export async function resolveProviderCredentialForModel(
  provider: ProviderId,
  modelId: string
): Promise<CredentialMode | undefined> {
  const credential = await getStoredProviderCredential(provider);
  if (!credential) return undefined;

  const refreshed = await refreshOAuthCredentialIfNeeded(provider, credential);
  if (refreshed.type === "api_key") {
    return {
      type: "byok",
      apiKey: refreshed.apiKey,
      ...(refreshed.baseUrl && { baseUrl: refreshed.baseUrl }),
    };
  }

  if (refreshed.type === "chatgpt_oauth") {
    return {
      type: "chatgpt_oauth",
      accessToken: refreshed.accessToken,
      ...(refreshed.accountId && { accountId: refreshed.accountId }),
    };
  }

  let runtimeModelId = modelId;
  if (isLocalProvider(provider)) {
    runtimeModelId =
      resolveLocalRuntimeModelId(provider, modelId, refreshed) ?? refreshed.modelId;
  } else {
    const decoded = decodeLocalModelCatalogId(modelId);
    if (decoded) runtimeModelId = decoded.providerModelId;
  }

  const configuredModel = isLocalProvider(provider)
    ? normalizeLocalEndpointModels(provider, refreshed).find(
        (model) => model.modelId === runtimeModelId
      )
    : refreshed.models?.find((model) => model.modelId === runtimeModelId);

  return {
    type: "local_endpoint",
    baseUrl: refreshed.baseUrl,
    modelId: runtimeModelId,
    label:
      configuredModel?.label ??
      refreshed.label ??
      runtimeModelId,
    ...(refreshed.models && { models: refreshed.models }),
    ...(refreshed.apiKey && { apiKey: refreshed.apiKey }),
  };
}
