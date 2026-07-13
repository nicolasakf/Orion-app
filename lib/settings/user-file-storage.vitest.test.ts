// @vitest-environment node

import { mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearUserSettingsFile,
  loadUserSettingsDocument,
  loadUserSettingsDocumentWithStatus,
  saveUserSettingsDocument,
} from "@/lib/settings/user-file-storage.server";
import { createDefaultUserSettingsDocument } from "@/lib/settings/defaults";

let tempDirectory: string;

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "orion-settings-"));
  process.env.ORION_HOME_DIR = tempDirectory;
});

afterEach(async () => {
  delete process.env.ORION_HOME_DIR;
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("user file settings storage", () => {
  it("returns defaults without creating a file when the settings file is missing", async () => {
    await expect(loadUserSettingsDocument()).resolves.toEqual(
      createDefaultUserSettingsDocument()
    );
    await expect(
      readFile(path.join(tempDirectory, "settings.json"), "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports missing settings separately from loaded settings", async () => {
    await expect(loadUserSettingsDocumentWithStatus()).resolves.toEqual({
      status: "missing",
      document: createDefaultUserSettingsDocument(),
    });

    await saveUserSettingsDocument(createDefaultUserSettingsDocument());

    const raw = await readFile(path.join(tempDirectory, "settings.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({
      version: 1,
      settings: {
        onboarding: { signInStepCompleted: false },
        providers: { inferenceProviderChosen: false },
      },
    });

    await expect(loadUserSettingsDocumentWithStatus()).resolves.toEqual({
      status: "loaded",
      document: createDefaultUserSettingsDocument(),
    });
  });

  it("saves settings atomically, strips secrets, and omits default-equal keys", async () => {
    const document = structuredClone(createDefaultUserSettingsDocument());
    document.settings.appearance.theme = "dark";
    document.settings.agent.context.compactionRetentionTurns = 8;
    document.settings.providers.credentials.openai = {
      type: "api_key",
      configured: true,
    };

    const saved = await saveUserSettingsDocument(document);
    const raw = await readFile(path.join(tempDirectory, "settings.json"), "utf8");
    const persisted = JSON.parse(raw) as typeof saved;

    expect(saved.settings).toEqual({
      onboarding: { signInStepCompleted: false },
      appearance: { theme: "dark" },
      agent: {
        context: {
          compactionRetentionTurns: 8,
        },
      },
      providers: { inferenceProviderChosen: false },
    });
    expect(persisted.settings).toEqual(saved.settings);
    expect(persisted.settings.providers?.credentials).toBeUndefined();
  });

  it("rejects malformed settings JSON", async () => {
    await writeFile(path.join(tempDirectory, "settings.json"), "{", "utf8");

    await expect(loadUserSettingsDocument()).rejects.toThrow();
  });

  it("clears the settings file", async () => {
    await saveUserSettingsDocument(createDefaultUserSettingsDocument());
    await clearUserSettingsFile();

    await expect(
      readFile(path.join(tempDirectory, "settings.json"), "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("creates a backup in settings-backup before overwriting settings.json", async () => {
    const document = structuredClone(createDefaultUserSettingsDocument());
    document.settings.appearance.theme = "dark";

    await saveUserSettingsDocument(document);

    document.settings.chat.fontSize = 14;
    await saveUserSettingsDocument(document);

    const backupDirectory = path.join(tempDirectory, "settings-backup");
    const backupFiles = await readdir(backupDirectory);
    expect(backupFiles).toHaveLength(1);

    const backedUp = await readFile(path.join(backupDirectory, backupFiles[0]!), "utf8");
    expect(JSON.parse(backedUp)).toEqual({
      version: 1,
      settings: {
        onboarding: { signInStepCompleted: false },
        appearance: { theme: "dark" },
        providers: { inferenceProviderChosen: false },
      },
    });
  });
});
