// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

    await expect(loadUserSettingsDocumentWithStatus()).resolves.toEqual({
      status: "loaded",
      document: createDefaultUserSettingsDocument(),
    });
  });

  it("saves settings atomically and strips provider credentials", async () => {
    const document = structuredClone(createDefaultUserSettingsDocument());
    document.settings.appearance.theme = "dark";
    document.settings.providers.credentials.openai = {
      type: "api_key",
      apiKey: "sk-test",
    };

    const saved = await saveUserSettingsDocument(document);
    const raw = await readFile(path.join(tempDirectory, "settings.json"), "utf8");
    const persisted = JSON.parse(raw) as typeof saved;

    expect(saved.settings.appearance.theme).toBe("dark");
    expect(saved.settings.providers.credentials).toEqual({});
    expect(persisted.settings.providers.credentials).toEqual({});
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
});
