import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveProviderCredentialForModel: vi.fn(),
}));

vi.mock("@/lib/credentials/provider-credential-store.server", () => ({
  resolveProviderCredentialForModel: mocks.resolveProviderCredentialForModel,
}));

import { POST } from "./route";

/** Builds a title-generation model validation request. */
function request(): Request {
  return new Request("http://orion.test/api/models/title-generation/validate", {
    method: "POST",
    body: JSON.stringify({ provider: "openai", model: "gpt-test" }),
  });
}

describe("POST /api/models/title-generation/validate", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("returns credential-resolution failures as validation results", async () => {
    mocks.resolveProviderCredentialForModel.mockRejectedValue(
      new Error("Token refresh failed; sign in again."),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      valid: false,
      message: "Token refresh failed; sign in again.",
    });
  });
});
