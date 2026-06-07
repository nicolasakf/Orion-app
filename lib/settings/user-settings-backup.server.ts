import { copyFile, readdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";

import {
  ensureUserSettingsBackupDirectory,
  getUserSettingsFilePath,
} from "@/lib/local/orion-paths.server";

/** Maximum number of timestamped settings backups kept on disk. */
export const MAX_USER_SETTINGS_BACKUPS = 30;

const SETTINGS_BACKUP_PREFIX = "settings-";
const SETTINGS_BACKUP_SUFFIX = ".json";

/** Builds a filesystem-safe timestamped backup filename for user settings. */
export function formatUserSettingsBackupFileName(date: Date = new Date()): string {
  const stamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/, "")
    .replace(/:/g, "-");
  return `${SETTINGS_BACKUP_PREFIX}${stamp}Z${SETTINGS_BACKUP_SUFFIX}`;
}

/** Returns true when the filename looks like a user settings backup file. */
export function isUserSettingsBackupFileName(fileName: string): boolean {
  return (
    fileName.startsWith(SETTINGS_BACKUP_PREFIX) &&
    fileName.endsWith(SETTINGS_BACKUP_SUFFIX)
  );
}

/**
 * Copies the current `settings.json` into `~/.orion/settings-backup` before it is
 * overwritten. Skips when the file is missing, empty, or identical to the latest backup.
 */
export async function backupUserSettingsFileBeforeSave(): Promise<void> {
  const filePath = getUserSettingsFilePath();

  let currentContent: string;
  try {
    currentContent = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (currentContent.trim().length === 0) {
    return;
  }

  const backupDirectory = await ensureUserSettingsBackupDirectory();
  const latestBackupPath = await getLatestUserSettingsBackupPath(backupDirectory);
  if (latestBackupPath) {
    const latestContent = await readFile(latestBackupPath, "utf8");
    if (latestContent === currentContent) {
      return;
    }
  }

  const backupPath = path.join(
    backupDirectory,
    formatUserSettingsBackupFileName()
  );
  await writeFile(backupPath, currentContent, "utf8");
  await pruneUserSettingsBackups(backupDirectory, MAX_USER_SETTINGS_BACKUPS);
}

/** Returns backup files sorted oldest-first by modification time. */
export async function listUserSettingsBackupFiles(
  backupDirectory: string
): Promise<string[]> {
  const entries = await readdir(backupDirectory);
  const backupFiles = entries.filter(isUserSettingsBackupFileName);
  const filesWithMtime = await Promise.all(
    backupFiles.map(async (fileName) => {
      const filePath = path.join(backupDirectory, fileName);
      const fileStat = await stat(filePath);
      return { filePath, mtimeMs: fileStat.mtimeMs };
    })
  );

  return filesWithMtime
    .sort((left, right) => left.mtimeMs - right.mtimeMs)
    .map((entry) => entry.filePath);
}

/** Deletes oldest backups when the directory exceeds the configured retention limit. */
export async function pruneUserSettingsBackups(
  backupDirectory: string,
  maxBackups: number = MAX_USER_SETTINGS_BACKUPS
): Promise<void> {
  if (maxBackups <= 0) {
    return;
  }

  const backupFiles = await listUserSettingsBackupFiles(backupDirectory);
  const filesToDelete = backupFiles.slice(0, Math.max(0, backupFiles.length - maxBackups));
  await Promise.all(filesToDelete.map((filePath) => unlink(filePath)));
}

/** Restores user settings from a backup file path under `~/.orion/settings-backup`. */
export async function restoreUserSettingsFromBackup(
  backupFileName: string
): Promise<void> {
  const backupDirectory = await ensureUserSettingsBackupDirectory();
  const backupPath = path.join(backupDirectory, backupFileName);
  if (!isUserSettingsBackupFileName(backupFileName)) {
    throw new Error("Backup file name is invalid.");
  }

  await copyFile(backupPath, getUserSettingsFilePath());
}

async function getLatestUserSettingsBackupPath(
  backupDirectory: string
): Promise<string | null> {
  const backupFiles = await listUserSettingsBackupFiles(backupDirectory);
  return backupFiles.at(-1) ?? null;
}
