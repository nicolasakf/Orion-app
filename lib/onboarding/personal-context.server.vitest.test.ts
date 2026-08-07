// @vitest-environment node

import { mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearInterviewTranscript,
  deletePersonalContext,
  loadInterviewTranscript,
  loadPersonalContext,
  saveInterviewTranscript,
  savePersonalContext,
} from "@/lib/onboarding/personal-context.server";
import {
  MAX_PERSONAL_CONTEXT_BYTES,
  MAX_PERSONAL_CONTEXT_CHARS,
} from "@/lib/onboarding/personal-context";

let tempDirectory: string;

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "orion-personal-context-"));
  process.env.ORION_HOME_DIR = tempDirectory;
});

afterEach(async () => {
  delete process.env.ORION_HOME_DIR;
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("personal context storage", () => {
  it("atomically saves, loads, and deletes ORION.md", async () => {
    await savePersonalContext("# Orion User Context\n\n## Work context\nRetail operations");

    const loaded = await loadPersonalContext();
    expect(loaded.exists).toBe(true);
    expect(loaded.content).toContain("Retail operations");
    expect(await readFile(path.join(tempDirectory, "ORION.md"), "utf8")).toMatch(/\n$/);
    if (process.platform !== "win32") {
      expect((await stat(path.join(tempDirectory, "ORION.md"))).mode & 0o777).toBe(0o600);
    }

    await deletePersonalContext();
    await expect(loadPersonalContext()).resolves.toMatchObject({ exists: false });
  });

  it("rejects oversized content and high-confidence credentials", async () => {
    await expect(savePersonalContext("x".repeat(MAX_PERSONAL_CONTEXT_CHARS + 1))).rejects.toThrow(
      "cannot exceed",
    );
    await expect(savePersonalContext("é".repeat(MAX_PERSONAL_CONTEXT_BYTES))).rejects.toThrow(
      "cannot exceed",
    );
    await expect(savePersonalContext("token: sk-proj-1234567890123456789012345")).rejects.toThrow(
      "credential",
    );
  });

  it("safely truncates an oversized manually edited file for prompt use", async () => {
    await writeFile(
      path.join(tempDirectory, "ORION.md"),
      "z".repeat(MAX_PERSONAL_CONTEXT_CHARS + 100),
      "utf8",
    );
    const loaded = await loadPersonalContext();
    expect(loaded.truncated).toBe(true);
    expect(loaded.content).toHaveLength(MAX_PERSONAL_CONTEXT_CHARS);
  });
});

describe("personal context interview storage", () => {
  it("persists and clears the private resumable transcript", async () => {
    const transcript = {
      version: 1 as const,
      messages: [
        {
          id: "answer-1",
          role: "user" as const,
          content: "Our reports live in the Finance folder.",
          createdAt: new Date().toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    await saveInterviewTranscript(transcript);
    await expect(loadInterviewTranscript()).resolves.toEqual(transcript);

    await clearInterviewTranscript();
    await expect(loadInterviewTranscript()).resolves.toMatchObject({ messages: [] });
  });
});
