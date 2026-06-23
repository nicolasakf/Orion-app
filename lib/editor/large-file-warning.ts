export const LARGE_FILE_WARNING_THRESHOLD_BYTES = 10 * 1024 * 1024;

/**
 * Formats byte counts for editor warnings using binary units.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";

  const units = ["bytes", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}
