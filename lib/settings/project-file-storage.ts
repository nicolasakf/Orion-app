import { createDefaultProjectSettingsDocument } from "@/lib/settings/defaults";
import { parseProjectSettingsDocumentFromJson } from "@/lib/settings/migrations";
import type { ProjectSettingsDocument } from "@/lib/settings/schema";

type FileHandleWithPermissions = FileSystemFileHandle & {
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

const writeQueue = new WeakMap<FileSystemFileHandle, Promise<void>>();

async function getPermissionState(
  handle: FileHandleWithPermissions,
  mode: "read" | "readwrite",
  request: boolean
): Promise<PermissionState | "granted"> {
  if (typeof handle.queryPermission === "function") {
    const current = await handle.queryPermission({ mode });
    if (current === "granted") {
      return "granted";
    }
  }

  if (!request) {
    return "prompt";
  }

  if (typeof handle.requestPermission === "function") {
    return handle.requestPermission({ mode });
  }

  // Fallback for browsers where permission APIs are unavailable.
  return "granted";
}

export async function hasProjectSettingsReadPermission(
  handle: FileSystemFileHandle
): Promise<boolean> {
  const permission = await getPermissionState(
    handle as FileHandleWithPermissions,
    "read",
    false
  );
  return permission === "granted";
}

export async function ensureProjectSettingsReadPermission(
  handle: FileSystemFileHandle
): Promise<boolean> {
  const permission = await getPermissionState(
    handle as FileHandleWithPermissions,
    "read",
    true
  );
  return permission === "granted";
}

export async function ensureProjectSettingsReadWritePermission(
  handle: FileSystemFileHandle
): Promise<boolean> {
  const permission = await getPermissionState(
    handle as FileHandleWithPermissions,
    "readwrite",
    true
  );
  return permission === "granted";
}

export async function loadProjectSettingsFromFile(
  handle: FileSystemFileHandle
): Promise<ProjectSettingsDocument> {
  const canRead = await ensureProjectSettingsReadPermission(handle);
  if (!canRead) {
    throw new Error("Read permission was not granted for project settings file.");
  }

  const file = await handle.getFile();
  const text = await file.text();
  if (!text.trim()) {
    return createDefaultProjectSettingsDocument();
  }

  return parseProjectSettingsDocumentFromJson(text);
}

export async function saveProjectSettingsToFile(
  handle: FileSystemFileHandle,
  document: ProjectSettingsDocument
): Promise<void> {
  const canWrite = await ensureProjectSettingsReadWritePermission(handle);
  if (!canWrite) {
    throw new Error("Write permission was not granted for project settings file.");
  }

  const previous = writeQueue.get(handle) ?? Promise.resolve();
  const next = previous.then(async () => {
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(document, null, 2));
    await writable.close();
  });
  writeQueue.set(
    handle,
    next.catch(() => {
      // Keep queue usable after a failed write.
    })
  );

  await next;
}
