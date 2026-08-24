// @vitest-environment node

import { mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deletePersonalContext,
  loadOnboardingAnswers,
  loadPersonalContext,
  loadPersonalContextForModel,
  saveOnboardingAnswers,
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

  it("keeps oversized editor content while truncating the model prompt", async () => {
    const oversized = "z".repeat(MAX_PERSONAL_CONTEXT_CHARS + 100);
    await writeFile(path.join(tempDirectory, "ORION.md"), oversized, "utf8");
    const loaded = await loadPersonalContext();
    expect(loaded.truncated).toBe(true);
    expect(loaded.content).toBe(oversized);
    await expect(loadPersonalContextForModel()).resolves.toHaveLength(
      MAX_PERSONAL_CONTEXT_CHARS,
    );
  });
});

describe("onboarding answers storage", () => {
  it("persists and reloads the three answers", async () => {
    const answers = {
      version: 1 as const,
      companyDescription: "We sell wholesale coffee to cafés.",
      roleDescription: "I run finance and reporting.",
      helpGoal: "Monthly margin reporting without the spreadsheet grind.",
      updatedAt: new Date().toISOString(),
    };
    await saveOnboardingAnswers(answers);
    await expect(loadOnboardingAnswers()).resolves.toEqual(answers);
  });

  it("returns blank answers before the questions screen is saved", async () => {
    await expect(loadOnboardingAnswers()).resolves.toEqual({
      version: 1,
      companyDescription: "",
      roleDescription: "",
      helpGoal: "",
    });
  });

  it("rejects answers that contain a credential", async () => {
    await expect(
      saveOnboardingAnswers({
        version: 1,
        companyDescription: "Our key is sk-proj-abcdefghijklmnopqrstuvwxyz012345",
        roleDescription: "",
        helpGoal: "",
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/credential/i);
  });

  it("removes the transcript left behind by the old chat interview", async () => {
    const legacy = path.join(tempDirectory, "personal-context-interview.json");
    await writeFile(legacy, JSON.stringify({ version: 1, messages: [] }), "utf8");
    await saveOnboardingAnswers({
      version: 1,
      companyDescription: "We run a bakery.",
      roleDescription: "",
      helpGoal: "",
      updatedAt: new Date().toISOString(),
    });
    await expect(stat(legacy)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
