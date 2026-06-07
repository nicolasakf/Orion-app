// @vitest-environment node

import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  backupUserSettingsFileBeforeSave,
  formatUserSettingsBackupFileName,
  isUserSettingsBackupFileName,
  listUserSettingsBackupFiles,
  MAX_USER_SETTINGS_BACKUPS,
  pruneUserSettingsBackups,
  restoreUserSettingsFromBackup,
} from "@/lib/settings/user-settings-backup.server";

let tempDirectory: string;

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "orion-settings-backup-"));
  process.env.ORION_HOME_DIR = tempDirectory;
});

afterEach(async () => {
  delete process.env.ORION_HOME_DIR;
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("user settings backup", () => {
  it("formats backup filenames with a stable prefix and suffix", () => {
    expect(
      formatUserSettingsBackupFileName(new Date("2026-06-06T13:00:45.123Z"))
    ).toBe("settings-2026-06-06T13-00-45Z.json");
    expect(isUserSettingsBackupFileName("settings-2026-06-06T13-00-45Z.json")).toBe(
      true
    );
    expect(isUserSettingsBackupFileName("settings.json")).toBe(false);
  });

  it("does not create a backup when settings.json is missing", async () => {
    await backupUserSettingsFileBeforeSave();

    await expect(readdir(path.join(tempDirectory, "settings-backup"))).rejects.toMatchObject(
      { code: "ENOENT" }
    );
  });

  it("creates a timestamped backup before overwriting existing settings", async () => {
    const settingsPath = path.join(tempDirectory, "settings.json");
    const original = '{\n  "version": 1,\n  "settings": { "appearance": { "theme": "dark" } }\n}\n';
    await writeFile(settingsPath, original, "utf8");

    await backupUserSettingsFileBeforeSave();
    await writeFile(settingsPath, '{\n  "version": 1,\n  "settings": {}\n}\n', "utf8");

    const backupDirectory = path.join(tempDirectory, "settings-backup");
    const backupFiles = await readdir(backupDirectory);
    expect(backupFiles).toHaveLength(1);
    expect(backupFiles[0]).toMatch(/^settings-.*\.json$/);

    const backedUp = await readFile(path.join(backupDirectory, backupFiles[0]!), "utf8");
    expect(backedUp).toBe(original);
  });

  it("skips duplicate backups when the current file matches the latest backup", async () => {
    const settingsPath = path.join(tempDirectory, "settings.json");
    const original = '{\n  "version": 1,\n  "settings": { "chat": { "fontSize": 13 } }\n}\n';
    await writeFile(settingsPath, original, "utf8");

    await backupUserSettingsFileBeforeSave();
    await backupUserSettingsFileBeforeSave();

    const backupDirectory = path.join(tempDirectory, "settings-backup");
    const backupFiles = await readdir(backupDirectory);
    expect(backupFiles).toHaveLength(1);
  });

  it("prunes oldest backups beyond the retention limit", async () => {
    const backupDirectory = path.join(tempDirectory, "settings-backup");
    await mkdir(backupDirectory, { recursive: true });
    await writeFile(path.join(tempDirectory, "settings.json"), "{}", "utf8");

    for (let index = 0; index < MAX_USER_SETTINGS_BACKUPS + 5; index += 1) {
      const fileName = `settings-2026-06-06T13-00-${String(index).padStart(2, "0")}Z.json`;
      const filePath = path.join(backupDirectory, fileName);
      await writeFile(filePath, `content-${index}`, "utf8");
      const mtimeSeconds = 1_700_000_000 + index;
      await utimes(filePath, mtimeSeconds, mtimeSeconds);
    }

    await pruneUserSettingsBackups(backupDirectory, MAX_USER_SETTINGS_BACKUPS);

    const remaining = await listUserSettingsBackupFiles(backupDirectory);
    expect(remaining).toHaveLength(MAX_USER_SETTINGS_BACKUPS);
    expect(await readFile(remaining[0]!, "utf8")).toBe("content-5");
    expect(await readFile(remaining.at(-1)!, "utf8")).toBe(
      `content-${MAX_USER_SETTINGS_BACKUPS + 4}`
    );
  });

  it("restores settings from a named backup file", async () => {
    const settingsPath = path.join(tempDirectory, "settings.json");
    const backupDirectory = path.join(tempDirectory, "settings-backup");
    const backupFileName = "settings-2026-06-06T13-00-45Z.json";
    const restored = '{\n  "version": 1,\n  "settings": { "appearance": { "theme": "light" } }\n}\n';

    await mkdir(backupDirectory, { recursive: true });
    await writeFile(path.join(backupDirectory, backupFileName), restored, "utf8");
    await writeFile(settingsPath, '{\n  "version": 1,\n  "settings": {}\n}\n', "utf8");

    await restoreUserSettingsFromBackup(backupFileName);

    expect(await readFile(settingsPath, "utf8")).toBe(restored);
  });
});
