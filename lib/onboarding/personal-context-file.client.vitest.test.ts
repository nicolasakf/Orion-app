import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadPersonalContextFileFromApi,
  savePersonalContextFileToApi,
} from "@/lib/onboarding/personal-context-file.client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("personal context file client", () => {
  it("loads ORION.md from the profile API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          content: "# Orion User Context\n",
          exists: true,
          truncated: false,
          blockedForModel: false,
        }),
      ),
    );

    await expect(loadPersonalContextFileFromApi()).resolves.toEqual({
      content: "# Orion User Context\n",
      exists: true,
    });
  });

  it("saves ORION.md through the profile API", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        content: "Updated context\n",
        exists: true,
        truncated: false,
        blockedForModel: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await savePersonalContextFileToApi("Updated context");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding/profile",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ content: "Updated context" }),
      }),
    );
  });

  it("surfaces API error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { message: "Personal context appears to contain a credential or private key." },
          { status: 400 },
        ),
      ),
    );

    await expect(savePersonalContextFileToApi("sk-proj-1234567890123456789012345")).rejects.toThrow(
      /credential/,
    );
  });
});
