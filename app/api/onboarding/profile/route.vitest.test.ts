// @vitest-environment node

import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DELETE, GET, PUT } from "@/app/api/onboarding/profile/route";

let tempDirectory: string;

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "orion-profile-api-"));
  process.env.ORION_HOME_DIR = tempDirectory;
});

afterEach(async () => {
  delete process.env.ORION_HOME_DIR;
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("personal context profile API", () => {
  it("reads, writes, and deletes the local profile", async () => {
    await expect(GET().then((response) => response.json())).resolves.toMatchObject({
      exists: false,
      content: "",
      blockedForModel: false,
    });

    const saveResponse = await PUT(
      new Request("http://localhost/api/onboarding/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "# Orion User Context\n\n## Work context\nFinance" }),
      }),
    );
    expect(saveResponse.status).toBe(200);
    await expect(saveResponse.json()).resolves.toMatchObject({
      exists: true,
      blockedForModel: false,
    });

    expect((await DELETE()).status).toBe(204);
    await expect(GET().then((response) => response.json())).resolves.toMatchObject({
      exists: false,
    });
  });

  it("rejects credential-like profile content", async () => {
    const response = await PUT(
      new Request("http://localhost/api/onboarding/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "sk-proj-1234567890123456789012345" }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringContaining("credential"),
    });
  });
});
