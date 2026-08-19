// @vitest-environment node

import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET, PUT } from "@/app/api/onboarding/answers/route";

let tempDirectory: string;

/** Builds a PUT request carrying the three onboarding answers. */
function putRequest(body: unknown): Request {
  return new Request("http://localhost/api/onboarding/answers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "orion-answers-api-"));
  process.env.ORION_HOME_DIR = tempDirectory;
});

afterEach(async () => {
  delete process.env.ORION_HOME_DIR;
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("onboarding answers API", () => {
  it("returns blank answers before anything is saved", async () => {
    await expect(GET().then((response) => response.json())).resolves.toMatchObject({
      answers: { companyDescription: "", roleDescription: "", helpGoal: "" },
    });
  });

  it("round-trips the three answers", async () => {
    const answers = {
      version: 1,
      companyDescription: "We sell wholesale coffee to cafés.",
      roleDescription: "I run finance and reporting.",
      helpGoal: "Monthly margin reporting.",
      updatedAt: new Date().toISOString(),
    };
    expect((await PUT(putRequest(answers))).status).toBe(200);
    await expect(GET().then((response) => response.json())).resolves.toEqual({ answers });
  });

  it("rejects malformed answers", async () => {
    const response = await PUT(putRequest({ version: 2 }));
    expect(response.status).toBe(400);
  });

  it("rejects credential-like answers", async () => {
    const response = await PUT(
      putRequest({
        version: 1,
        companyDescription: "our key is sk-proj-1234567890123456789012345",
        roleDescription: "",
        helpGoal: "",
        updatedAt: new Date().toISOString(),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringContaining("credential"),
    });
  });
});
