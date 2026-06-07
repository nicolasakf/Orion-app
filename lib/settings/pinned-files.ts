import { MAX_PINNED_FILE_PATHS } from "@/lib/settings/schema";

/** Returns the display name for a Jupyter-relative file path. */
export function deriveFileNameFromPinnedPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/** Toggles a file path in the pinned list, respecting the max pin limit. */
export function togglePinnedFilePath(
  paths: readonly string[],
  path: string,
): string[] {
  if (!path) return [...paths];

  const list = [...paths];
  const idx = list.indexOf(path);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else if (list.length < MAX_PINNED_FILE_PATHS && !list.includes(path)) {
    list.push(path);
  }
  return list;
}

/** Updates pinned file paths after a workspace tree rename. */
export function updatePinnedFilePathsAfterRename(
  paths: readonly string[],
  payload: {
    oldPath: string;
    newPath: string;
    itemType: "file" | "folder";
  },
): string[] {
  return paths.map((filePath) => {
    if (payload.itemType === "file") {
      return filePath === payload.oldPath ? payload.newPath : filePath;
    }
    if (filePath === payload.oldPath) {
      return payload.newPath;
    }
    const prefix = `${payload.oldPath}/`;
    if (filePath.startsWith(prefix)) {
      return payload.newPath + filePath.slice(payload.oldPath.length);
    }
    return filePath;
  });
}

/** Removes pinned file paths that match a deleted tree item. */
export function filterPinnedFilePathsAfterDelete(
  paths: readonly string[],
  payload: { path: string; itemType: "file" | "folder" },
): string[] {
  const prefix = `${payload.path}/`;
  const pathMatches = (filePath: string) =>
    payload.itemType === "file"
      ? filePath === payload.path
      : filePath === payload.path || filePath.startsWith(prefix);
  return paths.filter((filePath) => !pathMatches(filePath));
}
