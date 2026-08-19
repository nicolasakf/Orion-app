/**
 * Server-only store for Orion connections, persisted at `~/.orion/connections.json`.
 *
 * Mirrors the durability rules of `lib/credentials/provider-credential-store.server.ts`
 * — validated document, atomic replace, owner-only file mode, serialized writes —
 * but keeps a separate file so model-provider secrets and the user's business
 * credentials never share a blast radius.
 */

import { readFile, rename, rm, writeFile, chmod } from "fs/promises";
import path from "path";

import {
  ensureOrionDataDirectory,
  getConnectionsFilePath,
} from "@/lib/local/orion-paths.server";
import {
  CONNECTIONS_DOCUMENT_VERSION,
  ConnectionDocumentSchema,
  MAX_CONNECTIONS,
  summarizeConnection,
  type ConnectionDocument,
  type ConnectionSummary,
  type StoredConnection,
} from "@/lib/connections/types";

const emptyDocument: ConnectionDocument = {
  version: CONNECTIONS_DOCUMENT_VERSION,
  connections: {},
};

/** Serializes mutations inside this Orion process, as the credential store does. */
let writeChain: Promise<unknown> = Promise.resolve();

/** Reads and validates the connections file; a missing file is an empty store. */
export async function loadConnectionDocument(): Promise<ConnectionDocument> {
  const filePath = getConnectionsFilePath();

  try {
    const raw = await readFile(filePath, "utf8");
    return ConnectionDocumentSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(emptyDocument);
    }
    throw error;
  }
}

/** Lists connections as summaries that never carry secret values. */
export async function listConnectionSummaries(): Promise<ConnectionSummary[]> {
  const document = await loadConnectionDocument();
  return Object.values(document.connections)
    .map(summarizeConnection)
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Atomically writes the connections file with owner-only permissions. */
async function writeConnectionDocument(document: ConnectionDocument): Promise<void> {
  const directory = await ensureOrionDataDirectory();
  const filePath = getConnectionsFilePath();
  const tempPath = path.join(
    directory,
    `.connections.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`,
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

/** Runs one mutation against a freshly read document, serialized against others. */
async function updateConnectionDocument<T>(
  updater: (document: ConnectionDocument) => T | Promise<T>,
): Promise<T> {
  const run = writeChain
    .catch(() => undefined)
    .then(async () => {
      const document = await loadConnectionDocument();
      return updater(document);
    });
  writeChain = run.catch(() => undefined);
  return run;
}

/** Input accepted when creating or replacing a connection. */
export type SaveConnectionInput = Omit<
  StoredConnection,
  "createdAt" | "updatedAt" | "lastVerifiedAt"
> & {
  lastVerifiedAt?: string;
};

/**
 * Creates or replaces one connection and returns its safe summary.
 *
 * `createdAt` is preserved across updates so the settings tab can show when a
 * connection was first established rather than when it was last edited.
 */
export async function saveConnection(
  input: SaveConnectionInput,
): Promise<ConnectionSummary> {
  return updateConnectionDocument(async (document) => {
    const existing = document.connections[input.id];
    if (!existing && Object.keys(document.connections).length >= MAX_CONNECTIONS) {
      throw new Error(`Cannot store more than ${MAX_CONNECTIONS} connections.`);
    }

    const now = new Date().toISOString();
    const next: StoredConnection = {
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(input.lastVerifiedAt !== undefined
        ? { lastVerifiedAt: input.lastVerifiedAt }
        : existing?.lastVerifiedAt
          ? { lastVerifiedAt: existing.lastVerifiedAt }
          : {}),
    };

    document.connections[input.id] = next;
    await writeConnectionDocument(document);
    return summarizeConnection(next);
  });
}

/**
 * Merges secrets and config into an existing connection.
 *
 * Used by the OAuth engine on token refresh, where only the token fields change
 * and the rest of the record must survive untouched.
 */
export async function patchConnection(
  id: string,
  patch: Partial<Pick<StoredConnection, "secrets" | "config" | "scopes" | "expiresAt" | "label">>,
): Promise<ConnectionSummary | undefined> {
  return updateConnectionDocument(async (document) => {
    const existing = document.connections[id];
    if (!existing) return undefined;

    const next: StoredConnection = {
      ...existing,
      ...(patch.label !== undefined && { label: patch.label }),
      ...(patch.scopes !== undefined && { scopes: patch.scopes }),
      ...(patch.expiresAt !== undefined && { expiresAt: patch.expiresAt }),
      secrets: { ...existing.secrets, ...(patch.secrets ?? {}) },
      config: { ...existing.config, ...(patch.config ?? {}) },
      updatedAt: new Date().toISOString(),
    };

    document.connections[id] = next;
    await writeConnectionDocument(document);
    return summarizeConnection(next);
  });
}

/** Records a successful verification read against a connection. */
export async function markConnectionVerified(
  id: string,
): Promise<ConnectionSummary | undefined> {
  return updateConnectionDocument(async (document) => {
    const existing = document.connections[id];
    if (!existing) return undefined;

    const next: StoredConnection = {
      ...existing,
      lastVerifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    document.connections[id] = next;
    await writeConnectionDocument(document);
    return summarizeConnection(next);
  });
}

/** Removes one connection. Returns true when something was actually deleted. */
export async function removeConnection(id: string): Promise<boolean> {
  return updateConnectionDocument(async (document) => {
    if (!(id in document.connections)) return false;
    delete document.connections[id];
    await writeConnectionDocument(document);
    return true;
  });
}

/**
 * Returns one stored connection *including secrets*.
 *
 * Server-only, and never routed to the browser or the model: the credential
 * broker and the OAuth engine are the only intended callers.
 */
export async function getStoredConnection(
  id: string,
): Promise<StoredConnection | undefined> {
  const document = await loadConnectionDocument();
  return document.connections[id];
}
