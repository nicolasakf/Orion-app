const DB_NAME = "OrionSettingsStorage";
const DB_VERSION = 1;
const STORE_NAME = "projectSettingsHandles";
const DEFAULT_PROJECT_ID = "default-project";

interface ProjectSettingsHandleRecord {
  id: string;
  fileName: string;
  updatedAt: string;
  handle: FileSystemFileHandle;
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

export async function getProjectSettingsHandle(
  projectId: string = DEFAULT_PROJECT_ID
): Promise<FileSystemFileHandle | null> {
  if (!supportsIndexedDb()) return null;

  try {
    const db = await openSettingsDb();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(projectId);

      request.onsuccess = () => {
        const result = request.result as ProjectSettingsHandleRecord | undefined;
        resolve(result?.handle ?? null);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("Failed to load project settings handle from IndexedDB:", error);
    return null;
  }
}

export async function setProjectSettingsHandle(
  handle: FileSystemFileHandle,
  projectId: string = DEFAULT_PROJECT_ID
): Promise<void> {
  if (!supportsIndexedDb()) return;

  const db = await openSettingsDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({
      id: projectId,
      handle,
      fileName: handle.name,
      updatedAt: new Date().toISOString(),
    } satisfies ProjectSettingsHandleRecord);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearProjectSettingsHandle(
  projectId: string = DEFAULT_PROJECT_ID
): Promise<void> {
  if (!supportsIndexedDb()) return;

  const db = await openSettingsDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(projectId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export { DEFAULT_PROJECT_ID };
