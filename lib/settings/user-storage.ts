import type { UserSettingsDocument } from "@/lib/settings/schema";
import { migrateUserSettingsDocument } from "@/lib/settings/migrations";

const DB_NAME = "OrionSettingsStorage";
const DB_VERSION = 1;
const STORE_NAME = "userSettings";
const RECORD_ID = "default";

interface UserSettingsRecord {
  id: string;
  document: unknown;
  updatedAt: string;
}

function supportsIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

async function openSettingsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getUserSettingsDocument(): Promise<UserSettingsDocument | null> {
  if (!supportsIndexedDb()) return null;

  try {
    const db = await openSettingsDb();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(RECORD_ID);

      request.onsuccess = () => {
        const result = request.result as UserSettingsRecord | undefined;
        if (!result) {
          resolve(null);
          return;
        }

        resolve(migrateUserSettingsDocument(result.document));
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("Failed to load user settings from IndexedDB:", error);
    return null;
  }
}

export async function setUserSettingsDocument(document: UserSettingsDocument): Promise<void> {
  if (!supportsIndexedDb()) return;

  const db = await openSettingsDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({
      id: RECORD_ID,
      document,
      updatedAt: new Date().toISOString(),
    } satisfies UserSettingsRecord);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearUserSettingsDocument(): Promise<void> {
  if (!supportsIndexedDb()) return;

  const db = await openSettingsDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(RECORD_ID);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
