import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBrowserOAuthFlowStatus: vi.fn(),
  getStoredProviderCredential: vi.fn(),
  summarizeProviderCredential: vi.fn(),
}));

vi.mock("@/lib/credentials/chatgpt-browser-oauth.server", () => ({
  getBrowserOAuthFlowStatus: mocks.getBrowserOAuthFlowStatus,
}));

vi.mock("@/lib/credentials/provider-credential-store.server", () => ({
  getStoredProviderCredential: mocks.getStoredProviderCredential,
  summarizeProviderCredential: mocks.summarizeProviderCredential,
}));

import { POST } from "./route";

/** Builds a browser OAuth status request with the supplied flow ID. */
function request(flowId = "flow-123"): Request {
  return new Request("http://orion.test/api/credentials/oauth/browser/status", {
    method: "POST",
    body: JSON.stringify({ flowId }),
  });
}

describe("POST /api/credentials/oauth/browser/status", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("reports success when the transient flow is unavailable but OAuth was saved", async () => {
    const credential = {
      type: "chatgpt_oauth" as const,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 1_800_000_000_000,
    };
    const summary = {
      type: "chatgpt_oauth" as const,
      configured: true as const,
      expiresAt: credential.expiresAt,
    };
    mocks.getBrowserOAuthFlowStatus.mockReturnValue(undefined);
    mocks.getStoredProviderCredential.mockResolvedValue(credential);
    mocks.summarizeProviderCredential.mockReturnValue(summary);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "success", credential: summary });
    expect(mocks.getStoredProviderCredential).toHaveBeenCalledWith("openai");
  });
});
